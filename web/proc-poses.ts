// Poses clés des clips procéduraux « whoa » (anticipation / impact / recovery).
// Offsets d'euler locaux, appliqués sur la pose de repos Genex.

import { ONE_SHOT } from './combat-anims';

export type BoneName =
  | 'Hips' | 'Spine02' | 'Spine01' | 'Spine' | 'neck' | 'Head'
  | 'LeftShoulder' | 'LeftArm' | 'LeftForeArm' | 'LeftHand'
  | 'RightShoulder' | 'RightArm' | 'RightForeArm' | 'RightHand'
  | 'LeftUpLeg' | 'LeftLeg' | 'LeftFoot'
  | 'RightUpLeg' | 'RightLeg' | 'RightFoot';

export type Vec3 = readonly [number, number, number];
export type RotMap = Partial<Record<BoneName, Vec3>>;
export type PosMap = Partial<Record<BoneName, Vec3>>;
export type Ease = 'lin' | 'in' | 'out' | 'inout' | 'back';

export interface PoseKey {
  t: number;
  ease: Ease;
  rot: RotMap;
  pos?: PosMap;
}

export const BONE_NAMES: readonly BoneName[] = [
  'Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
];

export function clawSlash(side: 'left' | 'right'): PoseKey[] {
  const s = side === 'left' ? -1 : 1;
  const arm = side === 'left' ? 'Left' : 'Right';
  const other = side === 'left' ? 'Right' : 'Left';
  const A = (n: string) => `${arm}${n}` as BoneName;
  const O = (n: string) => `${other}${n}` as BoneName;
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.07, ease: 'out', rot: {
        Hips: [0.06, -0.18 * s, 0.06],
        Spine02: [0.07, -0.12 * s, 0.05],
        Spine: [0.12, -0.28 * s, 0.12],
        neck: [-0.08, -0.10 * s, 0.04],
        [A('Shoulder')]: [-0.22 * s, 0.28, 0.42 * s],
        [A('Arm')]: [-0.72, 0.28 * s, 0.95 * s],
        [A('ForeArm')]: [0.55, 0.10 * s, 0.22 * s],
        [A('Hand')]: [0.28, 0.14 * s, 0.32 * s],
        [O('Arm')]: [0.22, -0.06 * s, -0.28 * s],
        LeftUpLeg: [0.12, 0.03 * s, 0.06],
        RightUpLeg: [-0.08, -0.03 * s, -0.08],
      }, pos: { Hips: [0.02 * s, -0.05, -0.06] },
    },
    {
      t: 0.16, ease: 'in', rot: {
        Hips: [0.10, -0.38 * s, 0.12],
        Spine02: [0.12, -0.22 * s, 0.10],
        Spine01: [0.10, -0.24 * s, 0.10],
        Spine: [0.20, -0.55 * s, 0.20],
        neck: [-0.12, -0.18 * s, 0.08],
        Head: [0.08, -0.12 * s, 0],
        [A('Shoulder')]: [-0.32 * s, 0.38, 0.62 * s],
        [A('Arm')]: [-1.18, 0.42 * s, 1.22 * s],
        [A('ForeArm')]: [1.05, 0.20 * s, 0.32 * s],
        [A('Hand')]: [0.45, 0.22 * s, 0.50 * s],
        [O('Shoulder')]: [0.10, 0, -0.14 * s],
        [O('Arm')]: [0.38, -0.14 * s, -0.48 * s],
        [O('ForeArm')]: [0.32, 0, 0],
        LeftUpLeg: [0.20, 0.05 * s, 0.10],
        RightUpLeg: [-0.14, -0.05 * s, -0.12],
      }, pos: { Hips: [0.03 * s, -0.08, -0.10] },
    },
    {
      t: 0.26, ease: 'back', rot: {
        Hips: [0.08, 0.42 * s, -0.10],
        Spine02: [0.12, 0.26 * s, -0.12],
        Spine01: [0.14, 0.30 * s, -0.10],
        Spine: [0.26, 0.62 * s, -0.16],
        neck: [0.14, 0.26 * s, -0.05],
        Head: [0.12, 0.20 * s, 0],
        [A('Shoulder')]: [0.22 * s, -0.14, -0.36 * s],
        [A('Arm')]: [-1.38, -0.22 * s, -0.72 * s],
        [A('ForeArm')]: [0.18, -0.08 * s, -0.14 * s],
        [A('Hand')]: [0.12, -0.26 * s, -0.22 * s],
        [O('Arm')]: [0.62, 0.14 * s, -0.58 * s],
        [O('ForeArm')]: [0.38, 0, 0],
        LeftUpLeg: [-0.14, 0, -0.12],
        LeftLeg: [0.20, 0, 0],
        RightUpLeg: [0.32, 0.05 * s, 0.14],
        RightLeg: [0.14, 0, 0],
      }, pos: { Hips: [0.06 * s, -0.02, 0.12] },
    },
    {
      t: ONE_SHOT.attack, ease: 'inout', rot: {
        Hips: [0.03, 0.12 * s, -0.03],
        Spine: [0.08, 0.16 * s, -0.04],
        [A('Arm')]: [-0.38, 0.05 * s, -0.14 * s],
        [A('ForeArm')]: [0.14, 0, 0],
      }, pos: { Hips: [0.02 * s, -0.02, 0.03] },
    },
  ];
}

