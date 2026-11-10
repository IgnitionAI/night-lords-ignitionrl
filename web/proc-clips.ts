// Clips de combat procéduraux : offsets locaux sur les 24 os Genex (Hips, Spine, bras, jambes).
// Déterministes. Utilisés seulement si aucun clip GLB nommé n'existe.
// Polish : poses clés (anticipation / impact / récupération), easing, poids, recul du torse,
// chute + rebond léger pour la mort. Pas de GLB CC0 — le retarget Mixamo/Quaternius casse
// la pose de repos par personnage et les durées one-shot (0,28–0,80 s).

import * as THREE from 'three';
import { ONE_SHOT } from './combat-anims';

export type ProcLook = 'nl' | 'term';

const BONE_NAMES = [
  'Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
] as const;

type BoneName = typeof BONE_NAMES[number];
type Vec3 = readonly [number, number, number];
type RotMap = Partial<Record<BoneName, Vec3>>;
type PosMap = Partial<Record<BoneName, Vec3>>;
type Ease = 'lin' | 'in' | 'out' | 'inout' | 'back';

interface PoseKey {
  t: number;
  ease: Ease;
  rot: RotMap;
  pos?: PosMap;
}

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

/** L'armature Genex est ×0,01 : un delta monde (mètres) doit être ramené en unités d'os. */
function worldToBone(bone: THREE.Bone, world: THREE.Vector3): THREE.Vector3 {
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  const sx = Math.abs(ws.x) < 1e-8 ? 1 : ws.x;
  const sy = Math.abs(ws.y) < 1e-8 ? 1 : ws.y;
  const sz = Math.abs(ws.z) < 1e-8 ? 1 : ws.z;
  return new THREE.Vector3(world.x / sx, world.y / sy, world.z / sz);
}

function ease(t: number, kind: Ease): number {
  const x = Math.min(1, Math.max(0, t));
  switch (kind) {
    case 'lin':
      return x;
    case 'in':
      return x * x * x;
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'inout':
      return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
    case 'back': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
    }
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function sampleTimes(duration: number, fps = 30): number[] {
  const n = Math.max(2, Math.round(duration * fps) + 1);
  const times: number[] = [];
  for (let i = 0; i < n; i++) times.push((i / (n - 1)) * duration);
  times[times.length - 1] = duration;
  return times;
}

function keyPair(keys: PoseKey[], t: number): { a: PoseKey; b: PoseKey; u: number } {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (t <= first.t) return { a: first, b: first, u: 0 };
  if (t >= last.t) return { a: last, b: last, u: 1 };
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.t < t) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const u = ease((t - a.t) / Math.max(1e-8, b.t - a.t), a.ease);
  return { a, b, u };
}

function eulerOf(v: Vec3 | undefined): THREE.Euler {
  const t = v ?? [0, 0, 0];
  return new THREE.Euler(t[0], t[1], t[2]);
}

