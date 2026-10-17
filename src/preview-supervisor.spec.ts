import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { supervise } from './preview-supervisor.js';

const runs: ReturnType<typeof supervise>[] = [];
const directories: string[] = [];

async function fixture(mode = 'normal') {
  const directory = await mkdtemp(join(tmpdir(), 'handled-preview-'));
  directories.push(directory);
  const script = join(directory, 'child.mjs');
  const marker = join(directory, 'state');
  await writeFile(
    script,
    `import { existsSync, writeFileSync } from 'node:fs';
const marker = process.argv[2];
process.on('SIGTERM', () => {
  if (process.argv[3] === 'stuck') return;
  writeFileSync(marker + '.stopped', 'SIGTERM');
  process.exit(0);
});
writeFileSync(marker, String(process.pid));
setInterval(() => { if (existsSync(marker + '.crash')) process.exit(7); }, 10);
`,
  );
  return { marker, args: [script, marker, mode] };
}

async function ready(marker: string) {
  await expect
    .poll(() => readFile(marker, 'utf8').catch(() => ''), { timeout: 2000 })
    .not.toBe('');
}

afterEach(async () => {
  await Promise.all(
    runs.splice(0).map(async (run) => {
      run.stop('SIGTERM');
      await run.completion;
    }),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

it('fails the deployment process when a child exits unexpectedly', async () => {
  const run = supervise(
    [{ name: 'api', args: ['-e', 'process.exit(7)'] }],
    500,
  );
  runs.push(run);
  expect(await run.completion).toBe(1);
});

it('stops the surviving worker when the API crashes', async () => {
  const api = await fixture();
  const worker = await fixture();
  const run = supervise(
    [
      { name: 'api', args: api.args },
      { name: 'worker', args: worker.args },
    ],
    500,
  );
  runs.push(run);
  await Promise.all([ready(api.marker), ready(worker.marker)]);
  await writeFile(api.marker + '.crash', '1');
  expect(await run.completion).toBe(1);
  expect(await readFile(worker.marker + '.stopped', 'utf8')).toBe('SIGTERM');
});

it('forwards shutdown to both children and exits successfully', async () => {
  const api = await fixture();
  const worker = await fixture();
  const run = supervise(
    [
      { name: 'api', args: api.args },
      { name: 'worker', args: worker.args },
    ],
    500,
  );
  runs.push(run);
  await Promise.all([ready(api.marker), ready(worker.marker)]);
  run.stop('SIGTERM');
  expect(await run.completion).toBe(0);
  expect(await readFile(api.marker + '.stopped', 'utf8')).toBe('SIGTERM');
  expect(await readFile(worker.marker + '.stopped', 'utf8')).toBe('SIGTERM');
});

it('kills an unresponsive child after the shutdown deadline', async () => {
  const worker = await fixture('stuck');
  const run = supervise([{ name: 'worker', args: worker.args }], 50);
  runs.push(run);
  await ready(worker.marker);
  const pid = Number(await readFile(worker.marker, 'utf8'));
  run.stop('SIGTERM');
  expect(await run.completion).toBe(1);
  expect(() => process.kill(pid, 0)).toThrow();
});

it('keeps the real entrypoint draining when shutdown signals repeat', async () => {
  const api = await fixture();
  const worker = await fixture('stuck');
  const directory = await mkdtemp(join(tmpdir(), 'handled-preview-entry-'));
  directories.push(directory);
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  for (const name of ['preview', 'preview-supervisor']) {
    const source = await readFile(
      new URL(`./${name}.ts`, import.meta.url),
      'utf8',
    );
    await writeFile(
      join(directory, `${name}.js`),
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2022 },
      }).outputText,
    );
  }
  for (const [name, child] of [
    ['main', api],
    ['worker', worker],
  ] as const) {
    await writeFile(
      join(directory, `${name}.js`),
      `process.argv[2]=${JSON.stringify(child.marker)};
process.argv[3]=${JSON.stringify(name === 'worker' ? 'stuck' : 'normal')};
await import(${JSON.stringify(pathToFileURL(child.args[0]!).href)});`,
    );
  }
  const entry = spawn(process.execPath, [join(directory, 'preview.js')], {
    stdio: 'ignore',
  });
  const closed = new Promise<string>((resolve) => {
    entry.once('close', (code, signal) => resolve(signal || String(code)));
  });
  try {
    await Promise.all([ready(api.marker), ready(worker.marker)]);
    entry.kill('SIGTERM');
    await ready(api.marker + '.stopped');
    entry.kill('SIGTERM');
    expect(
      await Promise.race([
        closed,
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('draining'), 100),
        ),
      ]),
    ).toBe('draining');
  } finally {
    for (const child of [api, worker]) {
      const pid = Number(await readFile(child.marker, 'utf8').catch(() => '0'));
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // The normal child may already have completed its shutdown.
        }
      }
    }
    entry.kill('SIGKILL');
    await closed;
  }
});
