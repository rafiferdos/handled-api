import { createHmac, randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const record = z.record(z.string(), z.unknown());
const rows = z.array(record);

/** A 202/200 receipt is insufficient: require the effect in a fresh account read. */
export function verifyBusinessEffect(
  actionInput: unknown,
  contextInput: unknown,
) {
  const action = record.parse(actionInput);
  check(action.simulation === true, 'Action must remain simulated');
  check(action.status === 'SUCCEEDED', 'Action did not succeed');
  const before = record.parse(action.beforeState);
  const after = record.parse(action.afterState);
  const context = record.parse(contextInput);
  check(
    typeof before.id === 'string' &&
      before.id.length > 0 &&
      before.id === after.id,
    'Action target identity changed',
  );
  if (action.type === 'REFUND_DUPLICATE_PAYMENT') {
    check(
      before.status === 'SETTLED' && after.status === 'REFUNDED',
      'Refund effect missing',
    );
    check(
      rows
        .parse(context.payments)
        .some((p) => p.id === after.id && p.status === 'REFUNDED'),
      'Persisted refund missing',
    );
  } else if (action.type === 'CANCEL_AT_PERIOD_END') {
    check(
      before.cancelAtPeriodEnd === false && after.cancelAtPeriodEnd === true,
      'Cancellation effect missing',
    );
    check(
      before.currentPeriodEnd === after.currentPeriodEnd,
      'Cancellation changed paid period',
    );
    check(
      rows
        .parse(context.subscriptions)
        .some(
          (s) =>
            s.id === after.id &&
            s.cancelAtPeriodEnd === true &&
            s.currentPeriodEnd === before.currentPeriodEnd,
        ),
      'Persisted cancellation missing',
    );
  } else if (action.type === 'RESTORE_PRODUCT_ACCESS') {
    check(
      before.status !== 'ACTIVE' && after.status === 'ACTIVE',
      'Restoration effect missing',
    );
    check(
      rows
        .parse(context.productAccess)
        .some((a) => a.id === after.id && a.status === 'ACTIVE'),
      'Persisted restoration missing',
    );
  } else throw new Error('Unexpected action type');
}

/** Never edit AI content to make this acceptance gate pass. */
export function verifyReadyProposal(
  proposalInput: unknown,
  expectedType: string,
) {
  const proposal = record.parse(proposalInput);
  check(
    proposal.status === 'READY' && proposal.confidence !== 'LOW',
    'Proposal is not eligible',
  );
  check(
    record.parse(proposal.recommendation).type === expectedType,
    'Unexpected AI recommendation',
  );
  const sources = rows.parse(proposal.sources);
  const refs = z.array(z.string()).parse(proposal.evidenceRefs);
  check(
    sources.some(
      (s) =>
        s.sourceType === 'KNOWLEDGE' && refs.includes(String(s.sourceRefId)),
    ),
    'Cited policy evidence missing',
  );
  check(
    sources.some(
      (s) => s.sourceType === 'TOOL' && refs.includes(String(s.sourceRefId)),
    ),
    'Cited account evidence missing',
  );
}

const configSchema = z.object({
  HANDLED_API_BASE_URL: z
    .url()
    .refine(
      (s) =>
        new URL(s).protocol === 'https:' || new URL(s).hostname === '127.0.0.1',
    ),
  HANDLED_ADMIN_ACCESS_TOKEN: z.string().min(1),
  HANDLED_FOREIGN_ACCESS_TOKEN: z.string().min(1),
  HANDLED_WORKSPACE_ID: z.uuid(),
  HANDLED_FOREIGN_WORKSPACE_ID: z.uuid(),
  HANDLED_PUBLIC_ORIGIN: z.url().refine((s) => new URL(s).origin === s),
  HANDLED_FORM_TOKEN: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  HANDLED_SUPPORT_PROXY_SECRET: z.string().min(32).optional(),
  HANDLED_ACCEPTANCE_STATE_FILE: z.string().refine(isAbsolute),
  HANDLED_ACCEPTANCE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30000)
    .max(600000)
    .default(240000),
});
const caseState = z.object({
  publicKey: z.uuid(),
  approvalKey: z.uuid(),
  ticketId: z.uuid().optional(),
  runId: z.uuid().optional(),
  actionId: z.uuid().optional(),
});
const stateSchema = z.object({
  workspaceId: z.uuid(),
  cases: z.record(z.string(), caseState),
});
type State = z.infer<typeof stateSchema>;