function sampledRotTrack(bone: THREE.Bone, times: number[], keys: PoseKey[]): THREE.QuaternionKeyframeTrack {
  const rest = bone.quaternion.clone();
  const name = bone.name as BoneName;
  const values: number[] = [];
  for (const t of times) {
    const { a, b, u } = keyPair(keys, t);
    const qa = qMulRest(rest, eulerOf(a.rot[name]));
    const qb = qMulRest(rest, eulerOf(b.rot[name]));
    const q = qa.slerp(qb, u);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
}

function sampledPosTrack(bone: THREE.Bone, times: number[], keys: PoseKey[]): THREE.VectorKeyframeTrack {
  const rest = bone.position.clone();
  const name = bone.name as BoneName;
  const values: number[] = [];
  const tmp = new THREE.Vector3();
  for (const t of times) {
    const { a, b, u } = keyPair(keys, t);
    const pa = a.pos?.[name] ?? [0, 0, 0];
    const pb = b.pos?.[name] ?? [0, 0, 0];
    tmp.set(
      pa[0] + (pb[0] - pa[0]) * u,
      pa[1] + (pb[1] - pa[1]) * u,
      pa[2] + (pb[2] - pa[2]) * u,
    );
    const d = worldToBone(bone, tmp);
    values.push(rest.x + d.x, rest.y + d.y, rest.z + d.z);
  }
  return new THREE.VectorKeyframeTrack(`${bone.name}.position`, times, values);
}

function usedBones(keys: PoseKey[]): { rot: Set<BoneName>; pos: Set<BoneName> } {
  const rot = new Set<BoneName>();
  const pos = new Set<BoneName>();
  for (const k of keys) {
    for (const n of Object.keys(k.rot) as BoneName[]) rot.add(n);
    if (k.pos) for (const n of Object.keys(k.pos) as BoneName[]) pos.add(n);
  }
  return { rot, pos };
}

function clipFromKeys(
  name: string,
  duration: number,
  bones: Map<string, THREE.Bone>,
  keys: PoseKey[],
): THREE.AnimationClip {
  const times = sampleTimes(duration);
  const used = usedBones(keys);
  const parts: THREE.KeyframeTrack[] = [];
  for (const n of used.rot) {
    const bone = bones.get(n);
    if (bone) parts.push(sampledRotTrack(bone, times, keys));
  }
  for (const n of used.pos) {
    const bone = bones.get(n);
    if (bone) parts.push(sampledPosTrack(bone, times, keys));
  }
  return new THREE.AnimationClip(name, duration, parts);
}

export interface CombatClipSet {
  attack: THREE.AnimationClip;
  shoot: THREE.AnimationClip;
  hit: THREE.AnimationClip;
  dodge: THREE.AnimationClip;
  death: THREE.AnimationClip;
  procedural: boolean;
}

function clawAttack(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.08, ease: 'out', rot: {
        Hips: [0.05, -0.16, 0.05],
        Spine02: [0.06, -0.10, 0.04],
        Spine01: [0.05, -0.12, 0.05],
        Spine: [0.10, -0.22, 0.10],
        neck: [-0.06, -0.08, 0.04],
        RightShoulder: [-0.18, 0.22, 0.38],
        RightArm: [-0.55, 0.22, 0.82],
        RightForeArm: [0.42, 0.08, 0.18],
        RightHand: [0.25, 0.12, 0.28],
        LeftArm: [0.18, 0.04, -0.22],
        LeftForeArm: [0.12, 0, 0],
        LeftUpLeg: [0.14, 0.02, 0.06],
        RightUpLeg: [-0.08, -0.02, -0.08],
      }, pos: { Hips: [0.01, -0.04, -0.05] },
    },
    {
      t: 0.17, ease: 'in', rot: {
        Hips: [0.08, -0.32, 0.10],
        Spine02: [0.10, -0.18, 0.08],
        Spine01: [0.08, -0.20, 0.08],
        Spine: [0.16, -0.48, 0.18],
        neck: [-0.10, -0.16, 0.06],
        Head: [0.06, -0.10, 0],
        RightShoulder: [-0.28, 0.32, 0.55],
        RightArm: [-1.05, 0.38, 1.12],
        RightForeArm: [0.95, 0.18, 0.28],
        RightHand: [0.40, 0.18, 0.45],
        LeftShoulder: [0.08, 0, -0.12],
        LeftArm: [0.32, -0.12, -0.40],
        LeftForeArm: [0.28, 0, 0],
        LeftUpLeg: [0.18, 0.04, 0.08],
        RightUpLeg: [-0.12, -0.04, -0.10],
      }, pos: { Hips: [0.02, -0.07, -0.08] },
    },
    {
      t: 0.26, ease: 'back', rot: {
        Hips: [0.06, 0.38, -0.08],
        Spine02: [0.10, 0.22, -0.10],
        Spine01: [0.12, 0.26, -0.08],
        Spine: [0.22, 0.55, -0.14],
        neck: [0.12, 0.22, -0.04],
        Head: [0.10, 0.18, 0],
        RightShoulder: [0.18, -0.12, -0.32],
        RightArm: [-1.25, -0.18, -0.62],
        RightForeArm: [0.22, -0.06, -0.12],
        RightHand: [0.10, -0.22, -0.18],
        LeftShoulder: [0.12, 0.06, -0.18],
        LeftArm: [0.55, 0.12, -0.52],
        LeftForeArm: [0.35, 0, 0],
        LeftUpLeg: [-0.12, 0, -0.10],
        LeftLeg: [0.18, 0, 0],
        RightUpLeg: [0.28, 0.04, 0.12],
        RightLeg: [0.12, 0, 0],
      }, pos: { Hips: [0.05, -0.02, 0.10] },
    },
    {
      t: 0.36, ease: 'inout', rot: {
        Hips: [0.03, 0.16, -0.03],
        Spine: [0.08, 0.20, -0.04],
        neck: [0.04, 0.08, 0],
        RightArm: [-0.42, 0.04, -0.16],
        RightForeArm: [0.16, 0, 0],
        LeftArm: [0.16, 0, -0.14],
        RightUpLeg: [0.08, 0, 0.04],
      }, pos: { Hips: [0.02, -0.02, 0.03] },
    },
    { t: ONE_SHOT.attack, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

function termPunch(): PoseKey[] {
  const d = 0.80;
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.12, ease: 'out', rot: {
        Hips: [0.06, -0.14, 0.04],
        Spine02: [0.08, -0.08, 0.04],
        Spine: [0.14, -0.22, 0.08],
        neck: [-0.08, -0.06, 0],
        RightShoulder: [-0.22, 0.18, 0.28],
        RightArm: [-0.85, 0.22, 0.55],
        RightForeArm: [1.05, 0.08, 0.12],
        RightHand: [0.15, 0, 0.10],
        LeftShoulder: [0.10, 0, -0.10],
        LeftArm: [0.35, 0.08, -0.28],
        LeftForeArm: [0.55, 0, 0],
        LeftUpLeg: [0.10, 0, 0.06],
        RightUpLeg: [-0.10, 0, -0.08],
      }, pos: { Hips: [0, -0.05, -0.06] },
    },
    {
      t: 0.42, ease: 'in', rot: {
        Hips: [0.10, -0.22, 0.06],
        Spine02: [0.12, -0.14, 0.06],
        Spine01: [0.10, -0.12, 0.05],
        Spine: [0.20, -0.32, 0.12],
        neck: [-0.12, -0.10, 0.04],
        Head: [0.08, -0.06, 0],
        RightShoulder: [-0.32, 0.24, 0.40],
        RightArm: [-1.15, 0.32, 0.72],
        RightForeArm: [1.25, 0.12, 0.16],
        RightHand: [0.22, 0.08, 0.14],
        LeftArm: [0.48, 0.10, -0.38],
        LeftForeArm: [0.70, 0, 0],
        LeftUpLeg: [0.16, 0.04, 0.08],
        RightUpLeg: [-0.14, -0.04, -0.10],
      }, pos: { Hips: [0.02, -0.08, -0.10] },
    },
    {
      t: 0.68, ease: 'back', rot: {
        Hips: [0.16, 0.28, -0.06],
        Spine02: [0.14, 0.16, -0.06],
        Spine01: [0.16, 0.18, -0.06],
        Spine: [0.28, 0.38, -0.10],
        neck: [0.14, 0.16, 0],
        Head: [0.12, 0.10, 0],
        RightShoulder: [0.22, -0.08, -0.18],
        RightArm: [-1.35, -0.08, -0.22],
        RightForeArm: [0.18, 0, 0],
        RightHand: [0.08, -0.10, -0.08],
        LeftArm: [0.22, 0.06, -0.22],
        LeftForeArm: [0.25, 0, 0],
        LeftUpLeg: [-0.10, 0, -0.08],
        RightUpLeg: [0.22, 0.04, 0.10],
        RightLeg: [0.10, 0, 0],
      }, pos: { Hips: [0.06, -0.03, 0.14] },
    },
    {
      t: d, ease: 'lin', rot: {
        Hips: [0.04, 0.08, 0],
        Spine: [0.08, 0.10, 0],
        RightArm: [-0.35, 0.04, 0.08],
        RightForeArm: [0.22, 0, 0],
        LeftArm: [0.10, 0, -0.08],
      }, pos: { Hips: [0.02, -0.02, 0.04] },
    },
  ];
}

