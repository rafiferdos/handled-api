import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export interface PreviewProcess {
  name: string;
  args: readonly string[];
}

export function supervise(
  processes: readonly PreviewProcess[],
  shutdownGraceMs = 25000,
): { completion: Promise<number>; stop: (signal: NodeJS.Signals) => void } {
  const children = new Set<ChildProcess>();
  let stopping = false;
  let exitCode = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let finish!: (code: number) => void;
  const completion = new Promise<number>((resolve) => {
    finish = resolve;
  });
  function complete() {
    if (deadline) clearTimeout(deadline);
    finish(exitCode);
  }
  function stop(signal: NodeJS.Signals, code = 0) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) child.kill(signal);
    if (!children.size) return complete();
    deadline = setTimeout(() => {
      exitCode = 1;
      for (const child of children) child.kill('SIGKILL');
    }, shutdownGraceMs);
    deadline.unref();
  }
  for (const spec of processes) {
    const child = spawn(process.execPath, [...spec.args], { stdio: 'inherit' });
    children.add(child);
    child.once('error', () => {
      console.error(
        JSON.stringify({ event: 'preview.process.failed', process: spec.name }),
      );
      stop('SIGTERM', 1);
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      if (!stopping) {
        console.error(
          JSON.stringify({
            event: 'preview.process.exited',
            process: spec.name,
            code,
            signal,
          }),
        );
        stop('SIGTERM', 1);
      }
      if (!children.size) complete();
    });
  }
  if (!children.size) complete();
  return { completion, stop };
}