/** Explicitly scoped, resumable HTTP acceptance using real hosted API/worker/provider. */
export async function hostedAcceptance(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const parsed = configSchema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      'Explicit hosted acceptance configuration is missing or invalid',
    );
  const cfg = parsed.data;
  check(
    cfg.HANDLED_WORKSPACE_ID !== cfg.HANDLED_FOREIGN_WORKSPACE_ID,
    'Distinct tenant scopes required',
  );
  const base = cfg.HANDLED_API_BASE_URL.replace(/\/$/, '');
  const prefix = `/workspaces/${cfg.HANDLED_WORKSPACE_ID}`;
  let state: State;
  try {
    state = stateSchema.parse(
      JSON.parse(await readFile(cfg.HANDLED_ACCEPTANCE_STATE_FILE, 'utf8')),
    );
    check(
      state.workspaceId === cfg.HANDLED_WORKSPACE_ID,
      'Acceptance state belongs to another workspace',
    );
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
    state = { workspaceId: cfg.HANDLED_WORKSPACE_ID, cases: {} };
  }
  const save = async () => {
    const temporary = `${cfg.HANDLED_ACCEPTANCE_STATE_FILE}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporary, cfg.HANDLED_ACCEPTANCE_STATE_FILE);
  };
  const report = (event: string, details: Record<string, unknown>) =>
    process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);
  async function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      expected?: number | readonly number[];
      foreign?: boolean;
      publicKey?: string;
    } = {},
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.publicKey) {
      headers.Origin = cfg.HANDLED_PUBLIC_ORIGIN;
      headers['X-Support-Form-Token'] = cfg.HANDLED_FORM_TOKEN;
      headers['Idempotency-Key'] = options.publicKey;
      if (cfg.HANDLED_SUPPORT_PROXY_SECRET) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const slug = path.split('/')[3];
        const ip = '203.0.113.240';
        headers['X-Support-Client-IP'] = ip;
        headers['X-Support-Timestamp'] = timestamp;
        headers['X-Support-Signature'] = createHmac(
          'sha256',
          cfg.HANDLED_SUPPORT_PROXY_SECRET,
        )
          .update(`${timestamp}\n${slug}\n${cfg.HANDLED_PUBLIC_ORIGIN}\n${ip}`)
          .digest('hex');
      }
    } else
      headers.Authorization = `Bearer ${options.foreign ? cfg.HANDLED_FOREIGN_ACCESS_TOKEN : cfg.HANDLED_ADMIN_ACCESS_TOKEN}`;
    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(90000),
    });
    const text = await response.text();
    const envelope = record.parse(JSON.parse(text));
    const expected = options.expected ?? 200;
    const statuses = typeof expected === 'number' ? [expected] : expected;
    if (!statuses.includes(response.status)) {
      const code = record.safeParse(envelope.error);
      throw new Error(
        `HTTP ${response.status} ${options.method ?? 'GET'} ${path}; expected ${statuses.join(' or ')}; code=${code.success ? String(code.data.code) : 'unknown'}`,
      );
    }
    return envelope.data;
  }
  async function approve(
    proposalId: string,
    version: number,
    key: string,
    expected = 202,
  ) {
    const response = await fetch(
      `${base}${prefix}/proposals/${proposalId}/approve`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.HANDLED_ADMIN_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ expectedVersion: version }),
        signal: AbortSignal.timeout(90000),
      },
    );
    check(
      response.status === expected,
      `Approval returned ${response.status}; expected ${expected}`,
    );
    const envelope = record.parse(await response.json());
    return envelope.data;
  }
  async function poll(
    path: string,
    ready: (value: Record<string, unknown>) => boolean,
  ) {
    const deadline = Date.now() + cfg.HANDLED_ACCEPTANCE_TIMEOUT_MS;
    for (;;) {
      const data = record.parse(await call(path));
      if (ready(data)) return data;
      if (
        ['FAILED', 'NEEDS_REVIEW', 'OUTCOME_UNKNOWN'].includes(
          String(data.status),
        )
      )
        throw new Error(
          `Terminal ${String(data.status)} at ${path}; failureCode=${String(data.failureCode)}`,
        );
      if (Date.now() >= deadline)
        throw new Error(`Acceptance deadline reached at ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  const workspace = record.parse(await call(prefix));
  const slug = z.string().parse(workspace.slug);
  check(
    slug.startsWith('acme-cloud-'),
    'Acceptance requires the scoped AcmeCloud synthetic fixtures',
  );
  await call(`${prefix}/tickets`, { foreign: true, expected: [403, 404] });
  const documents = rows.parse(
    await call(`${prefix}/knowledge/documents?page=1&limit=100`),
  );
  check(documents.length === 3, 'Expected three scoped synthetic policies');
  for (const doc of documents) {
    if (doc.status === 'DRAFT')
      await call(`${prefix}/knowledge/documents/${String(doc.id)}/publish`, {
        method: 'POST',
        body: { expectedVersion: doc.version },
        expected: 202,
      });
    const indexed = await poll(
      `${prefix}/knowledge/documents/${String(doc.id)}`,
      (d) => {
        const revision = record.safeParse(d.publishedRevision);
        if (revision.success && revision.data.indexStatus === 'FAILED')
          throw new Error(
            `Policy index failed: ${String(revision.data.failureCode)}`,
          );
        return revision.success && revision.data.indexStatus === 'READY';
      },
    );
    report('policy.indexed', {
      documentId: indexed.id,
      version: indexed.publishedVersion,
    });
  }
  const cases = [
    {
      ref: '1001',
      email: 'maya@example.com',
      type: 'REFUND_DUPLICATE_PAYMENT',
      subject: 'I was charged twice for this month Pro plan',
      body: 'Please investigate my duplicate payment. I paid USD 29 twice for the same billing period and subscription. Please refund one duplicate charge if the verified payments and published policy permit it.',
    },
    {
      ref: '1002',
      email: 'daniel@example.com',
      type: 'CANCEL_AT_PERIOD_END',
      subject: 'Cancel my renewal at the end of the paid period',
      body: 'Please cancel auto renewal of my current subscription at period end. Keep my already paid access until the current period expires. Please verify my account and the published cancellation policy.',
    },
    {
      ref: '1003',
      email: 'sofia@example.com',
      type: 'RESTORE_PRODUCT_ACCESS',
      subject: 'My payment succeeded but the app says I have no access',
      body: 'My current subscription is paid but product access was revoked by a sync error. Please inspect my payment, active subscription, exact product and published access restoration policy, and restore access if eligible.',
    },
  ];
  for (const item of cases) {
    const current = (state.cases[item.ref] ??= {
      publicKey: randomUUID(),
      approvalKey: randomUUID(),
    });
    await save();
    const customers = rows.parse(
      await call(`${prefix}/customers?search=CUS-${item.ref}&page=1&limit=100`),
    );
    const customer = customers.find((c) => c.externalRef === `CUS-${item.ref}`);
    check(customer, `Synthetic customer CUS-${item.ref} missing`);
    const customerId = z.uuid().parse(customer.id);
    const publicBody = {
      subject: item.subject,
      body: item.body,
      requesterEmail: item.email,
      requesterCustomerRef: `CUS-${item.ref}`,
    };
    const receipt = record.parse(
      await call(`/public/workspaces/${slug}/tickets`, {
        method: 'POST',
        body: publicBody,
        expected: 201,
        publicKey: current.publicKey,
      }),
    );
    check(
      !current.ticketId || current.ticketId === receipt.id,
      'Public replay changed ticket',
    );
    current.ticketId = z.uuid().parse(receipt.id);
    await save();
    const duplicate = record.parse(
      await call(`/public/workspaces/${slug}/tickets`, {
        method: 'POST',
        body: publicBody,
        expected: 201,
        publicKey: current.publicKey,
      }),
    );
    check(
      duplicate.id === current.ticketId,
      'Duplicate public intake created another ticket',
    );
    await call(`/public/workspaces/${slug}/tickets`, {
      method: 'POST',
      body: { ...publicBody, body: 'Changed request must conflict' },
      expected: 409,
      publicKey: current.publicKey,
    });
    let ticket = record.parse(
      await call(`${prefix}/tickets/${current.ticketId}`),
    );
    if (!ticket.customerVerifiedAt) {
      await call(`${prefix}/tickets/${current.ticketId}/investigations`, {
        method: 'POST',
        body: {},
        expected: 422,
      });
      ticket = record.parse(
        await call(`${prefix}/tickets/${current.ticketId}/verify-customer`, {
          method: 'POST',
          body: {
            expectedVersion: ticket.version,
            customerId,
            verificationReason:
              'Controlled synthetic test account ownership verified against the explicit acceptance fixture mapping.',
          },
        }),
      );
    }
    check(
      ticket.customerId === customerId,
      'Verified customer differs from fixture',
    );
    if (!current.runId) {
      const existing = rows.parse(
        await call(
          `${prefix}/tickets/${current.ticketId}/investigations?page=1&limit=100`,
        ),
      );
      check(
        existing.length <= 1,
        'Ambiguous existing investigations; review the acceptance state',
      );
      if (existing[0]) {
        current.runId = z.uuid().parse(existing[0].id);
        await save();
      }
    }
    if (!current.runId) {
      const admission = record.parse(
        await call(`${prefix}/tickets/${current.ticketId}/investigations`, {
          method: 'POST',
          body: {},
          expected: 202,
        }),
      );
      current.runId = z.uuid().parse(admission.investigationId);
      await save();
    }
    const run = await poll(
      `${prefix}/investigations/${current.runId}`,
      (r) => r.status === 'COMPLETED',
    );
    check(
      typeof run.model === 'string' && run.model.startsWith('gemini-'),
      'Real Gemini model evidence missing',
    );
    const proposal = record.parse(run.proposal);
    if (!current.actionId) {
      const existing = rows.parse(
        await call(
          `${prefix}/tickets/${current.ticketId}/actions?page=1&limit=100`,
        ),
      );
      check(
        existing.length <= 1,
        'Ambiguous existing actions; review the acceptance state',
      );
      if (existing[0]) {
        check(
          existing[0].proposalId === proposal.id,
          'Existing action belongs to another proposal',
        );
        current.actionId = z.uuid().parse(existing[0].id);
        await save();
      }
    }
    if (!current.actionId) {
      verifyReadyProposal(proposal, item.type);
      await approve(
        String(proposal.id),
        Number(proposal.version) + 1,
        randomUUID(),
        409,
      );
      const admission = record.parse(
        await approve(
          String(proposal.id),
          Number(proposal.version),
          current.approvalKey,
        ),
      );
      current.actionId = z.uuid().parse(admission.actionExecutionId);
      await save();
    }
    const repeated = record.parse(
      await approve(
        String(proposal.id),
        Number(proposal.version),
        current.approvalKey,
      ),
    );
    check(
      repeated.actionExecutionId === current.actionId,
      'Duplicate approval created another action',
    );
    const action = await poll(
      `${prefix}/actions/${current.actionId}`,
      (a) => a.status === 'SUCCEEDED',
    );
    check(
      action.type === item.type && action.proposalId === proposal.id,
      'Action does not match the expected case and proposal',
    );
    const context = await call(
      `${prefix}/customers/${customerId}/account-context`,
    );
    verifyBusinessEffect(action, context);
    await call(`${prefix}/actions/${current.actionId}/retry`, {
      method: 'POST',
      body: { expectedVersion: action.version },
      expected: 409,
    });
    await call(
      `/workspaces/${cfg.HANDLED_FOREIGN_WORKSPACE_ID}/actions/${current.actionId}`,
      { foreign: true, expected: 404 },
    );
    const audit = rows.parse(
      await call(
        `${prefix}/tickets/${current.ticketId}/audit?page=1&limit=100`,
      ),
    );
    check(
      audit.some((event) => event.eventType === 'action.completed'),
      'Persisted completion audit missing',
    );
    const actions = rows.parse(
      await call(
        `${prefix}/tickets/${current.ticketId}/actions?page=1&limit=100`,
      ),
    );
    check(
      actions.length === 1 && actions[0]?.id === current.actionId,
      'Expected one persisted action',
    );
    const refetched = record.parse(
      await call(`${prefix}/tickets/${current.ticketId}`),
    );
    check(refetched.status === 'RESOLVED', 'Refetched ticket is not resolved');
    report('business.completed', {
      case: item.type,
      ticketId: current.ticketId,
      investigationId: current.runId,
      model: run.model,
      proposalId: proposal.id,
      actionId: current.actionId,
      attempts: action.attempts,
      simulation: action.simulation,
      ticketStatus: refetched.status,
      checks: [
        'public-replay',
        'public-conflict',
        'verified-customer',
        'real-ai',
        'policy-citation',
        'stale-version-denial',
        'approval-replay',
        'persisted-effect',
        'audit',
        'terminal-retry-denial',
        'cross-tenant-denial',
        'refetch',
      ],
    });
  }
  report('acceptance.completed', {
    workspaceId: cfg.HANDLED_WORKSPACE_ID,
    cases: cases.length,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  hostedAcceptance().catch((error: unknown) => {
    // Only deliberate safe diagnostics escape; provider payloads, tokens and URLs do not.
    const message =
      error instanceof Error && !(error instanceof z.ZodError)
        ? error.message
        : 'Invalid acceptance response or state';
    process.stderr.write(`Hosted acceptance failed: ${message}\n`);
    process.exitCode = 1;
  });
}
