import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = fileURLToPath(new URL('../runs/train-boarding-autonomy.mjs', import.meta.url));
function train(branch, seed) {
  return new Promise((ok, fail) => {
    const job = spawn(process.execPath, [runner, branch, String(seed)], { stdio: 'inherit' });
    job.once('error', fail);
    job.once('exit', code => code === 0 ? ok() : fail(Error(branch + ' ' + seed + ' exited ' + code)));
  });
}
await Promise.all([4101, 4102, 4103].map(async seed => {
  for (const branch of ['reminders', 'candidate', 'ordinary']) await train(branch, seed);
}));
