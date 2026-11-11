import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { parseGlb } from '../web/stride.ts';
import {
  GENEX_SKIN_JOINTS,
  ROLE_RIG_HASH,
  combatKindSet,
  type CombatClipKind,
} from '../web/combat-clips.ts';

const MODELS = join(dirname(fileURLToPath(import.meta.url)), '..', 'web/models');
const ROLES = ['NL-1', 'NL-2', 'NL-3', 'NL-4', 'TERM'] as const;
const DURATIONS: Record<CombatClipKind, number> = {
  attack: 14 / 30,
  shoot: 14 / 30,
  hit: 8 / 30,
  dodge: 11 / 30,
  death: 0.8,
};

class FakeImage {
  width = 1;
  height = 1;
  complete = true;
  onload: ((this: FakeImage, event: unknown) => unknown) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.(null)); }
}
(globalThis as { Image?: unknown }).Image = FakeImage;
(globalThis as { self?: typeof globalThis }).self = globalThis;

function assetExtras(path: string): { rig?: string; inPlace?: boolean } {
  const glb = readFileSync(path);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  return json.asset.extras;
}

function clipPath(role: string, kind: CombatClipKind): string {
  return join(MODELS, `${role}-${kind}.glb`);
}

test('20 clips retargetés : rig d’origine, hiérarchie 24 os, 30 fps et moins de 150 Ko', async () => {
  for (const role of ROLES) {
    const target = await parseGlb(readFileSync(join(MODELS, `${role}.glb`)));
    for (const kind of combatKindSet(role)) {
      const path = clipPath(role, kind);
      const label = `${role}-${kind}`;
      assert.ok(statSync(path).size < 150_000, label);
      assert.equal(assetExtras(path).rig, ROLE_RIG_HASH[role], label);
      assert.equal(assetExtras(path).inPlace, true, label);
      const gltf = await parseGlb(readFileSync(path));
      assert.equal(gltf.animations.length, 1, label);
      const clip = gltf.animations[0];
      assert.equal(clip.name, `Armature|${kind}|baselayer`, label);
      assert.ok(Math.abs(clip.duration - DURATIONS[kind]) < 1e-6, `${label} ${clip.duration}`);
      assert.equal(clip.tracks.length, 72, label);
      for (const name of GENEX_SKIN_JOINTS) {
        const bone = gltf.scene.getObjectByName(name);
        const targetBone = target.scene.getObjectByName(name);
        assert.ok(bone, `${label} ${name}`);
        assert.equal(bone.parent?.name, targetBone?.parent?.name, `${label} ${name} parent`);
      }
    }
  }
});

test('20 clips retargetés : pas de dérive XZ, valeurs finies et fin distincte du début', async () => {
  for (const role of ROLES) {
    for (const kind of combatKindSet(role)) {
      const gltf = await parseGlb(readFileSync(clipPath(role, kind)));
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations[0]);
      action.clampWhenFinished = true;
      action.play();
      const hips = gltf.scene.getObjectByName('Hips')!;
      const head = gltf.scene.getObjectByName('Head')!;
      let firstHips: THREE.Vector3 | undefined;
      let firstHead: THREE.Quaternion | undefined;
      let lastHead: THREE.Quaternion | undefined;
      let maxRootDrift = 0;
      const frames = Math.round(gltf.animations[0].duration * 30);
      for (let frame = 0; frame <= frames; frame++) {
        mixer.setTime(frame / 30);
        gltf.scene.updateMatrixWorld(true);
        const hipsPosition = hips.getWorldPosition(new THREE.Vector3());
        const headRotation = head.getWorldQuaternion(new THREE.Quaternion());
        firstHips ??= hipsPosition.clone();
        firstHead ??= headRotation.clone();
        lastHead = headRotation;
        maxRootDrift = Math.max(maxRootDrift, Math.hypot(
          hipsPosition.x - firstHips.x,
          hipsPosition.z - firstHips.z,
        ));
        gltf.scene.traverse((node) => {
          for (const value of [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]) {
            assert.ok(Number.isFinite(value), `${role}-${kind} ${node.name} non fini`);
          }
        });
      }
      assert.ok(maxRootDrift < 1e-6, `${role}-${kind} dérive XZ ${maxRootDrift}`);
      assert.ok(Math.abs(lastHead!.dot(firstHead!)) < 0.9999, `${role}-${kind} tête inchangée`);
    }
  }
});
