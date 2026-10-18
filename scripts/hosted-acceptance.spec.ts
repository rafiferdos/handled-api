import {
  verifyBusinessEffect,
  verifyReadyProposal,
} from './hosted-acceptance.js';

const action = {
  simulation: true,
  status: 'SUCCEEDED',
  type: 'REFUND_DUPLICATE_PAYMENT',
  targetRef: 'PAY-9002',
  beforeState: { id: 'payment-id', status: 'SETTLED' },
  afterState: { id: 'payment-id', status: 'REFUNDED' },
};

it('requires an actual persisted simulated effect, not a successful receipt alone', () => {
  expect(() =>
    verifyBusinessEffect(action, {
      payments: [{ id: 'payment-id', status: 'REFUNDED' }],
    }),
  ).not.toThrow();
  expect(() =>
    verifyBusinessEffect(action, {
      payments: [{ id: 'payment-id', status: 'SETTLED' }],
    }),
  ).toThrow('Persisted refund');
  expect(() =>
    verifyBusinessEffect({ ...action, simulation: false }, { payments: [] }),
  ).toThrow('simulated');
  expect(() =>
    verifyBusinessEffect({ ...action, afterState: null }, { payments: [] }),
  ).toThrow();
});

it('requires policy and account citations plus the requested real recommendation', () => {
  const proposal = {
    status: 'READY',
    confidence: 'HIGH',
    recommendation: { type: 'REFUND_DUPLICATE_PAYMENT' },
    sources: [
      { sourceType: 'KNOWLEDGE', sourceRefId: 'kb-policy' },
      { sourceType: 'TOOL', sourceRefId: 'customer-fact' },
    ],
    evidenceRefs: ['kb-policy', 'customer-fact'],
  };
  expect(() =>
    verifyReadyProposal(proposal, 'REFUND_DUPLICATE_PAYMENT'),
  ).not.toThrow();
  expect(() =>
    verifyReadyProposal(
      { ...proposal, sources: proposal.sources.slice(1) },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('policy');
  expect(() =>
    verifyReadyProposal(
      { ...proposal, evidenceRefs: ['kb-policy'] },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('account');
  expect(() =>
    verifyReadyProposal(
      { ...proposal, confidence: 'LOW' },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('eligible');
});

it.each([
  [false, 1, false, 403],
  [true, 1, false, 403],
  [false, 2, false, 403],
  [true, 1, true, 403],
  [false, 1, false, 404],
  [false, 1, false, 200],
  [false, 1, false, 500],
] as const)(
  'recovers completed server workflow after response loss (saved run: %s, server runs: %s, wrong type: %s, tenant denial: %s)',
  async (savedRun, runCount, wrongType, tenantDenial) => {
    const { randomUUID } = await import('node:crypto');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { hostedAcceptance } = await import('./hosted-acceptance.js');
    const directory = await mkdtemp(join(tmpdir(), 'handled-resume-'));
    const workspaceId = randomUUID(),
      foreignWorkspaceId = randomUUID();
    const entries = ['1001', '1002', '1003'].map((ref, index) => ({
      ref,
      customerId: randomUUID(),
      ticketId: randomUUID(),
      runId: randomUUID(),
      proposalId: randomUUID(),
      actionId: randomUUID(),
      targetId: randomUUID(),
      type: [
        'REFUND_DUPLICATE_PAYMENT',
        'CANCEL_AT_PERIOD_END',
        'RESTORE_PRODUCT_ACCESS',
      ][index]!,
    }));
    const stateFile = join(directory, 'state.json');
    await writeFile(
      stateFile,
      JSON.stringify({
        workspaceId,
        cases: Object.fromEntries(
          entries.map((e) => [
            e.ref,
            {
              publicKey: randomUUID(),
              approvalKey: randomUUID(),
              ticketId: e.ticketId,
              ...(savedRun ? { runId: e.runId } : {}),
            },
          ]),
        ),
      }),
    );
    let starts = 0,
      approvalReplays = 0;
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify({ data }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, options) => {
        const url = new URL(String(input)),
          path = url.pathname.replace('/api/v1', ''),
          method = options?.method ?? 'GET';
        const body =
          typeof options?.body === 'string'
            ? (JSON.parse(options.body) as Record<string, unknown>)
            : {};
        if (path === `/workspaces/${workspaceId}`)
          return response({ slug: 'acme-cloud-synthetic' });
        if (path === `/workspaces/${workspaceId}/tickets`)
          return response({}, tenantDenial);
        if (path.endsWith('/knowledge/documents'))
          return response(
            entries.map((e) => ({ id: e.targetId, status: 'PUBLISHED' })),
          );
        if (path.includes('/knowledge/documents/'))
          return response({ publishedRevision: { indexStatus: 'READY' } });
        if (path.endsWith('/customers'))
          return response(
            entries
              .filter((e) => url.searchParams.get('search') === `CUS-${e.ref}`)
              .map((e) => ({ id: e.customerId, externalRef: `CUS-${e.ref}` })),
          );
        if (path.startsWith('/public/')) {
          if (body.body === 'Changed request must conflict')
            return response({}, 409);
          const e = entries.find(
            (e) => body.requesterCustomerRef === `CUS-${e.ref}`,
          )!;
          return response({ id: e.ticketId }, 201);
        }
        const entry = entries.find((e) =>
          [e.ticketId, e.runId, e.proposalId, e.actionId, e.customerId].some(
            (id) => path.includes(id),
          ),
        );
        if (!entry) throw new Error(`Unrecognized test path ${path}`);
        if (
          path === `/workspaces/${foreignWorkspaceId}/actions/${entry.actionId}`
        )
          return response({}, 404);
        if (path.endsWith('/investigations') && method === 'POST') {
          starts++;
          throw new Error(
            'Must recover admitted server run before starting another',
          );
        }
        if (path.endsWith('/investigations'))
          return response(
            Array.from({ length: runCount }, () => ({ id: entry.runId })),
          );
        if (path.endsWith(`/investigations/${entry.runId}`))
          return response({
            status: 'COMPLETED',
            model: 'gemini-real-test-contract',
            proposal: { id: entry.proposalId, version: 1, status: 'APPROVED' },
          });
        if (path.endsWith(`/proposals/${entry.proposalId}/approve`)) {
          approvalReplays++;
          return response({ actionExecutionId: entry.actionId }, 202);
        }
        if (path.endsWith('/actions'))
          return response([
            { id: entry.actionId, proposalId: entry.proposalId },
          ]);
        const effectiveType = wrongType ? 'CANCEL_AT_PERIOD_END' : entry.type;
        const before =
          effectiveType === 'CANCEL_AT_PERIOD_END'
            ? {
                id: entry.targetId,
                cancelAtPeriodEnd: false,
                currentPeriodEnd: '2026-10-31',
              }
            : {
                id: entry.targetId,
                status:
                  effectiveType === 'REFUND_DUPLICATE_PAYMENT'
                    ? 'SETTLED'
                    : 'REVOKED',
              };
        const after =
          effectiveType === 'CANCEL_AT_PERIOD_END'
            ? { ...before, cancelAtPeriodEnd: true }
            : {
                ...before,
                status:
                  effectiveType === 'REFUND_DUPLICATE_PAYMENT'
                    ? 'REFUNDED'
                    : 'ACTIVE',
              };
        if (path.endsWith(`/actions/${entry.actionId}`))
          return response({
            id: entry.actionId,
            status: 'SUCCEEDED',
            simulation: true,
            type: effectiveType,
            proposalId: entry.proposalId,
            beforeState: before,
            afterState: after,
            version: 2,
            attempts: 1,
          });
        if (path.endsWith('/account-context'))
          return response({
            payments: [after],
            subscriptions: [after],
            productAccess: [after],
          });
        if (path.endsWith('/retry')) return response({}, 409);
        if (path.endsWith('/audit'))
          return response([{ eventType: 'action.completed' }]);
        if (path.endsWith(`/tickets/${entry.ticketId}`))
          return response({
            customerId: entry.customerId,
            customerVerifiedAt: '2026-10-18T00:00:00Z',
            status: 'RESOLVED',
          });
        throw new Error(`Unrecognized test path ${path}`);
      });
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      const operation = hostedAcceptance({
        HANDLED_API_BASE_URL: 'https://api.example.invalid/api/v1',
        HANDLED_ADMIN_ACCESS_TOKEN: 'synthetic-admin-token',
        HANDLED_FOREIGN_ACCESS_TOKEN: 'synthetic-foreign-token',
        HANDLED_WORKSPACE_ID: workspaceId,
        HANDLED_FOREIGN_WORKSPACE_ID: foreignWorkspaceId,
        HANDLED_PUBLIC_ORIGIN: 'https://support.example.invalid',
        HANDLED_FORM_TOKEN: 'a'.repeat(43),
        HANDLED_ACCEPTANCE_STATE_FILE: stateFile,
      });
      if (![403, 404].includes(tenantDenial))
        await expect(operation).rejects.toThrow('expected 403 or 404');
      else if (runCount === 2)
        await expect(operation).rejects.toThrow(
          'Ambiguous existing investigations',
        );
      else if (wrongType)
        await expect(operation).rejects.toThrow('Action does not match');
      else {
        await operation;
        expect(approvalReplays).toBe(3);
      }
      expect(starts).toBe(0);
    } finally {
      fetchMock.mockRestore();
      output.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
