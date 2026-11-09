// Smoke du harnais de mesure NN (PPO / TF.js documenté, non lancé).
// Usage : bun scripts/nn-harness.ts
//         bun scripts/nn-harness.ts --n 3 --opps march --seedBase 910000 --out mesures/nn-scratch/smoke.json
import { fingerprintFrozen, runCli } from '../src/nn-harness.ts';

const t0 = Date.now();
const report = runCli(process.argv.slice(2));
const frozen = fingerprintFrozen();
const out = {
  ...report,
  frozen,
  overwroteFrozen: false,
  elapsedMs: Date.now() - t0,
};
console.log(JSON.stringify(out, null, 2));
console.log('nn-harness smoke ok');
