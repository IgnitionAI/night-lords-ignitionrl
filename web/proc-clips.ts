// Clips de combat procéduraux : offsets locaux sur les 24 os Genex (Hips, Spine, bras, jambes).
// Déterministes. Utilisés seulement si aucun clip GLB nommé n'existe.

import * as THREE from 'three';
import { ONE_SHOT } from './combat-anims';

const boneOf = (root: THREE.Object3D, name: string): THREE.Bone | null => {
  let found: THREE.Bone | null = null;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === name) found = o as THREE.Bone;
  });
  return found;
};

function qMulRest(rest: THREE.Quaternion, euler: THREE.Euler): THREE.Quaternion {
  const off = new THREE.Quaternion().setFromEuler(euler);
  return rest.clone().multiply(off);
}

function quatTrack(
  bone: THREE.Bone,
  times: number[],
  eulers: THREE.Euler[],
): THREE.QuaternionKeyframeTrack {
  const rest = bone.quaternion.clone();
  const values: number[] = [];
  for (const e of eulers) {
    const q = qMulRest(rest, e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
}

/** L'armature Genex est ×0,01 : un delta monde (mètres) doit être ramené en unités d'os. */
function worldToBone(bone: THREE.Bone, world: THREE.Vector3): THREE.Vector3 {
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const sx = Math.abs(ws.x) < 1e-8 ? 1 : ws.x;
  const sy = Math.abs(ws.y) < 1e-8 ? 1 : ws.y;
  const sz = Math.abs(ws.z) < 1e-8 ? 1 : ws.z;
  return new THREE.Vector3(world.x / sx, world.y / sy, world.z / sz);
}

function posTrack(
  bone: THREE.Bone,
  times: number[],
  worldDeltas: THREE.Vector3[],
): THREE.VectorKeyframeTrack {
  const rest = bone.position.clone();
  const values: number[] = [];
  for (const w of worldDeltas) {
    const d = worldToBone(bone, w);
    values.push(rest.x + d.x, rest.y + d.y, rest.z + d.z);
  }
  return new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, values);
}

const E = (x: number, y: number, z: number) => new THREE.Euler(x, y, z);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Z = E(0, 0, 0);
const V0 = V(0, 0, 0);

export interface CombatClipSet {
  attack: THREE.AnimationClip;
  shoot: THREE.AnimationClip;
  hit: THREE.AnimationClip;
  dodge: THREE.AnimationClip;
  death: THREE.AnimationClip;
  procedural: boolean;
}

export function makeCombatClips(root: THREE.Object3D): CombatClipSet {
  const hips = boneOf(root, 'Hips');
  const spine = boneOf(root, 'Spine');
  const spine1 = boneOf(root, 'Spine01');
  const neck = boneOf(root, 'neck');
  const rArm = boneOf(root, 'RightArm');
  const rFore = boneOf(root, 'RightForeArm');
  const lArm = boneOf(root, 'LeftArm');
  const lFore = boneOf(root, 'LeftForeArm');
  const lUp = boneOf(root, 'LeftUpLeg');
  const rUp = boneOf(root, 'RightUpLeg');
  const lLeg = boneOf(root, 'LeftLeg');
  const rLeg = boneOf(root, 'RightLeg');

  const tracks = (
    name: string,
    duration: number,
    parts: (THREE.KeyframeTrack | null)[],
  ): THREE.AnimationClip => {
    const clip = new THREE.AnimationClip(name, duration, parts.filter((t): t is THREE.KeyframeTrack => t !== null));
    return clip;
  };

  const attackT = [0, 0.12, 0.22, ONE_SHOT.attack];
  const shootT = [0, 0.08, 0.22, ONE_SHOT.attack];
  const hitT = [0, 0.07, ONE_SHOT.hit];
  const dodgeT = [0, 0.12, ONE_SHOT.dodge];
  const deathT = [0, 0.22, 0.5, ONE_SHOT.death];

  const attack = tracks('proc-attack', ONE_SHOT.attack, [
    rArm ? quatTrack(rArm, attackT, [Z, E(-0.35, 0.1, 0.55), E(-0.85, 0.08, -0.12), E(-0.12, 0, 0.08)]) : null,
    rFore ? quatTrack(rFore, attackT, [Z, E(0.28, 0, 0.12), E(0.7, 0, 0), E(0.1, 0, 0)]) : null,
    lArm ? quatTrack(lArm, attackT, [Z, E(0.1, 0, -0.12), E(0.22, 0, -0.22), Z]) : null,
    spine ? quatTrack(spine, attackT, [Z, E(0.05, -0.14, 0.06), E(0.1, 0.2, -0.04), Z]) : null,
    hips ? quatTrack(hips, attackT, [Z, E(0.02, -0.06, 0), E(0.03, 0.1, 0), Z]) : null,
  ]);

  const shoot = tracks('proc-shoot', ONE_SHOT.attack, [
    rArm ? quatTrack(rArm, shootT, [Z, E(-0.45, 0.1, 0.22), E(-0.55, 0.08, 0.28), E(-0.22, 0.04, 0.1)]) : null,
    rFore ? quatTrack(rFore, shootT, [Z, E(0.35, 0, 0.08), E(0.42, 0, 0.1), E(0.12, 0, 0)]) : null,
    spine1 ? quatTrack(spine1, shootT, [Z, E(0.05, 0.08, 0), E(0.08, 0.1, 0.03), Z]) : null,
    neck ? quatTrack(neck, shootT, [Z, E(-0.05, 0.04, 0), E(-0.06, 0.05, 0), Z]) : null,
  ]);

  const hit = tracks('proc-hit', ONE_SHOT.hit, [
    spine ? quatTrack(spine, hitT, [Z, E(-0.16, 0.06, 0.08), E(-0.02, 0, 0)]) : null,
    spine1 ? quatTrack(spine1, hitT, [Z, E(-0.1, -0.04, 0.05), Z]) : null,
    neck ? quatTrack(neck, hitT, [Z, E(-0.14, 0.08, 0), E(0.02, 0, 0)]) : null,
    hips ? quatTrack(hips, hitT, [Z, E(-0.05, 0.04, 0.03), Z]) : null,
    hips ? posTrack(hips, hitT, [V0, V(0, -0.06, -0.08), V0]) : null,
  ]);

  const dodge = tracks('proc-dodge', ONE_SHOT.dodge, [
    hips ? quatTrack(hips, dodgeT, [Z, E(-0.08, -0.22, 0.06), E(-0.02, -0.04, 0)]) : null,
    hips ? posTrack(hips, dodgeT, [V0, V(-0.1, -0.08, -0.14), V0]) : null,
    spine ? quatTrack(spine, dodgeT, [Z, E(0.1, -0.16, 0.12), Z]) : null,
    lUp ? quatTrack(lUp, dodgeT, [Z, E(0.22, 0, 0.06), E(0.04, 0, 0)]) : null,
    rUp ? quatTrack(rUp, dodgeT, [Z, E(0.08, 0, -0.08), Z]) : null,
  ]);

  const death = tracks('proc-death', ONE_SHOT.death, [
    hips ? quatTrack(hips, deathT, [
      Z,
      E(0.35, 0.15, 0.55),
      E(0.85, 0.2, 1.15),
      E(1.15, 0.05, 1.45),
    ]) : null,
    hips ? posTrack(hips, deathT, [
      V0,
      V(0.08, -0.25, 0.04),
      V(0.18, -0.7, 0.1),
      V(0.22, -0.95, 0.12),
    ]) : null,
    spine ? quatTrack(spine, deathT, [Z, E(0.25, 0.1, 0.2), E(0.45, 0.05, 0.35), E(0.2, 0, 0.15)]) : null,
    lUp ? quatTrack(lUp, deathT, [Z, E(0.4, 0.1, 0.2), E(0.7, 0.15, 0.35), E(0.55, 0.1, 0.25)]) : null,
    rUp ? quatTrack(rUp, deathT, [Z, E(0.15, -0.1, -0.15), E(0.35, -0.12, -0.4), E(0.25, -0.08, -0.3)]) : null,
    lLeg ? quatTrack(lLeg, deathT, [Z, E(0.5, 0, 0), E(0.85, 0, 0), E(0.7, 0, 0)]) : null,
    rLeg ? quatTrack(rLeg, deathT, [Z, E(0.25, 0, 0), E(0.45, 0, 0), E(0.35, 0, 0)]) : null,
    rArm ? quatTrack(rArm, deathT, [Z, E(-0.2, 0, 0.4), E(-0.4, 0.2, 0.7), E(-0.3, 0.1, 0.5)]) : null,
    lArm ? quatTrack(lArm, deathT, [Z, E(0.2, 0, -0.3), E(0.5, 0, -0.6), E(0.35, 0, -0.4)]) : null,
  ]);

  return { attack, shoot, hit, dodge, death, procedural: true };
}

export function bindOneShot(action: THREE.AnimationAction, holdEnd: boolean): THREE.AnimationAction {
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = holdEnd;
  action.timeScale = 1;
  return action;
}
