// PPO-Clip multi-agents (paramètres partagés entre les 4 rôles, rôle en one-hot dans l'observation).
// Adapté de packages/backend-tfjs/src/agents/ppo.ts (github.com/IgnitionAI/ignition@52974ec, MIT) : même acteur-critique,
// GAE-λ, clip, entropie ; ajouté : inférence par lots et trajectoires séparées par agent.
import * as tf from '@tensorflow/tfjs-node';
import { writeFileSync, readFileSync } from 'node:fs';
import type { ActorJSON } from './policy';

export interface PPOCfg { lr: number; hidden: number[]; clip: number; epochs: number; minibatch: number; entCoef: number; vfCoef: number; gamma: number; lambda: number }
export const DEFAULT_PPO: PPOCfg = { lr: 3e-4, hidden: [128, 128], clip: 0.2, epochs: 4, minibatch: 2048, entCoef: 0.01, vfCoef: 0.5, gamma: 0.99, lambda: 0.95 };

function mlp(inDim: number, outDim: number, hidden: number[], lastStd: number) {
  const m = tf.sequential();
  hidden.forEach((h, i) => m.add(tf.layers.dense({ units: h, activation: 'tanh', inputShape: i === 0 ? [inDim] : undefined })));
  m.add(tf.layers.dense({ units: outDim, kernelInitializer: tf.initializers.randomNormal({ stddev: lastStd }) }));
  return m;
}

export class PPO {
  actor: tf.Sequential; critic: tf.Sequential; optA: tf.Optimizer; optC: tf.Optimizer;
  constructor(public obsDim: number, public nAct: number, public cfg: PPOCfg = DEFAULT_PPO) {
    this.actor = mlp(obsDim, nAct, cfg.hidden, 0.01); this.critic = mlp(obsDim, 1, cfg.hidden, 1.0);
    this.optA = tf.train.adam(cfg.lr); this.optC = tf.train.adam(cfg.lr);
  }
  act(obs: Float32Array, n: number): { probs: Float32Array; values: Float32Array } {
    return tf.tidy(() => {
      const x = tf.tensor2d(obs, [n, this.obsDim]);
      const probs = tf.softmax(this.actor.predict(x) as tf.Tensor).dataSync() as Float32Array;
      const values = (this.critic.predict(x) as tf.Tensor).dataSync() as Float32Array;
      return { probs: Float32Array.from(probs), values: Float32Array.from(values) };
    });
  }
  update(obs: Float32Array, acts: Int32Array, oldLp: Float32Array, adv: Float32Array, ret: Float32Array) {
    const N = acts.length, c = this.cfg; let mean = 0, sd = 0;
    for (let i = 0; i < N; i++) mean += adv[i]; mean /= N; for (let i = 0; i < N; i++) sd += (adv[i] - mean) ** 2; sd = Math.sqrt(sd / N) + 1e-8;
    const nadv = adv.map(a => (a - mean) / sd);
    const idx = Array.from({ length: N }, (_, i) => i); let pl = 0, vl = 0, ent = 0, kl = 0, nb = 0;
    for (let e = 0; e < c.epochs; e++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (let s = 0; s < N; s += c.minibatch) {
        const ids = idx.slice(s, s + c.minibatch), m = ids.length;
        const o = new Float32Array(m * this.obsDim), a = new Int32Array(m), lp = new Float32Array(m), ad = new Float32Array(m), r = new Float32Array(m);
        ids.forEach((k, q) => { o.set(obs.subarray(k * this.obsDim, (k + 1) * this.obsDim), q * this.obsDim); a[q] = acts[k]; lp[q] = oldLp[k]; ad[q] = nadv[k]; r[q] = ret[k]; });
        const stats = tf.tidy(() => {
          const O = tf.tensor2d(o, [m, this.obsDim]), A = tf.oneHot(tf.tensor1d(a, 'int32'), this.nAct), LP = tf.tensor1d(lp), AD = tf.tensor1d(ad), R = tf.tensor1d(r);
          let st: number[] = [];
          this.optA.minimize(() => {
            const logp = tf.logSoftmax(this.actor.apply(O) as tf.Tensor);
            const lpa = tf.sum(tf.mul(logp, A), 1); const ratio = tf.exp(tf.sub(lpa, LP));
            const surr = tf.minimum(tf.mul(ratio, AD), tf.mul(tf.clipByValue(ratio, 1 - c.clip, 1 + c.clip), AD));
            const entropy = tf.mean(tf.neg(tf.sum(tf.mul(tf.exp(logp), logp), 1)));
            const loss = tf.sub(tf.neg(tf.mean(surr)), tf.mul(entropy, c.entCoef));
            st = [loss.dataSync()[0], entropy.dataSync()[0], tf.mean(tf.sub(LP, lpa)).dataSync()[0]];
            return loss as tf.Scalar;
          }, false, this.actor.trainableWeights.map(w => (w as any).val));
          this.optC.minimize(() => {
            const v = tf.reshape(this.critic.apply(O) as tf.Tensor, [-1]);
            const l = tf.mul(tf.mean(tf.square(tf.sub(v, R))), c.vfCoef); st.push(l.dataSync()[0]); return l as tf.Scalar;
          }, false, this.critic.trainableWeights.map(w => (w as any).val));
          return st;
        });
        pl += stats[0]; ent += stats[1]; kl += stats[2]; vl += stats[3]; nb++;
      }
    }
    return { policyLoss: pl / nb, valueLoss: vl / nb, entropy: ent / nb, approxKL: kl / nb };
  }
  private dump(m: tf.Sequential) { return m.getWeights().map(w => ({ shape: w.shape, data: Array.from(w.dataSync()) })); }
  save(path: string, meta: Record<string, unknown> = {}) {
    writeFileSync(path, JSON.stringify({ obsDim: this.obsDim, nAct: this.nAct, hidden: this.cfg.hidden, actor: this.dump(this.actor), critic: this.dump(this.critic), meta }));
  }
  load(path: string) {
    const j = JSON.parse(readFileSync(path, 'utf8'));
    this.actor.setWeights(j.actor.map((w: any) => tf.tensor(w.data, w.shape)));
    this.critic.setWeights(j.critic.map((w: any) => tf.tensor(w.data, w.shape)));
  }
  exportActor(version: string, meta: Record<string, unknown> = {}): ActorJSON {
    const ws = this.actor.getWeights(); const layers = [];
    for (let i = 0; i < ws.length; i += 2) {
      const [inDim, outDim] = ws[i].shape as [number, number];
      layers.push({ inDim, outDim, w: Array.from(ws[i].dataSync()).map(v => +v.toFixed(5)), b: Array.from(ws[i + 1].dataSync()).map(v => +v.toFixed(5)), act: (i + 2 < ws.length ? 'tanh' : 'linear') as 'tanh' | 'linear' });
    }
    return { version, obsDim: this.obsDim, nAct: this.nAct, layers, meta };
  }
}
