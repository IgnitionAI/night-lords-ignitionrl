// Calage locomotion : foulée skinée, timeScale, bandes de gait. Sortie brute obligatoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { DT, NL_CFG, T_CFG } from '../src/sim.ts';
import {
  DISPLAY_FRAME, MIXER_MAX_ANIM_STEP, advanceMixer, cycleDistance, displayMixerDelta,
  gaitTimeScale, mixerSubstepCount, pickGait,
} from '../web/locomotion.ts';
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

test('sous-pas mixer : même timeScale et même temps final, plus de poses intermédiaires', async () => {
  const jobs: { name: string; gait: 'walk' | 'run'; speed: number }[] = [
    { name: 'NL-1', gait: 'run', speed: NL_CFG.speed },
    { name: 'NL-1', gait: 'walk', speed: NL_CFG.speed * T_CFG.stunSpeed },
    { name: 'TERM', gait: 'walk', speed: T_CFG.fwd },
  ];
  console.log('\n# locomotion — sous-pas mixer (DT inchangé, timeScale inchangé)');
  console.log('# N = ceil(|dt·timeScale| / (1/30)) ; somme des sous-pas = DT ; pose finale = un seul update(DT)');
  assert.equal(DT, 0.1);
  assert.equal(MIXER_MAX_ANIM_STEP, 1 / 30);
  assert.equal(mixerSubstepCount(0, 3), 1);
  assert.equal(mixerSubstepCount(DT, 0), 1);
  assert.equal(mixerSubstepCount(DT, 3), 9);
  const loadedBy = new Map<string, Awaited<ReturnType<typeof loadScaled>>>();
  for (const job of jobs) {
    if (!loadedBy.has(job.name)) loadedBy.set(job.name, await loadScaled(job.name));
    const loaded = loadedBy.get(job.name)!;
    const clip = job.gait === 'walk' ? loaded.walk : loaded.run;
    const sample = measureForwardStride(loaded.root, clip);
    const ts = gaitTimeScale(job.speed, sample.stride, sample.duration);
    const n = mixerSubstepCount(DT, ts);
    assert.ok(n >= 2, `${job.name} ${job.gait} doit sous-échantillonner DT`);

    const mk = () => {
      const mixer = new THREE.AnimationMixer(loaded.root);
      const action = mixer.clipAction(clip);
      action.play();
      action.timeScale = ts;
      return { mixer, action };
    };
    const one = mk();
    one.mixer.update(DT);
    const coarseTime = one.action.time;
    const coarseMixer = one.mixer.time;

    const fine = mk();
    const times: number[] = [];
    const steps: number[] = [];
    advanceMixer(fine.mixer, DT, n, (_i, h) => {
      times.push(fine.action.time);
      steps.push(h);
    });
    const row = {
      role: job.name, gait: job.gait, speed_mps: job.speed,
      DT, timeScale: ts, substeps: n,
      stepDt: DT / n, animStep_s: (DT / n) * ts,
      mixerTime_one: coarseMixer, mixerTime_sub: fine.mixer.time,
      actionTime_one: coarseTime, actionTime_sub: fine.action.time,
      intermediatePoses: times.length,
      stepSum: steps.reduce((a, b) => a + b, 0),
    };
    console.log(JSON.stringify(row, null, 2));
    assert.equal(fine.action.timeScale, ts, 'timeScale figé pendant les sous-pas');
    assert.equal(one.action.timeScale, ts);
    assert.equal(times.length, n);
    assert.ok(Math.abs(steps.reduce((a, b) => a + b, 0) - DT) < 1e-12, 'somme des sous-pas = DT');
    assert.ok(Math.abs(fine.mixer.time - coarseMixer) < 1e-9, 'même temps mixer final');
    assert.ok(Math.abs(fine.action.time - coarseTime) < 1e-9, 'même temps clip final');
    assert.ok(Math.abs(fine.mixer.time - DT) < 1e-9, 'mixer.timeScale=1 : temps mixer = DT');
    const unique = new Set(times.map((t) => t.toFixed(9)));
    assert.ok(unique.size >= 2, 'plus d\'une pose clip sur le DT');
    assert.ok((DT / n) * ts <= MIXER_MAX_ANIM_STEP + 1e-12, 'pas d\'anim par sous-pas ≤ 1/30 s');
    assert.equal(job.gait === 'run' ? NL_CFG.speed : job.name === 'TERM' ? T_CFG.fwd : NL_CFG.speed * T_CFG.stunSpeed, job.speed);
  }
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

test('6 frames 1/60 s : 6 poses distinctes, somme = DT, pas de glisse', async () => {
  assert.equal(DT, 0.1);
  assert.ok(Math.abs(DISPLAY_FRAME * 6 - DT) < 1e-12);
  const loaded = await loadScaled('NL-1');
  const clip = loaded.run;
  const sample = measureForwardStride(loaded.root, clip);
  const speed = NL_CFG.speed;
  const ts = gaitTimeScale(speed, sample.stride, sample.duration);
  const mixer = new THREE.AnimationMixer(loaded.root);
  const action = mixer.clipAction(clip);
  action.play();
  action.timeScale = ts;
  let mixerSim = 0;
  const times: number[] = [];
  const steps: number[] = [];
  console.log('\n# locomotion — 6 frames d\'affichage (1/60 s), DT=0,1, timeScale figé');
  for (let i = 0; i < 6; i++) {
    const displaySim = (i + 1) * DISPLAY_FRAME;
    const step = displayMixerDelta(DISPLAY_FRAME, mixerSim, displaySim);
    mixer.update(step);
    mixerSim += step;
    steps.push(step);
    times.push(action.time);
  }
  const sum = steps.reduce((a, b) => a + b, 0);
  const after = cycleDistance(speed, sample.duration, ts);
  const world = speed * sum;
  const expectedWorld = sample.stride * ((sum * ts) / sample.duration);
  const row = {
    role: 'NL-1', gait: 'run', speed_mps: speed, DT, frame_s: DISPLAY_FRAME, frames: 6,
    timeScale: ts, stride_m: sample.stride, hipsDeltaXZ_m: sample.hipXz,
    stepSum: sum, mixerTime: mixer.time, actionTime: action.time,
    poses: times, uniquePoses: new Set(times.map((t) => t.toFixed(9))).size,
    distCycle_m: after, slip_cycle_m: after - sample.stride,
    world_m: world, expectedWorld_m: expectedWorld, slip_frames_m: world - expectedWorld,
  };
  console.log(JSON.stringify(row, null, 2));
  assert.equal(action.timeScale, ts);
  assert.equal(times.length, 6);
  assert.ok(Math.abs(sum - DT) < 1e-12, 'somme des frames = DT');
  assert.equal(new Set(times.map((t) => t.toFixed(9))).size, 6, '6 poses clip distinctes');
  assert.ok(Math.abs(mixer.time - DT) < 1e-9);
  assert.ok(Math.abs(action.time - ts * DT) < 1e-9);
  assert.ok(Math.abs(after - sample.stride) < 1e-9, '1 cycle = 1 foulée');
  assert.ok(Math.abs(world - expectedWorld) < 1e-9, 'pas de glisse sur 6 frames');
  assert.ok(sample.hipXz < 1e-4, 'pas de root motion Hips XZ');
  assert.ok(displayMixerDelta(DISPLAY_FRAME, DT, DT) === 0, 'jamais en avance sur la sim');
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});
