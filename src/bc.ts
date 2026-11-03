// Behaviour cloning du joueur : apprend π(action | ce que perçoit le Terminator) sur toutes les manches enregistrées.
// Usage : node dist/bc.mjs --out ghost.json [--epochs 300] [--seed 1] rec1.json rec2.json ...
// Têtes factorisées : avancer (3), pas chassé (3), pivot (3), attaque (3) au lieu de 27 déplacements joints,
// entraînement par mini-lots avec arrêt anticipé sur des blocs de frames tenus à part (et non des frames isolées,
// trop corrélées avec leurs voisines pour mesurer la fidélité).
import * as tf from '@tensorflow/tfjs-node';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { TOBS_DIM, BC_HEADS, moveToHeads } from './tobs';
import type { Recording } from './recorder';
import type { ActorJSON } from './policy';
import { checkGuard } from './guard';
import { bcModel } from './model';

const argv = process.argv.slice(2); const oi = argv.indexOf('--out'); const out = argv[oi + 1];
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d);
const epochs = opt('epochs', 300), patience = opt('patience', 30), hidden = opt('hidden', 64), seed = opt('seed', 1);
const files = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
checkGuard('début BC');
const X: number[][] = [], Y: number[][] = [];
for (const f of files) { const rec = JSON.parse(readFileSync(f, 'utf8')) as Recording; for (const fr of rec.frames) if (fr.o) { X.push(fr.o); Y.push([...moveToHeads(fr.move!), fr.atk!]); } }
if (!X.length) throw new Error('aucune frame avec observation');
// validation : 1 bloc de 10 frames consécutives sur 5, déterministe
const isVal = X.map((_, i) => Math.floor(i / 10) % 5 === 2);
const tr = X.map((_, i) => i).filter(i => !isVal[i]), va = X.map((_, i) => i).filter(i => isVal[i]);
const H = BC_HEADS.length;
// poids de classe par tête (plafonnés à 10) pour ne pas écraser les actions rares (tirs, pivots)
const cw = BC_HEADS.map((n, h) => { const c = new Array(n).fill(0); tr.forEach(i => c[Y[i][h]]++); return c.map(k => Math.min(10, tr.length / (n * Math.max(1, k)))); });
// initialisation seedée (glorotNormal, l'initialiseur par défaut de dense) : même distribution, tirage reproductible
const model = bcModel(hidden, TOBS_DIM, BC_HEADS.reduce((a, b) => a + b, 0), seed);
const adam = tf.train.adam(3e-3);
const tensors = (ids: number[]) => ({ x: tf.tensor2d(ids.map(i => X[i]), [ids.length, TOBS_DIM]),
  y: BC_HEADS.map((n, h) => tf.oneHot(tf.tensor1d(ids.map(i => Y[i][h]), 'int32'), n)),
  w: BC_HEADS.map((_, h) => tf.tensor1d(ids.map(i => cw[h][Y[i][h]]))) });
const T = tensors(tr), V = va.length ? tensors(va) : T;
function loss(D: ReturnType<typeof tensors>, weighted: boolean) {
  const z = model.apply(D.x) as tf.Tensor2D; let off = 0, tot: tf.Tensor = tf.scalar(0);
  BC_HEADS.forEach((n, h) => { const lp = tf.logSoftmax(z.slice([0, off], [-1, n])); off += n;
    const ce = tf.neg(tf.sum(tf.mul(D.y[h], lp), 1)); tot = tf.add(tot, tf.mean(weighted ? tf.mul(ce, D.w[h]) : ce)); });
  return tot as tf.Scalar;
}
const t0 = performance.now(); let best = Infinity, bestW: tf.Tensor[] = [], since = 0, used = 0;
for (let e = 0; e < epochs; e++) {
  adam.minimize(() => loss(T, true)); used = e + 1;
  const vl = tf.tidy(() => loss(V, false).dataSync()[0]);
  if (vl < best - 1e-4) { best = vl; bestW.forEach(w => w.dispose()); bestW = model.getWeights().map(w => w.clone()); since = 0; } else if (++since >= patience) break;
}
model.setWeights(bestW);
function acc(ids: number[]) {
  if (!ids.length) return null;
  return tf.tidy(() => {
    const z = model.predict(tf.tensor2d(ids.map(i => X[i]), [ids.length, TOBS_DIM])) as tf.Tensor2D; let off = 0;
    const preds = BC_HEADS.map(n => { const p = z.slice([0, off], [-1, n]).argMax(1).dataSync(); off += n; return p; });
    const per = BC_HEADS.map((_, h) => +(ids.filter((i, k) => preds[h][k] === Y[i][h]).length / ids.length).toFixed(3));
    const joint = +(ids.filter((i, k) => BC_HEADS.every((_, h) => preds[h][k] === Y[i][h])).length / ids.length).toFixed(3);
    return { fwd: per[0], strafe: per[1], turn: per[2], atk: per[3], joint };
  });
}
// référence naïve : toujours la valeur la plus fréquente de l'entraînement, appliquée à la validation
const majority = (ids: number[]) => {
  const mode = BC_HEADS.map((n, h) => { const c = new Array(n).fill(0); tr.forEach(i => c[Y[i][h]]++); return c.indexOf(Math.max(...c)); });
  const per = BC_HEADS.map((_, h) => +(ids.filter(i => Y[i][h] === mode[h]).length / Math.max(1, ids.length)).toFixed(3));
  const joint = +(ids.filter(i => BC_HEADS.every((_, h) => Y[i][h] === mode[h])).length / Math.max(1, ids.length)).toFixed(3);
  return { fwd: per[0], strafe: per[1], turn: per[2], atk: per[3], joint };
};
const ws = model.getWeights(); const layers = [];
for (let i = 0; i < ws.length; i += 2) { const [inDim, outDim] = ws[i].shape as [number, number]; layers.push({ inDim, outDim, w: Array.from(ws[i].dataSync()).map(v => +v.toFixed(5)), b: Array.from(ws[i + 1].dataSync()).map(v => +v.toFixed(5)), act: (i + 2 < ws.length ? 'tanh' : 'linear') as 'tanh' | 'linear' }); }
const meta = { heads: 'fwd,strafe,turn,atk', seed, rounds: files.length, frames: X.length, train: tr.length, val: va.length, epochsUsed: used, seconds: +((performance.now() - t0) / 1000).toFixed(1), valLoss: +best.toFixed(4), accTrain: acc(tr), accVal: acc(va), majorityVal: majority(va) };
const j: ActorJSON = { version: `bc-factored:${out.split('/').pop()}`, obsDim: TOBS_DIM, nAct: BC_HEADS.reduce((a, b) => a + b, 0), layers, meta };
writeFileSync(out, JSON.stringify(j)); console.log(JSON.stringify(meta));
