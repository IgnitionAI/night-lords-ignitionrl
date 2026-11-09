// Calage locomotion : foulée skinée, timeScale, bandes de gait. Sortie brute obligatoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  const clips = [...walkG.animations, ...runG.animations];
  return { root, h, target, scale: target / h, walk: pickClip(clips, 'walk')!, run: pickClip(clips, 'run')! };
}

test('bandes de gait : stun NL → walk, course NL → run, TERM sans sprint', () => {
  const nl = { allowRun: true, walkSpeed: NL_CFG.speed * T_CFG.stunSpeed, runSpeed: NL_CFG.speed };
  const term = { allowRun: false, walkSpeed: T_CFG.fwd, runSpeed: T_CFG.fwd };
  assert.equal(pickGait(0, nl), 'idle');
  assert.equal(pickGait(NL_CFG.speed * T_CFG.stunSpeed, nl), 'walk');
  assert.equal(pickGait(NL_CFG.speed, nl), 'run');
  assert.equal(pickGait(T_CFG.fwd, term), 'walk');
  assert.equal(pickGait(T_CFG.fwd * T_CFG.slowScale, term), 'walk');
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

test('foulée skinée et distance par cycle avant/après timeScale', async () => {
  const jobs: { name: string; gait: 'walk' | 'run'; speed: number }[] = [
    { name: 'NL-1', gait: 'run', speed: NL_CFG.speed },
    { name: 'NL-1', gait: 'walk', speed: NL_CFG.speed * T_CFG.stunSpeed },
    { name: 'TERM', gait: 'walk', speed: T_CFG.fwd },
  ];
  console.log('\n# locomotion — distance par cycle (timeScale=1 vs calé)');
  console.log('# foulée = moyenne L/R du ΔX des contacts pied (skin), après AABB→hauteur cible, rotation.y=π/2');
  console.log('# timeScale = v · T / foulée   dist/cycle = v · T / timeScale');
  for (const job of jobs) {
    const loaded = await loadScaled(job.name);
    assert.ok(loaded.h > 1.69 && loaded.h < 1.71, `${job.name} hauteur native ${loaded.h}`);
    assert.equal(loaded.target, job.name === 'TERM' ? 2.6 : 2.0);
    const clip = job.gait === 'walk' ? loaded.walk : loaded.run;
    const sample = measureForwardStride(loaded.root, clip);
    const ts1 = 1;
    const tsCal = gaitTimeScale(job.speed, sample.stride, sample.duration);
    const before = cycleDistance(job.speed, sample.duration, ts1);
    const after = cycleDistance(job.speed, sample.duration, tsCal);
    const row = {
      role: job.name, gait: job.gait, speed_mps: job.speed,
      heightNative_m: loaded.h, scale: loaded.scale, target_m: loaded.target,
      nKeys: sample.nKeys, duration_s: sample.duration, firstKey_s: sample.firstKey,
      strideL_m: sample.left, strideR_m: sample.right, stride_m: sample.stride,
      hipsDeltaXZ_m: sample.hipXz,
      loopTrackDelta: sample.loopTrackDelta,
      poseT0VsFirst_m: sample.poseT0VsFirst,
      poseFirstVsLast_m: sample.poseFirstVsLast,
      timeScale_before: ts1, distCycle_before_m: before,
      slip_before_m: before - sample.stride,
      timeScale_after: tsCal, distCycle_after_m: after,
      slip_after_m: after - sample.stride,
    };
    console.log(JSON.stringify(row, null, 2));
    assert.ok(sample.stride > 0.5, 'foulée mesurée au skin');
    assert.ok(sample.hipXz < 1e-4, 'pas de root motion Hips XZ');
    assert.ok(Math.abs(after - sample.stride) < 1e-9, 'après calage, 1 cycle = 1 foulée');
    assert.ok(Math.abs(before - sample.stride) > 0.5, 'avant calage, glissement réel');
    assert.ok(sample.loopTrackDelta < 1e-3, 'première et dernière clés du clip coïncident');
    assert.ok(sample.poseT0VsFirst < 1e-4, 't=0 clamp sur la première clé : pas de saut bind');
    assert.ok(sample.poseFirstVsLast < 1e-4, 'boucle first≈last au skin');
  }
});
