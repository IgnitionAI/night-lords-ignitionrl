import * as tf from '@tensorflow/tfjs-node';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { TOBS_DIM, BC_HEADS, moveToHeads } from './tobs';
import type { Recording } from './recorder';
import type { ActorJSON } from './policy';
import { bcModel } from './model';
import { validateRecording, type Provenance } from './recording-schema';

export type HeadMetrics = { fwd: number; strafe: number; turn: number; atk: number; joint: number };

export interface BcTrainOpts {
  recordings: unknown[];
  out: string;
  runJson?: string;
  epochs?: number;
  patience?: number;
  hidden?: number;
  seed?: number;
  trainIdx?: number[];
  valIdx?: number[];
  versionPrefix?: string;
  extraMeta?: Record<string, unknown>;
}

export interface BcTrainResult {
  actor: ActorJSON;
  meta: Record<string, unknown> & { accVal: HeadMetrics | null; majorityVal: HeadMetrics | null };
}

export function temporalBlockSplit(n: number): { train: number[]; val: number[] } {
  const train: number[] = [], val: number[] = [];
  for (let i = 0; i < n; i++) (Math.floor(i / 10) % 5 === 2 ? val : train).push(i);
  return { train, val };
}

/** Les indices DAgger (`extra`) rejoignent le train ; la validation reste celle du préfixe initial. */
export function mergeDaggerFrames(initialCount: number, extra: number[]): { train: number[]; val: number[]; all: number[] } {
  const split = temporalBlockSplit(initialCount);
  const all = [...Array(initialCount).keys(), ...extra];
  return { train: [...split.train, ...extra], val: split.val, all };
}

function provenanceOf(recs: Recording[]): Provenance {
  const kinds = new Set(recs.map(r => r.provenance?.kind ?? 'human'));
  if (kinds.size === 1 && kinds.has('synthetic')) {
    return { kind: 'synthetic', label: recs[0]!.provenance?.label ?? recs[0]!.source, oracle: recs[0]!.provenance?.oracle };
  }
  if (kinds.size === 1 && kinds.has('human')) return { kind: 'human', label: recs[0]!.source };
  if (kinds.size === 1 && kinds.has('mixed')) {
    return { kind: 'mixed', label: recs[0]!.provenance?.label ?? recs[0]!.source };
  }
  return { kind: 'mixed', label: 'mélange humain/synthétique (ne pas traiter comme imitation humaine)' };
}

export function framesFromRecordings(raws: unknown[]): { recs: Recording[]; X: number[][]; Y: number[][]; provenance: Provenance } {
  const recs = raws.map(r => validateRecording(r));
  const X: number[][] = [], Y: number[][] = [];
  for (const rec of recs) {
    for (const fr of rec.frames) {
      X.push(fr.o!);
      Y.push([...moveToHeads(fr.move!), fr.atk!]);
    }
  }
  if (!X.length) throw new Error('aucune frame avec observation');
  return { recs, X, Y, provenance: provenanceOf(recs) };
}

