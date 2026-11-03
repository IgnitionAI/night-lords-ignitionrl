// Behaviour cloning du joueur : apprend π(action | ce que perçoit le Terminator) sur toutes les manches enregistrées.
// Usage : node dist/bc.mjs --out ghost.json rec1.json rec2.json ...
import * as tf from '@tensorflow/tfjs-node';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { TOBS_DIM, N_MOVE, N_ATK } from './tobs';
import type { Recording } from './recorder';
import type { ActorJSON } from './policy';
import { checkGuard } from './guard';

const argv = process.argv.slice(2); const oi = argv.indexOf('--out'); const out = argv[oi + 1];
const epochs = Number(argv.includes('--epochs') ? argv[argv.indexOf('--epochs') + 1] : 40);
const files = argv.filter((a, i) => !a.startsWith('--') && i !== oi + 1 && argv[i - 1] !== '--epochs');
checkGuard('début BC');
const X: number[][] = [], M: number[] = [], A: number[] = [], roundOf: number[] = [];
files.forEach((f, r) => { const rec = JSON.parse(readFileSync(f, 'utf8')) as Recording; for (const fr of rec.frames) if (fr.o) { X.push(fr.o); M.push(fr.move!); A.push(fr.atk!); roundOf.push(r); } });
if (!X.length) throw new Error('aucune frame avec observation');
// validation : 20 % des frames tirées au hasard (déterministe), pour mesurer la fidélité de l'imitation
const val = X.map((_, i) => ((i * 2654435761) >>> 0) % 5 === 0);
const tr = X.map((_, i) => i).filter(i => !val[i]), va = X.map((_, i) => i).filter(i => val[i]);
const atkCount = [0, 0, 0]; tr.forEach(i => atkCount[A[i]]++);
const atkW = atkCount.map(c => Math.min(10, tr.length / (3 * Math.max(1, c))));
const model = tf.sequential();
model.add(tf.layers.dense({ units: 64, activation: 'tanh', inputShape: [TOBS_DIM] }));
model.add(tf.layers.dense({ units: 64, activation: 'tanh' }));
model.add(tf.layers.dense({ units: N_MOVE + N_ATK }));
const opt = tf.train.adam(1e-3);
const mk = (ids: number[]) => ({ x: tf.tensor2d(ids.map(i => X[i])), m: tf.oneHot(tf.tensor1d(ids.map(i => M[i]), 'int32'), N_MOVE), a: tf.oneHot(tf.tensor1d(ids.map(i => A[i]), 'int32'), N_ATK), w: tf.tensor1d(ids.map(i => atkW[A[i]])) });
const T = mk(tr); const t0 = performance.now();
for (let e = 0; e < epochs; e++) {
  opt.minimize(() => tf.tidy(() => {
    const z = model.apply(T.x) as tf.Tensor2D;
    const lm = tf.losses.softmaxCrossEntropy(T.m, z.slice([0, 0], [-1, N_MOVE]));
    const la = tf.mean(tf.mul(tf.neg(tf.sum(tf.mul(T.a, tf.logSoftmax(z.slice([0, N_MOVE], [-1, N_ATK]))), 1)), T.w));
    return tf.add(lm, la) as tf.Scalar;
  }));
}
function acc(ids: number[]) {
  if (!ids.length) return { move: NaN, atk: NaN };
  return tf.tidy(() => {
    const z = model.predict(tf.tensor2d(ids.map(i => X[i]))) as tf.Tensor2D;
    const pm = z.slice([0, 0], [-1, N_MOVE]).argMax(1).dataSync(), pa = z.slice([0, N_MOVE], [-1, N_ATK]).argMax(1).dataSync();
    let cm = 0, ca = 0; ids.forEach((i, k) => { if (pm[k] === M[i]) cm++; if (pa[k] === A[i]) ca++; });
    return { move: +(cm / ids.length).toFixed(3), atk: +(ca / ids.length).toFixed(3) };
  });
}
const ws = model.getWeights(); const layers = [];
for (let i = 0; i < ws.length; i += 2) { const [inDim, outDim] = ws[i].shape as [number, number]; layers.push({ inDim, outDim, w: Array.from(ws[i].dataSync()).map(v => +v.toFixed(5)), b: Array.from(ws[i + 1].dataSync()).map(v => +v.toFixed(5)), act: (i + 2 < ws.length ? 'tanh' : 'linear') as 'tanh' | 'linear' }); }
// majorité : référence naïve (toujours l'action la plus fréquente)
const maj = (arr: number[], ids: number[]) => { const c: Record<number, number> = {}; ids.forEach(i => c[arr[i]] = (c[arr[i]] ?? 0) + 1); return Math.max(...Object.values(c)) / Math.max(1, ids.length); };
const meta = { rounds: files.length, frames: X.length, train: tr.length, val: va.length, epochs, seconds: +((performance.now() - t0) / 1000).toFixed(1), accTrain: acc(tr), accVal: acc(va), majorityVal: { move: +maj(M, va).toFixed(3), atk: +maj(A, va).toFixed(3) } };
const j: ActorJSON = { version: `bc:${out}`, obsDim: TOBS_DIM, nAct: N_MOVE + N_ATK, layers, meta };
writeFileSync(out, JSON.stringify(j)); console.log(JSON.stringify(meta));
