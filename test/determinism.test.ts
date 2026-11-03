// Test binaire de reproductibilité (issue #5) : deux constructions avec la même graine doivent donner exactement
// les mêmes poids, deux entraînements avec la même graine les mêmes poids et les mêmes métriques, et une graine
// différente doit changer le hash (sinon le test passerait pour de mauvaises raisons).
// Exécution : `npm test` (ou `node --import tsx --test test/determinism.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as tf from '@tensorflow/tfjs-node';
import { bcModel } from '../src/model.ts';
import { PPO, DEFAULT_PPO } from '../src/ppo.ts';
import { mulberry32 } from '../src/rng.ts';

const OBS = 8; // dimensions d'observation réduites : le test doit rester < 1 min

/** Hash stable d'un jeu de poids : valeurs arrondies à 1e-9, pour ignorer le bruit de sérialisation. */
function hashWeights(ws: tf.Tensor[]): string {
  const h = createHash('sha256');
  for (const w of ws) { h.update(Array.from(w.dataSync() as Float32Array).map(v => v.toFixed(9)).join(',')); h.update('|'); }
  return h.digest('hex');
}
const hashModel = (m: tf.LayersModel) => hashWeights(m.getWeights());

/** Données synthétiques fixes (tirées d'une graine fixe) : seuls les poids/le brassage doivent varier d'un run à l'autre. */
function fixedData(n: number, dim: number, classes: number) {
  const r = mulberry32(1234);
  const X = new Float32Array(n * dim), Y = new Int32Array(n);
  for (let i = 0; i < n * dim; i++) X[i] = r() * 2 - 1;
  for (let i = 0; i < n; i++) Y[i] = Math.floor(r() * classes);
  return { X, Y, n, dim, classes };
}

/** 20 pas d'entraînement BC (même optimiseur et même perte que bc.ts, sur des données fixes). */
function trainBC(seed: number) {
  const D = fixedData(24, OBS, 12);
  const model = bcModel(16, OBS, 12, seed);
  const adam = tf.train.adam(3e-3);
  const x = tf.tensor2d(D.X, [D.n, OBS]);
  const y = tf.oneHot(tf.tensor1d(D.Y, 'int32'), 12);
  let loss = 0;
  for (let e = 0; e < 20; e++) {
    adam.minimize(() => {
      const logp = tf.logSoftmax(model.apply(x) as tf.Tensor);
      const ce = tf.neg(tf.sum(tf.mul(y, logp), 1));
      const l = tf.mean(ce) as tf.Scalar;
      loss = l.dataSync()[0];
      return l;
    });
  }
  return { hash: hashModel(model), loss: +loss.toFixed(9) };
}

/** 20 mises à jour PPO complètes (brassage des mini-lots inclus) sur des données fixes. */
function trainPPO(seed: number) {
  const cfg = { ...DEFAULT_PPO, hidden: [16, 16], minibatch: 16, epochs: 2 };
  const ppo = new PPO(OBS, 4, cfg, seed);
  const D = fixedData(48, OBS, 4);
  const obs = D.X, acts = D.Y, lp = new Float32Array(D.n), adv = new Float32Array(D.n), ret = new Float32Array(D.n);
  const r = mulberry32(99);
  for (let i = 0; i < D.n; i++) { lp[i] = Math.log(0.25); adv[i] = r() * 2 - 1; ret[i] = r() * 2 - 1; }
  let last = { policyLoss: 0, valueLoss: 0, entropy: 0, approxKL: 0 };
  for (let u = 0; u < 20; u++) last = ppo.update(obs, acts, lp, adv, ret);
  const metrics = Object.fromEntries(Object.entries(last).map(([k, v]) => [k, +v.toFixed(6)]));
  return { hash: hashWeights([...ppo.actor.getWeights(), ...ppo.critic.getWeights()]), metrics };
}

test('BC : même graine ⇒ mêmes poids ; graine différente ⇒ poids différents', () => {
  const a = hashModel(bcModel(16, OBS, 12, 7));
  const b = hashModel(bcModel(16, OBS, 12, 7));
  const c = hashModel(bcModel(16, OBS, 12, 8));
  assert.equal(a, b, 'deux constructions à graine 7 doivent être identiques');
  assert.notEqual(a, c, 'une graine différente doit changer les poids (sinon le test ne prouve rien)');
});

test('BC : 20 mises à jour, même graine ⇒ même hash et même perte', () => {
  const a = trainBC(7), b = trainBC(7), c = trainBC(8);
  assert.deepEqual(a, b, 'même graine ⇒ même modèle et même perte après 20 mises à jour');
  assert.notEqual(a.hash, c.hash, 'une graine différente doit diverger dès l\'initialisation');
});

test('PPO : même graine ⇒ mêmes poids et mêmes métriques sur 20 mises à jour', () => {
  const a = trainPPO(3), b = trainPPO(3), c = trainPPO(4);
  assert.deepEqual(a, b, 'même graine ⇒ mêmes poids et mêmes métriques (brassage des mini-lots compris)');
  assert.notEqual(a.hash, c.hash, 'une graine différente doit changer les poids');
});