/** Gauche, droite, estoc — 0,90 s. */
export function clawCombo(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.08, ease: 'out', rot: {
        Hips: [0.05, 0.22, -0.06],
        Spine: [0.12, 0.32, -0.10],
        neck: [-0.06, 0.12, 0],
        LeftShoulder: [-0.22, 0.28, -0.42],
        LeftArm: [-0.85, -0.32, -1.05],
        LeftForeArm: [0.72, -0.12, -0.22],
        LeftHand: [0.30, -0.16, -0.38],
        RightArm: [0.22, 0.08, 0.28],
        LeftUpLeg: [0.16, -0.04, 0.08],
        RightUpLeg: [-0.10, 0.04, -0.08],
      }, pos: { Hips: [-0.04, -0.06, -0.05] },
    },
    {
      t: 0.18, ease: 'back', rot: {
        Hips: [0.10, -0.38, 0.10],
        Spine02: [0.12, -0.22, 0.10],
        Spine: [0.24, -0.58, 0.16],
        neck: [0.12, -0.22, 0.06],
        Head: [0.10, -0.16, 0],
        LeftShoulder: [0.18, -0.12, 0.32],
        LeftArm: [-1.32, 0.22, 0.68],
        LeftForeArm: [0.20, 0.08, 0.12],
        LeftHand: [0.10, 0.22, 0.18],
        RightArm: [0.48, 0.10, -0.42],
        LeftUpLeg: [-0.12, 0, -0.10],
        RightUpLeg: [0.28, 0, 0.12],
      }, pos: { Hips: [-0.06, -0.02, 0.12] },
    },
    {
      t: 0.28, ease: 'out', rot: {
        Hips: [0.06, -0.16, 0.04],
        Spine: [0.10, -0.22, 0.08],
        RightShoulder: [-0.22, 0.24, 0.40],
        RightArm: [-0.78, 0.28, 0.92],
        RightForeArm: [0.62, 0.10, 0.20],
        LeftArm: [-0.32, 0.08, 0.18],
      }, pos: { Hips: [0.02, -0.05, -0.04] },
    },
    {
      t: 0.38, ease: 'back', rot: {
        Hips: [0.10, 0.42, -0.10],
        Spine02: [0.12, 0.26, -0.12],
        Spine: [0.26, 0.64, -0.16],
        neck: [0.14, 0.24, -0.04],
        Head: [0.12, 0.18, 0],
        RightShoulder: [0.20, -0.14, -0.34],
        RightArm: [-1.40, -0.20, -0.70],
        RightForeArm: [0.16, -0.08, -0.12],
        RightHand: [0.10, -0.24, -0.20],
        LeftArm: [0.58, 0.12, -0.52],
        LeftUpLeg: [0.22, 0, 0.10],
        RightUpLeg: [-0.12, 0, -0.10],
      }, pos: { Hips: [0.07, -0.02, 0.13] },
    },
    {
      t: 0.48, ease: 'in', rot: {
        Hips: [0.12, 0.06, 0],
        Spine02: [0.16, 0.04, 0],
        Spine: [0.28, 0.06, 0.06],
        neck: [-0.18, 0, 0],
        Head: [-0.10, 0, 0],
        RightShoulder: [-0.18, 0.10, 0.22],
        RightArm: [-0.55, 0.08, 0.22],
        RightForeArm: [0.22, 0, 0],
        LeftShoulder: [-0.16, -0.08, -0.20],
        LeftArm: [-0.52, -0.08, -0.22],
        LeftForeArm: [0.22, 0, 0],
        LeftUpLeg: [0.28, 0, 0.08],
        RightUpLeg: [0.22, 0, -0.06],
      }, pos: { Hips: [0, -0.14, -0.12] },
    },
    {
      t: 0.62, ease: 'back', rot: {
        Hips: [0.18, 0, 0],
        Spine02: [0.22, 0, 0],
        Spine01: [0.24, 0, 0],
        Spine: [0.42, 0, 0.04],
        neck: [0.22, 0, 0],
        Head: [0.18, 0, 0],
        RightShoulder: [0.28, -0.06, -0.12],
        RightArm: [-1.55, -0.06, -0.18],
        RightForeArm: [0.08, 0, 0],
        RightHand: [0.06, -0.08, -0.06],
        LeftShoulder: [0.26, 0.06, 0.12],
        LeftArm: [-1.48, 0.06, 0.16],
        LeftForeArm: [0.08, 0, 0],
        LeftUpLeg: [-0.16, 0, -0.08],
        RightUpLeg: [0.32, 0, 0.12],
        RightLeg: [0.18, 0, 0],
      }, pos: { Hips: [0, -0.04, 0.22] },
    },
    {
      t: 0.78, ease: 'inout', rot: {
        Hips: [0.06, 0.04, 0],
        Spine: [0.10, 0.06, 0],
        RightArm: [-0.42, 0, -0.08],
        LeftArm: [-0.38, 0, 0.08],
        RightUpLeg: [0.10, 0, 0.04],
      }, pos: { Hips: [0, -0.03, 0.05] },
    },
    { t: ONE_SHOT.combo, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function clawLeap(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.10, ease: 'out', rot: {
        Hips: [0.22, 0, 0],
        Spine: [0.18, 0, 0.04],
        neck: [-0.12, 0, 0],
        LeftUpLeg: [0.55, 0.06, 0.10],
        LeftLeg: [0.85, 0, 0],
        RightUpLeg: [0.48, -0.06, -0.10],
        RightLeg: [0.72, 0, 0],
        LeftArm: [-0.35, 0, -0.28],
        RightArm: [-0.32, 0, 0.28],
      }, pos: { Hips: [0, -0.18, -0.08] },
    },
    {
      t: 0.22, ease: 'in', rot: {
        Hips: [-0.08, 0, 0],
        Spine: [-0.10, 0, 0],
        neck: [0.08, 0, 0],
        LeftUpLeg: [-0.22, 0.08, 0.12],
        LeftLeg: [0.28, 0, 0],
        RightUpLeg: [0.42, -0.08, -0.14],
        RightLeg: [0.55, 0, 0],
        LeftArm: [-0.85, -0.18, -0.72],
        RightArm: [-0.90, 0.18, 0.78],
        LeftForeArm: [0.45, 0, 0],
        RightForeArm: [0.48, 0, 0],
      }, pos: { Hips: [0, 0.42, 0.06] },
    },
    {
      t: 0.38, ease: 'back', rot: {
        Hips: [0.28, 0.04, 0],
        Spine02: [0.22, 0, 0],
        Spine: [0.38, 0, 0.06],
        neck: [0.18, 0, 0],
        Head: [0.14, 0, 0],
        LeftShoulder: [0.22, 0, -0.16],
        RightShoulder: [0.22, 0, 0.16],
        LeftArm: [-1.45, 0.10, 0.22],
        RightArm: [-1.50, -0.10, -0.22],
        LeftForeArm: [0.12, 0, 0],
        RightForeArm: [0.12, 0, 0],
        LeftUpLeg: [-0.18, 0, -0.10],
        LeftLeg: [0.22, 0, 0],
        RightUpLeg: [0.45, 0, 0.14],
        RightLeg: [0.32, 0, 0],
      }, pos: { Hips: [0, -0.06, 0.18] },
    },
    {
      t: 0.58, ease: 'inout', rot: {
        Hips: [0.08, 0, 0],
        Spine: [0.12, 0, 0],
        LeftArm: [-0.42, 0, -0.12],
        RightArm: [-0.40, 0, 0.12],
        RightUpLeg: [0.12, 0, 0.04],
      }, pos: { Hips: [0, -0.03, 0.04] },
    },
    { t: ONE_SHOT.leap, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function termPunch(): PoseKey[] {
  const d = 0.80;
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.12, ease: 'out', rot: {
        Hips: [0.08, -0.18, 0.05],
        Spine02: [0.10, -0.10, 0.05],
        Spine: [0.18, -0.26, 0.10],
        neck: [-0.10, -0.08, 0],
        RightShoulder: [-0.28, 0.22, 0.34],
        RightArm: [-0.95, 0.26, 0.62],
        RightForeArm: [1.18, 0.10, 0.14],
        RightHand: [0.18, 0, 0.12],
        LeftShoulder: [0.12, 0, -0.12],
        LeftArm: [0.42, 0.10, -0.32],
        LeftForeArm: [0.62, 0, 0],
        LeftUpLeg: [0.14, 0, 0.08],
        RightUpLeg: [-0.14, 0, -0.10],
      }, pos: { Hips: [0, -0.07, -0.08] },
    },
    {
      t: 0.42, ease: 'in', rot: {
        Hips: [0.14, -0.28, 0.08],
        Spine02: [0.16, -0.18, 0.08],
        Spine01: [0.14, -0.16, 0.06],
        Spine: [0.26, -0.38, 0.14],
        neck: [-0.14, -0.12, 0.04],
        Head: [0.10, -0.08, 0],
        RightShoulder: [-0.38, 0.28, 0.46],
        RightArm: [-1.28, 0.36, 0.82],
        RightForeArm: [1.38, 0.14, 0.18],
        RightHand: [0.26, 0.10, 0.16],
        LeftArm: [0.55, 0.12, -0.42],
        LeftForeArm: [0.78, 0, 0],
        LeftUpLeg: [0.20, 0.05, 0.10],
        RightUpLeg: [-0.18, -0.05, -0.12],
      }, pos: { Hips: [0.03, -0.11, -0.14] },
    },
    {
      t: 0.66, ease: 'back', rot: {
        Hips: [0.22, 0.34, -0.08],
        Spine02: [0.18, 0.20, -0.08],
        Spine01: [0.20, 0.22, -0.08],
        Spine: [0.34, 0.46, -0.12],
        neck: [0.16, 0.20, 0],
        Head: [0.14, 0.12, 0],
        RightShoulder: [0.28, -0.10, -0.22],
        RightArm: [-1.48, -0.10, -0.28],
        RightForeArm: [0.12, 0, 0],
        RightHand: [0.06, -0.12, -0.10],
        LeftArm: [0.18, 0.06, -0.18],
        LeftForeArm: [0.22, 0, 0],
        LeftUpLeg: [-0.14, 0, -0.10],
        RightUpLeg: [0.28, 0.05, 0.12],
        RightLeg: [0.14, 0, 0],
      }, pos: { Hips: [0.08, -0.04, 0.18] },
    },
    {
      t: d, ease: 'out', rot: {
        Hips: [0.06, 0.12, -0.02],
        Spine: [0.12, 0.14, -0.04],
        RightArm: [-0.48, 0.04, 0.06],
        RightForeArm: [0.18, 0, 0],
        LeftArm: [0.10, 0, -0.08],
        RightUpLeg: [0.08, 0, 0.04],
      }, pos: { Hips: [0.03, -0.03, 0.06] },
    },
  ];
}

