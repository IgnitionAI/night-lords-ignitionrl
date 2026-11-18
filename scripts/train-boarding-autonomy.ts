import * as tf from '@tensorflow/tfjs-node';
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_PPO, PPO } from '../src/ppo';
import { BOARD_ACTIONS, BOARD_OBS, BOARD_VERSION } from '../src/strategy/boarding-agents';
import { mulberry32 } from '../src/rng';
import type { Demo } from './boarding-demonstrations';
import { actorPath, digest, initial, initialActor, readJSON, runRoot, seeds } from './boarding-experiment';

const [branch, seedArg] = process.argv.slice(2);
const seed = Number(seedArg);
if (!seeds.includes(seed) || !['imitation', 'candidate', 'ordinary', 'reminders'].includes(branch)) {
  throw Error('Use imitation, candidate, ordinary or reminders, then a registered seed');
}
const dir = runRoot + '/' + seed;
mkdirSync(dir, { recursive: true });
const ppo = new PPO(BOARD_OBS, BOARD_ACTIONS, { ...DEFAULT_PPO, hidden: [48, 48],
  lr: .0003, epochs: 4, minibatch: 128 }, seed);
const base = initialActor();
for (const name of ['actor', 'critic'] as const) tf.tidy(() => {
  ppo[name].setWeights(initial[name].map((w: {data:number[];shape:number[]}) => tf.tensor(w.data, w.shape)));
});
if (branch === 'candidate' || branch === 'reminders') {
  const warm = readJSON(dir + '/imitation-weights.json');
  tf.tidy(() => ppo.actor.setWeights(warm.map((w: {data:number[];shape:number[]}) => tf.tensor(w.data, w.shape))));
}
const demos: Demo[] = readJSON(runRoot + '/demos.json');
const batchRng = mulberry32(seed + 50000);
const batch = 128;
const write = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data));
const startHash = digest(JSON.stringify(ppo.exportActor(BOARD_VERSION).layers));
let supervisedSteps = 0;
function teach(ids: number[], optimizer: tf.Optimizer, strength: number) {
  const rows = ids.map(i => demos[i]);
  tf.tidy(() => {
    const inputs = tf.tensor2d(rows.map(r => r.observation));
    // The old actor supplies the posture marginal. Only objective labels come from the teacher.
    const labels = tf.tensor2d(rows.map(r => Array.from({length: 12}, (_, a) =>
      r.postures[Math.floor(a / 3)] * ((a % 3 === r.objective ? .97 : 0) + .01))));
    optimizer.minimize(() => {
      const logits = ppo.actor.apply(inputs) as tf.Tensor;
      return tf.logSoftmax(logits).mul(labels).sum(1).mean().mul(-strength) as tf.Scalar;
    }, false, ppo.actor.trainableWeights.map(w => (w as any).val));
  });
  supervisedSteps++;
}
function reminder(update: number, opt: tf.Optimizer) {
  if (update > 30) return;
  const ids = Array.from({length: batch}, () => Math.floor(batchRng() * demos.length));
  teach(ids, opt, (31 - update) / 30);
}
function save(update: number, extra: Record<string, unknown> = {}) {
  const meta = { ...base.meta, experiment: 'autonomie-1', branch, trainingSeed: seed,
    initialActorHash: startHash, supervisedSteps, updates: update, ...extra };
  write(actorPath(seed, branch, update), ppo.exportActor(BOARD_VERSION, meta));
}
if (branch === 'imitation') {
  const opt = tf.train.adam(.001);
  const ids = demos.map((_, i) => i);
  for (let epoch = 0; epoch < 20; epoch++) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(batchRng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    for (let s = 0; s < ids.length; s += batch) teach(ids.slice(s, s + batch), opt, 1);
  }
  const agreement = tf.tidy(() => {
    const logits = ppo.actor.predict(tf.tensor2d(demos.map(d => d.observation))) as tf.Tensor;
    const decisions = logits.argMax(1).dataSync();
    return demos.reduce((n, row, i) => n + Number(decisions[i] % 3 === row.objective), 0) / demos.length;
  });
  const weights = ppo.actor.getWeights().map(t => ({shape: t.shape, data: Array.from(t.dataSync())}));
  write(dir + '/imitation-weights.json', weights);
  save(0, { demoEpisodes: 108, demoExamples: demos.length, trainingAgreement: agreement, transitions: 0 });
  console.log({ branch, seed, agreement, supervisedSteps, examples: demos.length });
} else if (branch === 'reminders') {
  const opt = tf.train.sgd(.003);
  for (let update = 1; update <= 30; update++) reminder(update, opt);
  save(30, { transitions: 0, demoExamples: demos.length });
} else {
  const { trainReinforcement } = await import('./boarding-reinforcement');
  const opt = tf.train.sgd(.003);
  trainReinforcement(ppo, seed, dir, branch, update => {
    if (branch === 'candidate') reminder(update, opt);
  }, save);
}
