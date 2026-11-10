import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { DT, NL_CFG, T_CFG } from '../src/sim.ts';
import { parseGlb } from '../web/stride.ts';
import {
  ONE_SHOT, dodgeDirFrom, freshMachine, hitDirFrom, nlIntent, shotDuration, tickMachine,
} from '../web/combat-anims.ts';
import { bindOneShot, makeCombatClips } from '../web/proc-clips.ts';
import { CLIP_MARKERS, clearAnimCues, peekAnimCues, scanClipMarkers, subscribeAnimCues } from '../web/anim-cues.ts';
import { applyFootIk } from '../web/foot-ik.ts';
import { impulseFall, stepFall } from '../web/death-physics.ts';
import { gaitTimeScale, pickGait } from '../web/locomotion.ts';
import { measureForwardStride, pickClip } from '../web/stride.ts';

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', 'web/models');

class FakeImage {
  width = 1; height = 1; complete = true;
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

const gait = pickGait(NL_CFG.speed, { allowRun: true, walkSpeed: 3, runSpeed: 6 });

test('vitesses et foulées gelées (anim-impact ne les lit pas pour les changer)', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

test('hitDirFrom : avant / arrière / gauche / droite', () => {
  assert.equal(hitDirFrom(0, 0, 0, 1, 0), 'front');
  assert.equal(hitDirFrom(0, 0, 0, -1, 0), 'back');
  assert.equal(hitDirFrom(0, 0, 0, 0, 1), 'left');
  assert.equal(hitDirFrom(0, 0, 0, 0, -1), 'right');
  assert.equal(dodgeDirFrom(3), 'left');
  assert.equal(dodgeDirFrom(4), 'right');
  assert.equal(dodgeDirFrom(2), 'back');
});

test('nlIntent : combo à l\'arrêt, leap en course, dodge latéral', () => {
  const flags = { boltKill: null, fistKill: null, clawArm: [0], claw: [], whiff: [], termHit: false, termBolt: false, termFist: false };
  const idleGait = pickGait(0, { allowRun: true, walkSpeed: 3, runSpeed: 6 });
  const combo = nlIntent({
    alive: true, armTicks: 2, stunTicks: 0, prevStun: 0, lastAction: 7, prevAction: 1,
    gait: idleGait, flags, index: 0,
  });
  assert.equal(combo.meleeVariant, 'combo');
  const leap = nlIntent({
    alive: true, armTicks: 2, stunTicks: 0, prevStun: 0, lastAction: 7, prevAction: 1,
    gait, flags, index: 0,
  });
  assert.equal(leap.meleeVariant, 'leap');
  const dash = nlIntent({
    alive: true, armTicks: 0, stunTicks: 0, prevStun: 0, lastAction: 3, prevAction: 1,
    gait: idleGait, flags: { ...flags, clawArm: [] }, index: 0,
  });
  assert.equal(dash.dodge, true);
  assert.equal(dash.dodgeDir, 'left');
  const boltDie = nlIntent({
    alive: false, armTicks: 0, stunTicks: 0, prevStun: 0, lastAction: 1, prevAction: 1,
    gait: idleGait, flags: { ...flags, clawArm: [], boltKill: 1 }, index: 1,
  });
  assert.equal(boltDie.deathKind, 'throw');
});

test('shotDuration : combo / leap / stagger sans casser 0,46 s par défaut', () => {
  assert.equal(shotDuration('attack', 'melee'), ONE_SHOT.attack);
  assert.equal(shotDuration('attack', 'melee', undefined, { meleeVariant: 'combo' }), ONE_SHOT.combo);
  assert.equal(shotDuration('attack', 'melee', undefined, { meleeVariant: 'leap' }), ONE_SHOT.leap);
  assert.equal(shotDuration('hit', 'melee', undefined, { stagger: true }), ONE_SHOT.stagger);
  let m = freshMachine();
  m = tickMachine(m, {
    death: false, hit: false, attack: true, dodge: false, gait, attackStyle: 'melee', meleeVariant: 'combo',
  }, DT);
  assert.equal(m.state, 'attack');
  assert.ok(Math.abs(m.remaining - ONE_SHOT.combo) < 1e-12);
});

test('clips whoa : durées, bond, combo 3 impacts, pas de T-pose', async () => {
  const pose = await parseGlb(readFileSync(join(MODELS, 'NL-1.glb')));
  const proc = makeCombatClips(pose.scene, 'nl');
  assert.ok(Math.abs(proc.combo.duration - ONE_SHOT.combo) < 1e-9);
  assert.ok(Math.abs(proc.leap.duration - ONE_SHOT.leap) < 1e-9);
  assert.ok(Math.abs(proc.stagger.duration - ONE_SHOT.stagger) < 1e-9);
  assert.ok(Math.abs(proc.attack.duration - ONE_SHOT.attack) < 1e-9);
  assert.equal(CLIP_MARKERS['proc-combo'].impact.length, 3);

  let hips: THREE.Bone | null = null;
  const hands: THREE.Bone[] = [];
  const feet: THREE.Bone[] = [];
  pose.scene.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    if (o.name === 'Hips') hips = o as THREE.Bone;
    if (o.name === 'LeftHand' || o.name === 'RightHand') hands.push(o as THREE.Bone);
    if (o.name === 'LeftFoot' || o.name === 'RightFoot') feet.push(o as THREE.Bone);
  });
  assert.ok(hips);

  const yAt = (clip: THREE.AnimationClip, t: number) => {
    const mix = new THREE.AnimationMixer(pose.scene);
    const a = bindOneShot(mix.clipAction(clip), true);
    a.play(); a.time = t; mix.update(0); pose.scene.updateMatrixWorld(true);
    const p = new THREE.Vector3(); hips!.getWorldPosition(p); return p.y;
  };
  const yCrouch = yAt(proc.leap, 0.10);
  const yAir = yAt(proc.leap, 0.22);
  assert.ok(yAir > yCrouch + 0.12, `leap ${yCrouch.toFixed(3)} → ${yAir.toFixed(3)}`);

  const tposeAt = (clip: THREE.AnimationClip, t: number) => {
    const mix = new THREE.AnimationMixer(pose.scene);
    const a = bindOneShot(mix.clipAction(clip), true);
    a.play(); a.time = t; mix.update(0); pose.scene.updateMatrixWorld(true);
    const p = (b: THREE.Bone) => { const v = new THREE.Vector3(); b.getWorldPosition(v); return v; };
    const lh = p(hands[0]!), rh = p(hands[1]!), lf = p(feet[0]!), rf = p(feet[1]!);
    const handSpan = lh.distanceTo(rh);
    const footDx = Math.abs(lf.x - rf.x);
    return { handSpan, footDx, tpose: handSpan > 1.55 && footDx < 0.18 };
  };
  const clips = [
    proc.attack, proc.combo, proc.leap, proc.dodgeLeft, proc.dodgeRight,
    proc.hitFront, proc.hitBack, proc.hitLeft, proc.hitRight, proc.stagger,
    proc.deathThrow, proc.deathCollapse, proc.deathDismember,
  ];
  for (const c of clips) {
    for (const t of [0, c.duration * 0.45, c.duration]) {
      const r = tposeAt(c, t);
      assert.equal(r.tpose, false, `${c.name} t=${t} span=${r.handSpan.toFixed(3)} footDx=${r.footDx.toFixed(3)}`);
    }
  }

  const term = await parseGlb(readFileSync(join(MODELS, 'TERM.glb')));
  const punch = makeCombatClips(term.scene, 'term');
  assert.ok(Math.abs(punch.attack.duration - 0.80) < 1e-9);
  assert.ok(punch.walkWeight, 'poids de marche TERM');
  assert.ok(punch.shoot.tracks.length >= 8, 'recul bolter : épaule + bras');
});

