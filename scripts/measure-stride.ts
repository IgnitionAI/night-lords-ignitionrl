// Preuve CLI : foulée skinée + distance par cycle avant/après calage. Exit 0.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NL_CFG, T_CFG } from '../src/sim.ts';
import { cycleDistance, gaitTimeScale, pickGait } from '../web/locomotion.ts';
import {
  NL_HEIGHT, TERM_HEIGHT, measureForwardStride, measureHeight, parseGlb, pickClip,
} from '../web/stride.ts';

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', 'web/models');

class FakeImage {
  width = 1;
  height = 1;
  complete = true;
  onload: ((this: FakeImage, ev: unknown) => unknown) | null = null;
  set src(_v: string) { queueMicrotask(() => this.onload?.(null)); }
}
(globalThis as { Image?: unknown }).Image = FakeImage;
(globalThis as { self?: typeof globalThis }).self = globalThis;

const muteTex = (orig: typeof console.warn) => (...args: unknown[]) => {
  if (String(args[0] ?? '').includes("Couldn't load texture")) return;
  orig(...args);
};
console.warn = muteTex(console.warn.bind(console));
console.error = muteTex(console.error.bind(console));

async function loadScaled(name: string) {
  const pose = await parseGlb(readFileSync(join(MODELS, `${name}.glb`)));
  const walkG = await parseGlb(readFileSync(join(MODELS, `${name}-walk.glb`)));
  const runG = await parseGlb(readFileSync(join(MODELS, `${name}-run.glb`)));
  const root = pose.scene;
  const h = measureHeight(root);
  const target = name === 'TERM' ? TERM_HEIGHT : NL_HEIGHT;
  root.scale.setScalar(target / h);
  root.rotation.y = Math.PI / 2;
  root.updateMatrixWorld(true);
  return {
    root, h, target, scale: target / h,
    walk: pickClip([...walkG.animations, ...runG.animations], 'walk')!,
    run: pickClip([...walkG.animations, ...runG.animations], 'run')!,
  };
}

const jobs: { name: string; gait: 'walk' | 'run'; speed: number; allowRun: boolean }[] = [
  { name: 'NL-1', gait: 'run', speed: NL_CFG.speed, allowRun: true },
  { name: 'NL-1', gait: 'walk', speed: NL_CFG.speed * T_CFG.stunSpeed, allowRun: true },
  { name: 'TERM', gait: 'walk', speed: T_CFG.fwd, allowRun: false },
];

console.log('# measure-stride — timeScale=1 vs calé');
for (const job of jobs) {
  const loaded = await loadScaled(job.name);
  const clip = job.gait === 'walk' ? loaded.walk : loaded.run;
  const sample = measureForwardStride(loaded.root, clip);
  const nlBand = { allowRun: job.allowRun, walkSpeed: NL_CFG.speed * T_CFG.stunSpeed, runSpeed: NL_CFG.speed };
  const termBand = { allowRun: false, walkSpeed: T_CFG.fwd, runSpeed: T_CFG.fwd };
  const gait = pickGait(job.speed, job.name === 'TERM' ? termBand : nlBand);
  const ts = gaitTimeScale(job.speed, sample.stride, sample.duration);
  const before = cycleDistance(job.speed, sample.duration, 1);
  const after = cycleDistance(job.speed, sample.duration, ts);
  console.log(JSON.stringify({
    role: job.name, clip: job.gait, picked: gait, speed_mps: job.speed,
    heightNative_m: loaded.h, scale: loaded.scale,
    duration_s: sample.duration, nKeys: sample.nKeys, firstKey_s: sample.firstKey,
    stride_m: sample.stride, hipsDeltaXZ_m: sample.hipXz,
    loopTrackDelta: sample.loopTrackDelta, poseT0VsFirst_m: sample.poseT0VsFirst,
    distCycle_before_m: before, slip_before_m: before - sample.stride,
    timeScale_after: ts, distCycle_after_m: after, slip_after_m: after - sample.stride,
  }, null, 2));
  if (gait !== job.gait) throw new Error(`gait ${gait} != ${job.gait}`);
  if (Math.abs(after - sample.stride) > 1e-9) throw new Error('calage raté');
}
console.log('measure-stride ok');