function termShoot(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.08, ease: 'out', rot: {
        Hips: [0.03, 0.06, 0],
        Spine01: [0.06, 0.08, 0.02],
        Spine: [0.08, 0.10, 0.04],
        neck: [-0.10, 0.06, 0],
        Head: [-0.06, 0.04, 0],
        RightShoulder: [-0.12, 0.10, 0.18],
        RightArm: [-0.72, 0.16, 0.32],
        RightForeArm: [0.55, 0.04, 0.10],
        RightHand: [0.08, 0, 0.06],
        LeftArm: [0.28, 0.08, -0.18],
        LeftForeArm: [0.42, 0, 0],
      }, pos: { Hips: [0, -0.02, -0.02] },
    },
    {
      t: 0.16, ease: 'in', rot: {
        Hips: [0.04, 0.08, 0],
        Spine: [0.10, 0.12, 0.05],
        neck: [-0.12, 0.08, 0],
        RightArm: [-0.88, 0.14, 0.38],
        RightForeArm: [0.62, 0.04, 0.12],
        LeftArm: [0.35, 0.10, -0.22],
      },
    },
    {
      t: 0.22, ease: 'back', rot: {
        Hips: [-0.08, 0.04, 0.04],
        Spine02: [-0.10, 0.04, 0.04],
        Spine01: [-0.12, 0.06, 0.05],
        Spine: [-0.16, 0.08, 0.08],
        neck: [0.08, 0.04, 0],
        Head: [0.06, 0.02, 0],
        RightShoulder: [-0.06, 0.08, 0.12],
        RightArm: [-0.62, 0.10, 0.28],
        RightForeArm: [0.48, 0, 0.08],
        LeftArm: [0.22, 0.04, -0.14],
      }, pos: { Hips: [0, -0.04, -0.10] },
    },
    {
      t: 0.34, ease: 'inout', rot: {
        Hips: [0.02, 0.05, 0],
        Spine: [0.06, 0.08, 0.02],
        neck: [-0.06, 0.04, 0],
        RightArm: [-0.50, 0.08, 0.18],
        RightForeArm: [0.32, 0, 0.04],
      }, pos: { Hips: [0, -0.01, -0.03] },
    },
    { t: ONE_SHOT.attack, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

function hitReact(heavy: boolean): PoseKey[] {
  const k = heavy ? 1.15 : 1;
  const fold = heavy ? 0.72 : 1;
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.05, ease: 'in', rot: {
        Hips: [-0.04 * k, 0.05, 0.04],
        Spine: [-0.10 * k, 0.06, 0.08],
        neck: [-0.08, 0.08, 0],
      }, pos: { Hips: [0, -0.02, -0.03] },
    },
    {
      t: 0.11, ease: 'back', rot: {
        Hips: [-0.12 * k, 0.10, 0.08],
        Spine02: [-0.14 * fold, 0.06, 0.08],
        Spine01: [-0.18 * fold, -0.06, 0.10],
        Spine: [-0.32 * fold, 0.12, 0.16],
        neck: [-0.28 * fold, 0.16, 0.04],
        Head: [-0.18 * fold, 0.12, 0.06],
        LeftShoulder: [0.12, 0.08, -0.10],
        RightShoulder: [-0.10, -0.08, 0.16],
        LeftArm: [0.45 * fold, 0.18, -0.35],
        RightArm: [-0.35, 0.22, 0.48],
        LeftForeArm: [0.40, 0, 0],
        RightForeArm: [0.32, 0, 0.10],
        LeftUpLeg: [0.12, 0, 0.08],
        RightUpLeg: [-0.08, 0, -0.10],
      }, pos: { Hips: [0.02 * k, -0.10 * k, -0.14 * k] },
    },
    {
      t: 0.20, ease: 'out', rot: {
        Hips: [-0.04, 0.04, 0.03],
        Spine: [-0.08 * fold, 0.04, 0.04],
        neck: [-0.06, 0.04, 0],
        LeftArm: [0.12, 0.04, -0.10],
        RightArm: [-0.10, 0.06, 0.12],
      }, pos: { Hips: [0, -0.04, -0.05] },
    },
    { t: ONE_SHOT.hit, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

function dodgeStep(heavy: boolean): PoseKey[] {
  const drop = heavy ? 0.70 : 1;
  const side = heavy ? 1.15 : 1;
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.06, ease: 'out', rot: {
        Hips: [-0.10 * drop, -0.12, 0.08],
        Spine: [0.08, -0.10, 0.08],
        LeftUpLeg: [0.18, 0, 0.08],
        RightUpLeg: [0.06, 0, -0.06],
        LeftArm: [0.20, 0, -0.16],
        RightArm: [-0.16, 0, 0.18],
      }, pos: { Hips: [-0.04 * side, -0.06 * drop, -0.05] },
    },
    {
      t: 0.14, ease: 'inout', rot: {
        Hips: [-0.18 * drop, -0.38, 0.14],
        Spine02: [0.10, -0.16, 0.12],
        Spine01: [0.12, -0.18, 0.14],
        Spine: [0.18, -0.28, 0.20],
        neck: [0.08, -0.16, 0.08],
        Head: [0.06, -0.10, 0.04],
        LeftShoulder: [0.08, 0, -0.10],
        RightShoulder: [-0.06, 0, 0.12],
        LeftArm: [0.45, 0.10, -0.32],
        RightArm: [-0.38, -0.08, 0.42],
        LeftForeArm: [0.35, 0, 0],
        RightForeArm: [0.28, 0, 0],
        LeftUpLeg: [0.55, 0.08, 0.16],
        LeftLeg: [0.72, 0, 0],
        LeftFoot: [-0.22, 0, 0],
        RightUpLeg: [0.12, -0.06, -0.18],
        RightLeg: [0.18, 0, 0],
      }, pos: { Hips: [-0.16 * side, -0.14 * drop, -0.18] },
    },
    {
      t: 0.26, ease: 'inout', rot: {
        Hips: [-0.06, -0.12, 0.04],
        Spine: [0.06, -0.08, 0.06],
        LeftUpLeg: [0.16, 0, 0.04],
        LeftLeg: [0.22, 0, 0],
        LeftArm: [0.12, 0, -0.10],
        RightArm: [-0.10, 0, 0.10],
      }, pos: { Hips: [-0.05 * side, -0.04, -0.06] },
    },
    { t: ONE_SHOT.dodge, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

function deathFall(): PoseKey[] {
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.08, ease: 'in', rot: {
        Hips: [-0.12, 0.10, 0.18],
        Spine: [-0.22, 0.12, 0.16],
        neck: [-0.28, 0.18, 0.08],
        Head: [-0.16, 0.12, 0.10],
        LeftArm: [0.35, 0.15, -0.25],
        RightArm: [-0.28, 0.18, 0.40],
      }, pos: { Hips: [0.04, -0.06, -0.04] },
    },
    {
      t: 0.22, ease: 'inout', rot: {
        Hips: [0.35, 0.22, 0.72],
        Spine02: [0.18, 0.10, 0.22],
        Spine01: [0.22, 0.08, 0.20],
        Spine: [0.28, 0.12, 0.28],
        neck: [0.20, 0.10, 0.12],
        Head: [0.16, 0.08, 0.10],
        LeftUpLeg: [0.55, 0.12, 0.28],
        LeftLeg: [0.85, 0, 0],
        RightUpLeg: [0.22, -0.12, -0.32],
        RightLeg: [0.40, 0, 0],
        LeftArm: [0.55, 0.10, -0.48],
        RightArm: [-0.45, 0.22, 0.70],
        LeftForeArm: [0.35, 0, 0],
        RightForeArm: [0.28, 0, 0.12],
      }, pos: { Hips: [0.10, -0.32, 0.06] },
    },
    {
      t: 0.48, ease: 'in', rot: {
        Hips: [0.95, 0.18, 1.28],
        Spine02: [0.32, 0.06, 0.28],
        Spine01: [0.28, 0.04, 0.22],
        Spine: [0.18, 0.04, 0.16],
        neck: [0.35, 0.08, 0.18],
        Head: [0.28, 0.06, 0.12],
        LeftUpLeg: [0.78, 0.16, 0.42],
        LeftLeg: [1.05, 0, 0],
        LeftFoot: [-0.25, 0, 0],
        RightUpLeg: [0.42, -0.14, -0.48],
        RightLeg: [0.62, 0, 0],
        RightFoot: [-0.12, 0, 0],
        LeftArm: [0.72, 0.08, -0.62],
        RightArm: [-0.55, 0.18, 0.85],
        LeftForeArm: [0.22, 0, 0],
        RightForeArm: [0.18, 0, 0.08],
      }, pos: { Hips: [0.18, -0.82, 0.12] },
    },
    {
      t: 0.58, ease: 'out', rot: {
        Hips: [1.05, 0.12, 1.38],
        Spine: [0.10, 0, 0.10],
        neck: [0.22, 0.04, 0.10],
        Head: [0.18, 0.02, 0.08],
        LeftUpLeg: [0.62, 0.12, 0.32],
        LeftLeg: [0.88, 0, 0],
        RightUpLeg: [0.35, -0.10, -0.38],
        RightLeg: [0.48, 0, 0],
        LeftArm: [0.48, 0.04, -0.42],
        RightArm: [-0.38, 0.10, 0.58],
      }, pos: { Hips: [0.20, -0.70, 0.14] },
    },
    {
      t: ONE_SHOT.death, ease: 'lin', rot: {
        Hips: [1.12, 0.08, 1.42],
        Spine02: [0.18, 0, 0.12],
        Spine: [0.08, 0, 0.08],
        neck: [0.16, 0, 0.06],
        Head: [0.12, 0, 0.04],
        LeftUpLeg: [0.52, 0.10, 0.28],
        LeftLeg: [0.72, 0, 0],
        RightUpLeg: [0.28, -0.08, -0.32],
        RightLeg: [0.38, 0, 0],
        LeftArm: [0.38, 0.02, -0.36],
        RightArm: [-0.28, 0.08, 0.48],
        LeftForeArm: [0.15, 0, 0],
        RightForeArm: [0.12, 0, 0],
      }, pos: { Hips: [0.22, -0.92, 0.15] },
    },
  ];
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

/** Clips #59, pour les planches avant/après (`?proc=legacy`). */
export function makeLegacyCombatClips(root: THREE.Object3D): CombatClipSet {
  const hips = boneOf(root, 'Hips');
  const spine = boneOf(root, 'Spine');
  const spine1 = boneOf(root, 'Spine01');
  const neck = boneOf(root, 'neck');
  const rArm = boneOf(root, 'RightArm');
  const rFore = boneOf(root, 'RightForeArm');
  const lArm = boneOf(root, 'LeftArm');
  const lUp = boneOf(root, 'LeftUpLeg');
  const rUp = boneOf(root, 'RightUpLeg');
  const lLeg = boneOf(root, 'LeftLeg');
  const rLeg = boneOf(root, 'RightLeg');
  const tracks = (
    name: string,
    duration: number,
    parts: (THREE.KeyframeTrack | null)[],
  ): THREE.AnimationClip => new THREE.AnimationClip(name, duration, parts.filter((t): t is THREE.KeyframeTrack => t !== null));
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
    hips ? quatTrack(hips, deathT, [Z, E(0.35, 0.15, 0.55), E(0.85, 0.2, 1.15), E(1.15, 0.05, 1.45)]) : null,
    hips ? posTrack(hips, deathT, [V0, V(0.08, -0.25, 0.04), V(0.18, -0.7, 0.1), V(0.22, -0.95, 0.12)]) : null,
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

export function makeCombatClips(root: THREE.Object3D, look: ProcLook = 'nl', polish = true): CombatClipSet {
  if (!polish) return makeLegacyCombatClips(root);
  const bones = new Map<string, THREE.Bone>();
  for (const n of BONE_NAMES) {
    const b = boneOf(root, n);
    if (b) bones.set(n, b);
  }
  const term = look === 'term';
  const attack = clipFromKeys(
    'proc-attack',
    term ? 0.80 : ONE_SHOT.attack,
    bones,
    term ? termPunch() : clawAttack(),
  );
  const shoot = clipFromKeys('proc-shoot', ONE_SHOT.attack, bones, termShoot());
  const hit = clipFromKeys('proc-hit', ONE_SHOT.hit, bones, hitReact(term));
  const dodge = clipFromKeys('proc-dodge', ONE_SHOT.dodge, bones, dodgeStep(term));
  const death = clipFromKeys('proc-death', ONE_SHOT.death, bones, deathFall());
  return { attack, shoot, hit, dodge, death, procedural: true };
}

export function bindOneShot(action: THREE.AnimationAction, holdEnd: boolean): THREE.AnimationAction {
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = holdEnd;
  action.timeScale = 1;
  return action;
}
