// Pipeline d'intégration des clips de combat : fichiers attendus, noms pickNamedClip, os Genex, repli procédural.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { parseGlb } from '../web/stride.ts';
import { COMBAT_CLIP_KEYS, ONE_SHOT, pickNamedClip } from '../web/combat-anims.ts';
import { makeCombatClips } from '../web/proc-clips.ts';
import {
  COMBAT_FILE_KINDS,
  GENEX_CLIP_BONES,
  GENEX_HELPER_NODES,
  GENEX_ROLE_LORE,
  GENEX_SKIN_JOINTS,
  IDLE_CLIP_KEYS,
  NL_RIG_HASH,
  ROLE_RIG_HASH,
  TERM_RIG_HASH,
  canonicalBoneName,
  classifyBones,
  combatGlbBasenames,
  combatKindSet,
  extraAnimBasenames,
  idleGlbBasename,
  remapClip,
  SHIPPED_EXTRA_ANIMS,
  resolveCombatClips,
} from '../web/combat-clips.ts';

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

test('fichiers attendus : NL attack/hit/dodge/death, TERM + shoot, pas de sprint', () => {
  assert.deepEqual([...COMBAT_FILE_KINDS.NL], ['attack', 'hit', 'dodge', 'death']);
  assert.deepEqual([...COMBAT_FILE_KINDS.TERM], ['attack', 'shoot', 'hit', 'dodge']);
  assert.deepEqual(combatGlbBasenames('NL-1'), [
    'NL-1-attack.glb', 'NL-1-hit.glb', 'NL-1-dodge.glb', 'NL-1-death.glb', 'NL-1-combat.glb',
  ]);
  assert.deepEqual(combatGlbBasenames('TERM'), [
    'TERM-attack.glb', 'TERM-shoot.glb', 'TERM-hit.glb', 'TERM-dodge.glb', 'TERM-combat.glb',
  ]);
  assert.equal(combatGlbBasenames('TERM').some((f) => f.includes('run') || f.includes('sprint')), false);
  assert.deepEqual([...SHIPPED_EXTRA_ANIMS['NL-1']], ['idle', 'attack', 'hit', 'dodge', 'death']);
  assert.deepEqual(extraAnimBasenames('TERM'), [
    'TERM-idle.glb', 'TERM-attack.glb', 'TERM-shoot.glb', 'TERM-hit.glb', 'TERM-dodge.glb',
  ]);
});

test('pickNamedClip : noms Genex Armature|kind|baselayer', () => {
  const clips = [
    { name: 'Armature|clip0|baselayer' },
    { name: 'Armature|walking_man|baselayer' },
    { name: 'Armature|running|baselayer' },
    { name: 'Armature|attack|baselayer' },
    { name: 'Armature|shoot|baselayer' },
    { name: 'Armature|hit|baselayer' },
    { name: 'Armature|dodge|baselayer' },
    { name: 'Armature|death|baselayer' },
  ];
  assert.equal(pickNamedClip(clips, COMBAT_CLIP_KEYS.attack)?.name, 'Armature|attack|baselayer');
  assert.equal(pickNamedClip(clips, COMBAT_CLIP_KEYS.shoot)?.name, 'Armature|shoot|baselayer');
  assert.equal(pickNamedClip(clips, COMBAT_CLIP_KEYS.hit)?.name, 'Armature|hit|baselayer');
  assert.equal(pickNamedClip(clips, COMBAT_CLIP_KEYS.dodge)?.name, 'Armature|dodge|baselayer');
  assert.equal(pickNamedClip(clips, COMBAT_CLIP_KEYS.death)?.name, 'Armature|death|baselayer');
  const locoOnly = clips.slice(0, 3);
  assert.equal(pickNamedClip(locoOnly, COMBAT_CLIP_KEYS.attack), null);
});

test('canonicalBoneName : Mixamo / casse → 24 os Genex', () => {
  assert.equal(canonicalBoneName('mixamorig:Hips'), 'Hips');
  assert.equal(canonicalBoneName('mixamorigHips'), 'Hips');
  assert.equal(canonicalBoneName('Neck'), 'neck');
  assert.equal(canonicalBoneName('Spine1'), 'Spine01');
  assert.equal(canonicalBoneName('Spine2'), 'Spine02');
  assert.equal(canonicalBoneName('mixamorig:Spine'), 'Spine02');
  assert.equal(canonicalBoneName('mixamorig:Spine1'), 'Spine01');
  assert.equal(canonicalBoneName('mixamorig:Spine2'), 'Spine');
  assert.equal(canonicalBoneName('LeftToe_End'), 'LeftToeBase');
  assert.equal(canonicalBoneName('HeadTop_End'), 'head_end');
  assert.equal(canonicalBoneName('Hips'), 'Hips');
});