export function trainBehaviorCloning(opts: BcTrainOpts): BcTrainResult {
  const epochs = opts.epochs ?? 300, patience = opts.patience ?? 30, hidden = opts.hidden ?? 64, seed = opts.seed ?? 1;
  const { recs, X, Y, provenance } = framesFromRecordings(opts.recordings);
  const split = temporalBlockSplit(X.length);
  const tr = opts.trainIdx ?? split.train;
  const va = opts.valIdx ?? split.val;
  const cw = BC_HEADS.map((n, h) => {
    const c = new Array(n).fill(0);
    tr.forEach(i => c[Y[i]![h]!]++);
    return c.map(k => Math.min(10, tr.length / (n * Math.max(1, k))));
  });
  const model = bcModel(hidden, TOBS_DIM, BC_HEADS.reduce((a, b) => a + b, 0), seed);
  const adam = tf.train.adam(3e-3);
  const tensors = (ids: number[]) => ({
    x: tf.tensor2d(ids.map(i => X[i]!), [ids.length, TOBS_DIM]),
    y: BC_HEADS.map((n, h) => tf.oneHot(tf.tensor1d(ids.map(i => Y[i]![h]!), 'int32'), n)),
    w: BC_HEADS.map((_, h) => tf.tensor1d(ids.map(i => cw[h]![Y[i]![h]!]!))),
  });
  const T = tensors(tr), V = va.length ? tensors(va) : T;
  function loss(D: ReturnType<typeof tensors>, weighted: boolean) {
    const z = model.apply(D.x) as tf.Tensor2D; let off = 0, tot: tf.Tensor = tf.scalar(0);
    BC_HEADS.forEach((n, h) => {
      const lp = tf.logSoftmax(z.slice([0, off], [-1, n])); off += n;
      const ce = tf.neg(tf.sum(tf.mul(D.y[h]!, lp), 1));
      tot = tf.add(tot, tf.mean(weighted ? tf.mul(ce, D.w[h]!) : ce));
    });
    return tot as tf.Scalar;
  }
  const t0 = performance.now(); let best = Infinity, bestW: tf.Tensor[] = [], since = 0, used = 0;
  for (let e = 0; e < epochs; e++) {
    adam.minimize(() => loss(T, true)); used = e + 1;
    const vl = tf.tidy(() => loss(V, false).dataSync()[0]);
    if (vl < best - 1e-4) {
      best = vl; bestW.forEach(w => w.dispose()); bestW = model.getWeights().map(w => w.clone()); since = 0;
    } else if (++since >= patience) break;
  }
  model.setWeights(bestW);
  function acc(ids: number[]): HeadMetrics | null {
    if (!ids.length) return null;
    return tf.tidy(() => {
      const z = model.predict(tf.tensor2d(ids.map(i => X[i]!), [ids.length, TOBS_DIM])) as tf.Tensor2D; let off = 0;
      const preds = BC_HEADS.map(n => { const p = z.slice([0, off], [-1, n]).argMax(1).dataSync(); off += n; return p; });
      const per = BC_HEADS.map((_, h) => +(ids.filter((i, k) => preds[h]![k] === Y[i]![h]).length / ids.length).toFixed(3));
      const joint = +(ids.filter((i, k) => BC_HEADS.every((_, h) => preds[h]![k] === Y[i]![h])).length / ids.length).toFixed(3);
      return { fwd: per[0]!, strafe: per[1]!, turn: per[2]!, atk: per[3]!, joint };
    });
  }
  const majority = (ids: number[]): HeadMetrics => {
    const mode = BC_HEADS.map((n, h) => {
      const c = new Array(n).fill(0); tr.forEach(i => c[Y[i]![h]!]++); return c.indexOf(Math.max(...c));
    });
    const per = BC_HEADS.map((_, h) => +(ids.filter(i => Y[i]![h] === mode[h]).length / Math.max(1, ids.length)).toFixed(3));
    const joint = +(ids.filter(i => BC_HEADS.every((_, h) => Y[i]![h] === mode[h])).length / Math.max(1, ids.length)).toFixed(3);
    return { fwd: per[0]!, strafe: per[1]!, turn: per[2]!, atk: per[3]!, joint };
  };
  const ws = model.getWeights(); const layers: ActorJSON['layers'] = [];
  for (let i = 0; i < ws.length; i += 2) {
    const [inDim, outDim] = ws[i]!.shape as [number, number];
    layers.push({
      inDim, outDim,
      w: Array.from(ws[i]!.dataSync()).map(v => +v.toFixed(5)),
      b: Array.from(ws[i + 1]!.dataSync()).map(v => +v.toFixed(5)),
      act: (i + 2 < ws.length ? 'tanh' : 'linear'),
    });
  }
  const meta = {
    heads: 'fwd,strafe,turn,atk',
    seed,
    rounds: recs.length,
    frames: X.length,
    train: tr.length,
    val: va.length,
    epochsUsed: used,
    seconds: +((performance.now() - t0) / 1000).toFixed(1),
    valLoss: +best.toFixed(4),
    accTrain: acc(tr),
    accVal: acc(va),
    majorityVal: majority(va),
    provenance,
    disclaimer: ((): string => {
      switch (provenance.kind) {
        case 'human': return 'provenance humaine déclarée — ne pas inventer de convergence';
        case 'synthetic':
        case 'mixed': return 'données synthétiques : aucune métrique de style humain';
        default: { const _e: never = provenance.kind; throw new Error(String(_e)); }
      }
    })(),
    ...opts.extraMeta,
  };
  const prefix = opts.versionPrefix ?? 'bc-factored';
  const actor: ActorJSON = {
    version: `${prefix}:${opts.out.split('/').pop()}`,
    obsDim: TOBS_DIM,
    nAct: BC_HEADS.reduce((a, b) => a + b, 0),
    layers,
    meta,
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(actor));
  if (opts.runJson) {
    mkdirSync(dirname(opts.runJson), { recursive: true });
    writeFileSync(opts.runJson, JSON.stringify({
      ...meta,
      budget: { epochs, patience, hidden, seed },
      out: opts.out,
    }, null, 1));
  }
  return { actor, meta };
}

export function trainBehaviorCloningFromFiles(opts: Omit<BcTrainOpts, 'recordings'> & { files: string[] }): BcTrainResult {
  const recordings = opts.files.map(f => JSON.parse(readFileSync(f, 'utf8')));
  return trainBehaviorCloning({ ...opts, recordings });
}