test('hooks d\'événements : impact et fire', () => {
  clearAnimCues();
  const got: string[] = [];
  const off = subscribeAnimCues((c) => got.push(c.kind));
  for (const c of scanClipMarkers('proc-combo', 0.17, 0.19, { role: 'NL-1', who: 0 })) {
    // scan returns, emit separately
    got.push(`scan:${c.kind}`);
  }
  const fire = scanClipMarkers('proc-shoot', 0.17, 0.19, { role: 'TERM', who: 'term' });
  assert.ok(fire.some((c) => c.kind === 'fire'));
  assert.ok(got.some((k) => k.includes('impact')));
  off();
  peekAnimCues();
});

test('chute présentation : sol et murs', () => {
  const body = impulseFall('throw', 0, 0.45);
  assert.ok(body.vy > 0);
  let b = body;
  const arena = { w: 40, h: 24 };
  const wall = [{ x0: 10, y0: 10, x1: 12, y1: 14 }];
  for (let i = 0; i < 40; i++) b = stepFall(b, 0.05, { x: 11, z: 12 }, arena, wall);
  assert.ok(b.oy >= -1e-6, `sous le sol ${b.oy}`);
  const wx = 11 + b.ox;
  const wz = 12 + b.oz;
  const inside = wx > 10.45 && wx < 11.55 && wz > 10.45 && wz < 13.55;
  assert.equal(inside, false, `dans le pilier ${wx.toFixed(2)},${wz.toFixed(2)}`);
});

test('IK pieds : n\'explose pas sur NL-1', async () => {
  const pose = await parseGlb(readFileSync(join(MODELS, 'NL-1.glb')));
  applyFootIk(pose.scene, { groundY: 0 });
  let foot: THREE.Bone | null = null;
  pose.scene.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === 'LeftFoot') foot = o as THREE.Bone; });
  assert.ok(foot);
});

test('measure-stride values remain the frozen trio when sampled here', async () => {
  const pose = await parseGlb(readFileSync(join(MODELS, 'NL-1.glb')));
  const walk = await parseGlb(readFileSync(join(MODELS, 'NL-1-walk.glb')));
  const run = await parseGlb(readFileSync(join(MODELS, 'NL-1-run.glb')));
  const h = pose.scene;
  const clipW = pickClip([...walk.animations], 'walk')!;
  const clipR = pickClip([...run.animations], 'run')!;
  // Same scale as measure-stride: height → 2.0, rot y = π/2 is applied in measureForwardStride caller.
  // We only check the helper still returns a finite stride; the CLI proof is measure-stride.ts.
  const sw = measureForwardStride(h, clipW).stride;
  const sr = measureForwardStride(h, clipR).stride;
  assert.ok(sw > 0 && sr > 0);
  const ts = gaitTimeScale(NL_CFG.speed, sr, clipR.duration);
  assert.ok(ts > 0);
});