test('classifyBones : 24 joints NL/TERM, helpers Armature/char1 ignorés', () => {
  const report = classifyBones([
    ...GENEX_SKIN_JOINTS, ...GENEX_HELPER_NODES, 'mixamorig:Hips',
  ]);
  assert.equal(report.missing.length, 0);
  assert.ok(report.joints.includes('Hips'));
  assert.ok(GENEX_HELPER_NODES.every((h) => report.helpers.includes(h)));
  assert.equal(GENEX_SKIN_JOINTS.length, 24);
  assert.equal(GENEX_CLIP_BONES.length, 22);
});

test('remapClip réécrit les pistes mixamorig vers Hips.quaternion', () => {
  const src = new THREE.AnimationClip('Punch', 0.46, [
    new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, 0.46], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const out = remapClip(src, 'attack');
  assert.equal(out.name, 'attack');
  assert.equal(out.tracks[0].name, 'Hips.quaternion');
});

test('resolveCombatClips : nommé gagne, sinon procédural', async () => {
  const pose = await parseGlb(readFileSync(join(MODELS, 'NL-1.glb')));
  const proc = makeCombatClips(pose.scene);
  const fakeHit = new THREE.AnimationClip('Armature|hit|baselayer', 0.28, []);
  const resolved = resolveCombatClips([fakeHit], proc);
  assert.equal(resolved.source.hit, 'named');
  assert.equal(resolved.hit.name, 'Armature|hit|baselayer');
  assert.equal(resolved.source.attack, 'procedural');
  assert.equal(resolved.attack.name, proc.attack.name);
  assert.equal(resolved.procedural, false, 'au moins un clip nommé → pas entièrement procédural');
  const allProc = resolveCombatClips([], proc);
  assert.equal(allProc.procedural, true);
  assert.equal(allProc.source.death, 'procedural');
});

test('assets livrés : 16 clips NL et 4 clips TERM, pas de groupé ni de sprint', () => {
  const roles = ['NL-1', 'NL-2', 'NL-3', 'NL-4', 'TERM'] as const;
  const expected = roles.flatMap((role) => {
    const family = role === 'TERM' ? 'TERM' : 'NL';
    return COMBAT_FILE_KINDS[family].map((kind) => `${role}-${kind}.glb`);
  }).sort();
  for (const role of roles) {
    assert.equal(existsSync(join(MODELS, `${role}-combat.glb`)), false);
    for (const kind of combatKindSet(role)) {
      assert.equal(existsSync(join(MODELS, `${role}-${kind}.glb`)), true, `${role}-${kind}`);
    }
  }
  const shipped = readdirSync(MODELS).filter((f) =>
    /-(attack|hit|dodge|death|shoot|combat)\.glb$/i.test(f)).sort();
  assert.deepEqual(shipped, expected);
});

test('rig hashes Genex par personnage et durées one-shot documentées', () => {
  assert.equal(NL_RIG_HASH, ROLE_RIG_HASH['NL-1']);
  assert.equal(TERM_RIG_HASH, ROLE_RIG_HASH.TERM);
  assert.equal(ROLE_RIG_HASH['NL-2'], 'cc9775dfa331d50f8da5e77f0c46e2d587d1859db2939adf1f53ee907b8a5535');
  assert.equal(GENEX_ROLE_LORE['NL-1'], 'Talos');
  assert.equal(GENEX_ROLE_LORE['NL-2'], 'Uzas');
  assert.equal(GENEX_ROLE_LORE['NL-3'], 'Cyrion');
  assert.equal(GENEX_ROLE_LORE['NL-4'], 'Xarl');
  assert.equal(ONE_SHOT.attack, 0.46);
  assert.equal(ONE_SHOT.hit, 0.28);
  assert.equal(ONE_SHOT.dodge, 0.36);
  assert.equal(ONE_SHOT.death, 0.80);
});

test('idle Genex : Idle_3 remplace clip0, 24 os, ~9,97 s, combat toujours procédural', async () => {
  assert.deepEqual([...IDLE_CLIP_KEYS], ['idle']);
  for (const role of ['NL-1', 'NL-2', 'NL-3', 'NL-4', 'TERM'] as const) {
    const idlePath = join(MODELS, idleGlbBasename(role));
    assert.equal(existsSync(idlePath), true, idlePath);
    const idle = await parseGlb(readFileSync(idlePath));
    const pose = await parseGlb(readFileSync(join(MODELS, `${role}.glb`)));
    const names = [...(pose.animations ?? []), ...idle.animations];
    const picked = pickNamedClip(names, IDLE_CLIP_KEYS);
    assert.ok(picked, role);
    assert.equal(picked!.name.includes('Idle') || picked!.name.toLowerCase().includes('idle'), true);
    assert.ok(Math.abs(picked!.duration - 9.966666666666667) < 1e-6, `${role} duration ${picked!.duration}`);
    assert.ok((picked!.tracks?.length ?? 0) >= 24);
    assert.equal(pickNamedClip(pose.animations ?? [], IDLE_CLIP_KEYS), null, 'clip0 n\'est pas un idle');
    const bones = new Set<string>();
    idle.scene.traverse((o) => { if (o.name) bones.add(o.name); });
    for (const j of GENEX_SKIN_JOINTS) assert.ok(bones.has(j), `${role} missing ${j}`);
  }
});