export function termShoot(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.08, ease: 'out', rot: {
        Hips: [0.04, 0.08, 0],
        Spine02: [0.04, 0.06, 0.02],
        Spine01: [0.08, 0.10, 0.03],
        Spine: [0.10, 0.14, 0.06],
        neck: [-0.12, 0.08, 0],
        Head: [-0.08, 0.05, 0],
        RightShoulder: [-0.22, 0.16, 0.28],
        RightArm: [-0.88, 0.20, 0.40],
        RightForeArm: [0.62, 0.06, 0.12],
        RightHand: [0.10, 0, 0.08],
        LeftShoulder: [0.08, 0.06, -0.10],
        LeftArm: [0.34, 0.10, -0.22],
        LeftForeArm: [0.48, 0, 0],
      }, pos: { Hips: [0, -0.03, -0.03] },
    },
    {
      t: 0.18, ease: 'back', rot: {
        Hips: [-0.12, 0.06, 0.05],
        Spine02: [-0.16, 0.06, 0.06],
        Spine01: [-0.18, 0.08, 0.07],
        Spine: [-0.24, 0.10, 0.10],
        neck: [0.12, 0.05, 0],
        Head: [0.08, 0.03, 0],
        RightShoulder: [-0.08, 0.12, 0.18],
        RightArm: [-0.55, 0.08, 0.22],
        RightForeArm: [0.42, 0, 0.08],
        RightHand: [0.04, 0, 0.04],
        LeftArm: [0.18, 0.04, -0.12],
      }, pos: { Hips: [0, -0.05, -0.14] },
    },
    {
      t: 0.28, ease: 'inout', rot: {
        Hips: [0.02, 0.06, 0],
        Spine: [0.06, 0.10, 0.03],
        neck: [-0.06, 0.05, 0],
        RightShoulder: [-0.14, 0.10, 0.16],
        RightArm: [-0.62, 0.12, 0.26],
        RightForeArm: [0.38, 0, 0.06],
      }, pos: { Hips: [0, -0.02, -0.04] },
    },
    { t: ONE_SHOT.attack, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function hitReact(dir: 'front' | 'back' | 'left' | 'right' | 'heavy'): PoseKey[] {
  const k = dir === 'heavy' ? 1.05 : 1;
  const fold = dir === 'heavy' ? 0.62 : 1;
  const yaw = dir === 'left' ? 0.42 : dir === 'right' ? -0.42 : dir === 'back' ? 0.08 : -0.06;
  const pitch = dir === 'back' ? 0.22 : dir === 'front' ? -0.28 : -0.10;
  const roll = dir === 'left' ? -0.16 : dir === 'right' ? 0.16 : 0.06;
  const hx = dir === 'left' ? -0.10 : dir === 'right' ? 0.10 : 0.02;
  const hz = dir === 'front' ? -0.16 : dir === 'back' ? 0.12 : -0.08;
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.04, ease: 'in', rot: {
        Hips: [pitch * 0.35, yaw * 0.4, roll * 0.4],
        Spine: [pitch * 0.5, yaw * 0.5, roll * 0.5],
        neck: [pitch * 0.3, yaw * 0.3, 0],
      }, pos: { Hips: [hx * 0.4, -0.02, hz * 0.4] },
    },
    {
      t: 0.10, ease: 'back', rot: {
        Hips: [pitch * k, yaw, roll],
        Spine02: [pitch * 0.7 * fold, yaw * 0.5, roll * 0.6],
        Spine01: [pitch * 0.85 * fold, yaw * 0.4, roll * 0.7],
        Spine: [pitch * 1.15 * fold, yaw * 0.7, roll * 0.9],
        neck: [pitch * 0.9 * fold, yaw * 0.8, roll * 0.3],
        Head: [pitch * 0.55 * fold, yaw * 0.6, roll * 0.2],
        LeftShoulder: [0.12, 0.08, -0.12],
        RightShoulder: [-0.10, -0.08, 0.14],
        LeftArm: [0.48 * fold, 0.20, -0.38],
        RightArm: [-0.38, 0.24, 0.52],
        LeftForeArm: [0.42, 0, 0],
        RightForeArm: [0.34, 0, 0.10],
        LeftUpLeg: [0.14, 0, 0.08],
        RightUpLeg: [-0.10, 0, -0.10],
      }, pos: { Hips: [hx * k, -0.09 * k, hz * k] },
    },
    {
      t: 0.22, ease: 'out', rot: {
        Hips: [pitch * 0.25, yaw * 0.3, roll * 0.3],
        Spine: [pitch * 0.3 * fold, yaw * 0.2, roll * 0.2],
        neck: [pitch * 0.2, yaw * 0.2, 0],
        LeftArm: [0.12, 0.04, -0.10],
        RightArm: [-0.10, 0.06, 0.12],
      }, pos: { Hips: [hx * 0.3, -0.04, hz * 0.3] },
    },
    { t: ONE_SHOT.hit, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function staggerBolt(): PoseKey[] {
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.06, ease: 'in', rot: {
        Hips: [-0.18, 0.12, 0.10],
        Spine: [-0.28, 0.14, 0.12],
        neck: [-0.22, 0.16, 0.06],
        Head: [-0.14, 0.10, 0.04],
      }, pos: { Hips: [0.02, -0.04, -0.08] },
    },
    {
      t: 0.14, ease: 'back', rot: {
        Hips: [-0.32, 0.22, 0.16],
        Spine02: [-0.22, 0.10, 0.12],
        Spine01: [-0.26, 0.08, 0.14],
        Spine: [-0.42, 0.18, 0.20],
        neck: [-0.38, 0.22, 0.08],
        Head: [-0.24, 0.16, 0.08],
        LeftArm: [0.55, 0.22, -0.42],
        RightArm: [-0.48, 0.28, 0.62],
        LeftForeArm: [0.48, 0, 0],
        RightForeArm: [0.40, 0, 0.12],
        LeftUpLeg: [0.22, 0.06, 0.12],
        RightUpLeg: [-0.16, -0.06, -0.14],
      }, pos: { Hips: [0.04, -0.14, -0.22] },
    },
    {
      t: 0.32, ease: 'out', rot: {
        Hips: [-0.10, 0.08, 0.06],
        Spine: [-0.14, 0.06, 0.06],
        neck: [-0.10, 0.08, 0],
        LeftArm: [0.16, 0.06, -0.12],
        RightArm: [-0.14, 0.08, 0.16],
      }, pos: { Hips: [0.01, -0.05, -0.08] },
    },
    { t: ONE_SHOT.stagger, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function dodgeStep(dir: 'back' | 'left' | 'right', heavy: boolean): PoseKey[] {
  const drop = heavy ? 0.70 : 1;
  const sx = dir === 'left' ? -1 : dir === 'right' ? 1 : -0.25;
  const sz = dir === 'back' ? -1 : -0.35;
  const yaw = dir === 'left' ? -0.48 : dir === 'right' ? 0.48 : -0.38;
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.05, ease: 'out', rot: {
        Hips: [-0.12 * drop, yaw * 0.4, 0.08 * sx],
        Spine: [0.08, yaw * 0.3, 0.08 * sx],
        LeftUpLeg: [0.20, 0, 0.08],
        RightUpLeg: [0.08, 0, -0.08],
        LeftArm: [0.22, 0, -0.18],
        RightArm: [-0.18, 0, 0.20],
      }, pos: { Hips: [0.05 * sx, -0.07 * drop, 0.06 * sz] },
    },
    {
      t: 0.14, ease: 'inout', rot: {
        Hips: [-0.20 * drop, yaw, 0.16 * sx],
        Spine02: [0.12, yaw * 0.45, 0.14 * sx],
        Spine01: [0.14, yaw * 0.5, 0.16 * sx],
        Spine: [0.20, yaw * 0.7, 0.22 * sx],
        neck: [0.10, yaw * 0.4, 0.08 * sx],
        Head: [0.08, yaw * 0.3, 0.04 * sx],
        LeftArm: [0.52, 0.12, -0.38],
        RightArm: [-0.44, -0.10, 0.48],
        LeftForeArm: [0.38, 0, 0],
        RightForeArm: [0.32, 0, 0],
        LeftUpLeg: dir === 'right' ? [0.18, 0.04, -0.08] : [0.62, 0.10, 0.18],
        LeftLeg: dir === 'right' ? [0.22, 0, 0] : [0.82, 0, 0],
        LeftFoot: [-0.22, 0, 0],
        RightUpLeg: dir === 'left' ? [0.16, -0.04, 0.08] : [0.14, -0.08, -0.20],
        RightLeg: [0.22, 0, 0],
      }, pos: { Hips: [0.18 * sx, -0.16 * drop, 0.16 * sz] },
    },
    {
      t: 0.28, ease: 'inout', rot: {
        Hips: [-0.06, yaw * 0.25, 0.04 * sx],
        Spine: [0.06, yaw * 0.2, 0.06 * sx],
        LeftUpLeg: [0.14, 0, 0.04],
        LeftLeg: [0.18, 0, 0],
        LeftArm: [0.12, 0, -0.10],
        RightArm: [-0.10, 0, 0.10],
      }, pos: { Hips: [0.05 * sx, -0.04, 0.04 * sz] },
    },
    { t: ONE_SHOT.dodge, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}

export function deathFall(): PoseKey[] {
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

export function deathThrow(): PoseKey[] {
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.06, ease: 'in', rot: {
        Hips: [-0.28, 0.18, 0.12],
        Spine: [-0.42, 0.16, 0.14],
        neck: [-0.32, 0.20, 0.08],
        Head: [-0.18, 0.12, 0.06],
        LeftArm: [0.62, 0.22, -0.35],
        RightArm: [-0.55, 0.28, 0.55],
      }, pos: { Hips: [0.02, 0.08, -0.10] },
    },
    {
      t: 0.22, ease: 'inout', rot: {
        Hips: [-0.55, 0.32, 0.22],
        Spine02: [-0.28, 0.12, 0.16],
        Spine: [-0.22, 0.10, 0.18],
        neck: [0.18, 0.16, 0.10],
        Head: [0.22, 0.12, 0.08],
        LeftUpLeg: [0.35, 0.16, 0.22],
        RightUpLeg: [0.55, -0.18, -0.28],
        LeftArm: [0.85, 0.10, -0.72],
        RightArm: [-0.22, 0.35, 1.05],
      }, pos: { Hips: [0.04, 0.22, -0.28] },
    },
    {
      t: 0.55, ease: 'in', rot: {
        Hips: [0.85, 0.22, 1.18],
        Spine: [0.22, 0.08, 0.22],
        neck: [0.42, 0.10, 0.16],
        Head: [0.28, 0.06, 0.10],
        LeftUpLeg: [0.72, 0.18, 0.38],
        LeftLeg: [0.95, 0, 0],
        RightUpLeg: [0.38, -0.16, -0.45],
        RightLeg: [0.55, 0, 0],
        LeftArm: [0.55, 0.06, -0.48],
        RightArm: [-0.42, 0.16, 0.78],
      }, pos: { Hips: [0.16, -0.55, -0.06] },
    },
    {
      t: ONE_SHOT.death, ease: 'lin', rot: {
        Hips: [1.18, 0.10, 1.48],
        Spine: [0.10, 0, 0.10],
        neck: [0.18, 0, 0.08],
        Head: [0.12, 0, 0.04],
        LeftUpLeg: [0.48, 0.10, 0.26],
        LeftLeg: [0.68, 0, 0],
        RightUpLeg: [0.26, -0.08, -0.30],
        RightLeg: [0.36, 0, 0],
        LeftArm: [0.32, 0.02, -0.30],
        RightArm: [-0.24, 0.08, 0.42],
      }, pos: { Hips: [0.20, -0.88, 0.10] },
    },
  ];
}

export function deathCollapse(): PoseKey[] {
  return [
    { t: 0, ease: 'out', rot: {} },
    {
      t: 0.10, ease: 'out', rot: {
        Hips: [0.18, 0.06, 0.08],
        Spine: [0.22, 0.04, 0.10],
        neck: [0.16, 0.04, 0.04],
        LeftUpLeg: [0.32, 0.06, 0.12],
        RightUpLeg: [0.28, -0.04, -0.10],
        LeftArm: [0.22, 0.08, -0.18],
        RightArm: [-0.18, 0.08, 0.22],
      }, pos: { Hips: [0.02, -0.12, 0.02] },
    },
    {
      t: 0.36, ease: 'in', rot: {
        Hips: [0.72, 0.10, 0.85],
        Spine02: [0.28, 0.04, 0.18],
        Spine: [0.18, 0.02, 0.14],
        neck: [0.32, 0.06, 0.12],
        Head: [0.22, 0.04, 0.08],
        LeftUpLeg: [0.85, 0.14, 0.32],
        LeftLeg: [1.12, 0, 0],
        RightUpLeg: [0.55, -0.10, -0.28],
        RightLeg: [0.72, 0, 0],
        LeftArm: [0.42, 0.04, -0.38],
        RightArm: [-0.32, 0.10, 0.48],
      }, pos: { Hips: [0.08, -0.62, 0.08] },
    },
    {
      t: 0.50, ease: 'out', rot: {
        Hips: [0.82, 0.06, 0.95],
        Spine: [0.10, 0, 0.08],
        neck: [0.18, 0.02, 0.06],
        LeftUpLeg: [0.62, 0.10, 0.22],
        RightUpLeg: [0.40, -0.08, -0.22],
      }, pos: { Hips: [0.10, -0.52, 0.10] },
    },
    {
      t: ONE_SHOT.death, ease: 'lin', rot: {
        Hips: [0.98, 0.04, 1.12],
        Spine: [0.08, 0, 0.06],
        neck: [0.12, 0, 0.04],
        Head: [0.08, 0, 0.02],
        LeftUpLeg: [0.48, 0.08, 0.18],
        LeftLeg: [0.62, 0, 0],
        RightUpLeg: [0.32, -0.06, -0.18],
        RightLeg: [0.42, 0, 0],
        LeftArm: [0.22, 0, -0.22],
        RightArm: [-0.18, 0.04, 0.28],
      }, pos: { Hips: [0.12, -0.78, 0.10] },
    },
  ];
}

export function deathDismember(): PoseKey[] {
  return [
    { t: 0, ease: 'in', rot: {} },
    {
      t: 0.08, ease: 'in', rot: {
        Hips: [-0.16, 0.14, 0.10],
        Spine: [-0.22, 0.12, 0.12],
        RightShoulder: [0.45, -0.22, 0.55],
        RightArm: [-0.85, 0.55, 1.35],
        RightForeArm: [0.22, 0.35, 0.42],
        RightHand: [0.18, 0.28, 0.32],
        LeftArm: [0.32, 0.12, -0.28],
      }, pos: { Hips: [0.03, -0.04, -0.06] },
    },
    {
      t: 0.28, ease: 'back', rot: {
        Hips: [0.42, 0.22, 0.62],
        Spine: [0.18, 0.10, 0.22],
        neck: [0.22, 0.14, 0.10],
        Head: [0.16, 0.10, 0.08],
        RightShoulder: [0.72, -0.38, 0.85],
        RightArm: [-1.55, 0.85, 1.85],
        RightForeArm: [0.08, 0.55, 0.62],
        RightHand: [0.10, 0.42, 0.48],
        LeftUpLeg: [0.55, 0.12, 0.28],
        LeftLeg: [0.78, 0, 0],
        RightUpLeg: [0.28, -0.14, -0.35],
        LeftArm: [0.62, 0.08, -0.55],
      }, pos: { Hips: [0.10, -0.28, 0.04] },
    },
    {
      t: 0.52, ease: 'in', rot: {
        Hips: [0.92, 0.16, 1.22],
        Spine: [0.14, 0.04, 0.14],
        neck: [0.28, 0.06, 0.12],
        RightShoulder: [0.55, -0.22, 0.62],
        RightArm: [-1.22, 0.62, 1.55],
        RightForeArm: [0.12, 0.38, 0.42],
        LeftUpLeg: [0.68, 0.14, 0.35],
        LeftLeg: [0.92, 0, 0],
        RightUpLeg: [0.38, -0.12, -0.40],
        RightLeg: [0.52, 0, 0],
        LeftArm: [0.45, 0.04, -0.40],
      }, pos: { Hips: [0.16, -0.72, 0.10] },
    },
    {
      t: ONE_SHOT.death, ease: 'lin', rot: {
        Hips: [1.08, 0.08, 1.38],
        Spine: [0.08, 0, 0.08],
        neck: [0.14, 0, 0.06],
        Head: [0.10, 0, 0.04],
        RightShoulder: [0.42, -0.16, 0.48],
        RightArm: [-0.95, 0.48, 1.22],
        RightForeArm: [0.10, 0.28, 0.32],
        LeftUpLeg: [0.50, 0.10, 0.26],
        LeftLeg: [0.70, 0, 0],
        RightUpLeg: [0.28, -0.08, -0.30],
        RightLeg: [0.38, 0, 0],
        LeftArm: [0.32, 0.02, -0.32],
      }, pos: { Hips: [0.18, -0.90, 0.12] },
    },
  ];
}

/** Couche additive TERM : poids de marche (hanches + épaules), in-place, 0,90 s. */
export function termWalkWeight(): PoseKey[] {
  return [
    { t: 0, ease: 'inout', rot: {}, pos: { Hips: [0, 0, 0] } },
    {
      t: 0.22, ease: 'inout', rot: {
        Hips: [0.04, 0.03, 0.02],
        Spine02: [0.03, 0.02, 0.02],
        Spine: [0.05, 0.04, 0.03],
        LeftShoulder: [0.04, 0, -0.03],
        RightShoulder: [-0.03, 0, 0.04],
      }, pos: { Hips: [0, -0.035, 0] },
    },
    {
      t: 0.45, ease: 'inout', rot: {
        Hips: [0.02, 0, 0],
        Spine: [0.02, 0, 0],
      }, pos: { Hips: [0, -0.008, 0] },
    },
    {
      t: 0.68, ease: 'inout', rot: {
        Hips: [0.04, -0.03, -0.02],
        Spine02: [0.03, -0.02, -0.02],
        Spine: [0.05, -0.04, -0.03],
        LeftShoulder: [-0.03, 0, 0.04],
        RightShoulder: [0.04, 0, -0.03],
      }, pos: { Hips: [0, -0.035, 0] },
    },
    { t: 0.90, ease: 'lin', rot: {}, pos: { Hips: [0, 0, 0] } },
  ];
}
