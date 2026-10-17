import { fileURLToPath } from 'node:url';
import { supervise } from './preview-supervisor.js';

const run = supervise([
  { name: 'api', args: [fileURLToPath(new URL('./main.js', import.meta.url))] },
  {
    name: 'worker',
    args: [fileURLToPath(new URL('./worker.js', import.meta.url))],
  },
]);
const onTerm = () => run.stop('SIGTERM');
const onInterrupt = () => run.stop('SIGINT');
process.on('SIGTERM', onTerm);
process.on('SIGINT', onInterrupt);
void run.completion.then((code) => {
  process.exitCode = code;
  process.off('SIGTERM', onTerm);
  process.off('SIGINT', onInterrupt);
});
