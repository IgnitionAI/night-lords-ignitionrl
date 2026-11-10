// Machine d'états d'animation de combat : priorité, one-shots, mort clampée, mapping d'événements sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { DT, NL_CFG, T_CFG } from '../src/sim.ts';
import { pickGait } from '../web/locomotion.ts';
import { parseGlb } from '../web/stride.ts';
import {
  CROSSFADE, ONE_SHOT, COMBAT_CLIP_KEYS, crossFadeFor, eventsToFlags, freshMachine,
  isLoco, isOneShot, nlIntent, pickNamedClip, resolveKind, termIntent, tickMachine,
} from '../web/combat-anims.ts';
import { bindOneShot, makeCombatClips } from '../web/proc-clips.ts';

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

const gait = pickGait(NL_CFG.speed, { allowRun: true, walkSpeed: 3, runSpeed: 6 });
const idleGait = pickGait(0, { allowRun: true, walkSpeed: 3, runSpeed: 6 });

test('vitesses gelées : NL 6, TERM 2,5 (la machine ne les lit pas pour les changer)', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

test('priorité mort > coup > attaque > esquive > locomotion', () => {
  const base = { death: false, hit: false, attack: false, dodge: false, gait, attackStyle: 'melee' as const };
  assert.equal(resolveKind('run', 0, { ...base, death: true, hit: true, attack: true, dodge: true }), 'death');
  assert.equal(resolveKind('run', 0, { ...base, hit: true, attack: true, dodge: true }), 'hit');
  assert.equal(resolveKind('run', 0, { ...base, attack: true, dodge: true }), 'attack');
  assert.equal(resolveKind('run', 0, { ...base, dodge: true }), 'dodge');
  assert.equal(resolveKind('idle', 0, base), gait);
  assert.equal(gait, 'run');
});

test('one-shot : attaque / coup / esquive reviennent à la locomotion', () => {
  let m = freshMachine();
  const intentAtk = { death: false, hit: false, attack: true, dodge: false, gait, attackStyle: 'melee' as const };
  m = tickMachine(m, intentAtk, DT);
  assert.equal(m.state, 'attack');
  assert.equal(m.restart, true);
  assert.ok(Math.abs(m.remaining - ONE_SHOT.attack) < 1e-12);
  const rest = { death: false, hit: false, attack: false, dodge: false, gait, attackStyle: 'melee' as const };
  const steps = Math.ceil(ONE_SHOT.attack / DT) + 1;
  for (let i = 0; i < steps; i++) m = tickMachine(m, rest, DT);
  assert.equal(m.state, 'run');
  assert.equal(isLoco(m.state), true);
});

test('mort : sticky, clamp (remaining → 0, état death)', () => {
  let m = freshMachine();
  const die = { death: true, hit: true, attack: false, dodge: false, gait: idleGait, attackStyle: 'melee' as const };
  m = tickMachine(m, die, DT);
  assert.equal(m.state, 'death');
  const after = { death: true, hit: false, attack: true, dodge: true, gait, attackStyle: 'shoot' as const };
  for (let i = 0; i < 20; i++) m = tickMachine(m, after, DT);
  assert.equal(m.state, 'death');
  assert.equal(m.remaining, 0);
});

test('coup interrompt l\'attaque ; esquive n\'interrompt pas l\'attaque', () => {
  let m = freshMachine();
  m = tickMachine(m, { death: false, hit: false, attack: true, dodge: false, gait, attackStyle: 'melee' }, DT);
  m = tickMachine(m, { death: false, hit: false, attack: false, dodge: true, gait, attackStyle: 'melee' }, DT);
  assert.equal(m.state, 'attack', 'dodge ne coupe pas une attaque en cours');
  m = tickMachine(m, { death: false, hit: true, attack: false, dodge: true, gait, attackStyle: 'melee' }, DT);
  assert.equal(m.state, 'hit');
  assert.equal(m.restart, true);
});

test('crossFade : locomotion 0,15 s, combat 0,10 s, mort 0,18 s (pas de cut sec)', () => {
  assert.equal(CROSSFADE.loco, 0.15);
  assert.equal(crossFadeFor('walk', 'run'), 0.15);
  assert.equal(crossFadeFor('run', 'attack'), CROSSFADE.combat);
  assert.equal(crossFadeFor('attack', 'hit'), CROSSFADE.combat);
  assert.equal(crossFadeFor('run', 'death'), CROSSFADE.death);
  assert.ok(crossFadeFor('idle', 'walk') > 0);
  assert.ok(crossFadeFor('walk', 'hit') > 0);
});

test('événements sim → drapeaux (sans toucher src/sim.ts)', () => {
  const flags = eventsToFlags([
    { type: 'clawArm', who: 1 },
    { type: 'bolt', kill: 0 },
    { type: 'hit' },
    { type: 'whiff', who: 2 },
    { type: 'fist', kill: 3 },
  ]);
  assert.deepEqual(flags.clawArm, [1]);
  assert.equal(flags.boltKill, 0);
  assert.equal(flags.fistKill, 3);
  assert.equal(flags.termHit, true);
  assert.equal(flags.termBolt, true);
  assert.equal(flags.termFist, true);
  assert.deepEqual(flags.whiff, [2]);

  const nlDeath = nlIntent({
    alive: false, armTicks: 0, stunTicks: 0, prevStun: 0, lastAction: 1, prevAction: 1,
    gait, flags, index: 0,
  });
  assert.equal(nlDeath.death, true);

  const nlAtk = nlIntent({
    alive: true, armTicks: 2, stunTicks: 0, prevStun: 0, lastAction: 7, prevAction: 1,
    gait, flags, index: 1,
  });
  assert.equal(nlAtk.attack, true);
  assert.equal(nlAtk.attackStyle, 'melee');

  const nlHit = nlIntent({
    alive: true, armTicks: 0, stunTicks: 6, prevStun: 0, lastAction: 1, prevAction: 1,
    gait, flags: eventsToFlags([]), index: 2,
  });
  assert.equal(nlHit.hit, true);

  const nlDodge = nlIntent({
    alive: true, armTicks: 0, stunTicks: 0, prevStun: 0, lastAction: 2, prevAction: 1,
    gait, flags: eventsToFlags([]), index: 0,
  });
  assert.equal(nlDodge.dodge, true);

  const tHit = termIntent({ gait: 'walk', fistCharge: 0, burstLeft: 0, flags });
  assert.equal(tHit.hit, true);

  const tDodge = termIntent({
    gait: 'walk', fistCharge: 0, burstLeft: 0,
    flags: eventsToFlags([{ type: 'whiff', who: 0 }]),
  });
  assert.equal(tDodge.dodge, true);
  assert.equal(tDodge.hit, false);

  const tShoot = termIntent({
    gait: 'walk', fistCharge: 0, burstLeft: 2,
    flags: eventsToFlags([{ type: 'bolt', kill: -1 }]),
  });
  assert.equal(tShoot.attack, true);
  assert.equal(tShoot.attackStyle, 'shoot');
});

test('clips GLB : pas de combat nommé ; procédural + clampWhenFinished sur la mort', async () => {
  const pose = await parseGlb(readFileSync(join(MODELS, 'NL-1.glb')));
  const walk = await parseGlb(readFileSync(join(MODELS, 'NL-1-walk.glb')));
  const run = await parseGlb(readFileSync(join(MODELS, 'NL-1-run.glb')));
  const all = [...(pose.animations ?? []), ...walk.animations, ...run.animations];
  const names = all.map((c) => `${c.name}:${c.duration.toFixed(4)}`);
  console.log('\n# combat-anims — clips NL-1');
  console.log(JSON.stringify(names));
  assert.equal(pickNamedClip(all, COMBAT_CLIP_KEYS.attack), null);
  assert.equal(pickNamedClip(all, COMBAT_CLIP_KEYS.hit), null);
  assert.equal(pickNamedClip(all, COMBAT_CLIP_KEYS.dodge), null);
  assert.equal(pickNamedClip(all, COMBAT_CLIP_KEYS.death), null);
  assert.ok(pickNamedClip(all, ['walking']));
  assert.ok(pickNamedClip(all, ['running']));

  const proc = makeCombatClips(pose.scene);
  assert.equal(proc.procedural, true);
  assert.ok(Math.abs(proc.death.duration - ONE_SHOT.death) < 1e-9);
  assert.ok(proc.death.tracks.length >= 3, 'mort : hanche + colonne au minimum');
  assert.ok(proc.attack.tracks.length >= 2);
  assert.ok(proc.hit.tracks.length >= 2);
  assert.ok(proc.dodge.tracks.length >= 2);

  const mixer = new THREE.AnimationMixer(pose.scene);
  const death = bindOneShot(mixer.clipAction(proc.death), true);
  assert.equal(death.clampWhenFinished, true);
  assert.equal(death.loop, THREE.LoopOnce);
  death.play();
  mixer.update(ONE_SHOT.death + 0.2);
  assert.ok(death.time >= ONE_SHOT.death - 1e-6 || death.paused || death.time === death.getClip().duration);
});

test('oneShot helper et isOneShot exhaustif', () => {
  assert.equal(isOneShot('attack'), true);
  assert.equal(isOneShot('hit'), true);
  assert.equal(isOneShot('dodge'), true);
  assert.equal(isOneShot('death'), true);
  assert.equal(isOneShot('idle'), false);
  assert.equal(isOneShot('walk'), false);
  assert.equal(isOneShot('run'), false);
});
