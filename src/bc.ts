// Behaviour cloning : CLI. Le cœur testable est src/bc-lib.ts.
// Usage : node dist/bc.mjs --out ghost.json [--epochs 300] [--seed 1] [--run-json run.json] rec1.json rec2.json ...
import { checkGuard } from './guard';
import { trainBehaviorCloningFromFiles } from './bc-lib';

const argv = process.argv.slice(2); const oi = argv.indexOf('--out'); const out = argv[oi + 1];
if (!out) throw new Error('usage: node dist/bc.mjs --out ghost.json [--epochs N] [--seed 1] rec.json...');
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d);
const str = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const epochs = opt('epochs', 300), patience = opt('patience', 30), hidden = opt('hidden', 64), seed = opt('seed', 1);
const files = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
checkGuard('début BC');
const r = trainBehaviorCloningFromFiles({ files, out, runJson: str('run-json'), epochs, patience, hidden, seed });
console.log(JSON.stringify(r.meta));
