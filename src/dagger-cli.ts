// DAgger borné. Usage :
// node dist/dagger.mjs --out /tmp/rl3-dagger --epochs 2 --iters 2 --budget 40 --seed 1 rec.json
import { readFileSync } from 'node:fs';
import { checkGuard } from './guard';
import { runDagger } from './dagger';

const argv = process.argv.slice(2);
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d);
const str = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const outDir = str('out');
if (!outDir) throw new Error('usage: node dist/dagger.mjs --out dir [--epochs 2] [--iters 2] [--budget 40] [--seed 1] rec.json');
const files = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
checkGuard('début DAgger');
const recordings = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
const budget = opt('budget', 40);
const r = runDagger({
  recordings,
  outDir,
  seed: opt('seed', 1),
  iters: opt('iters', 2),
  epochs: opt('epochs', 2),
  patience: opt('patience', 2),
  hidden: opt('hidden', 32),
  maxTicks: budget,
  maxNewFrames: budget,
  pack: 'naive',
  expert: 'wallHugger',
});
console.log(JSON.stringify(r));
