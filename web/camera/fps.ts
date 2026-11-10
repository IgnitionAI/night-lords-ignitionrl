// Caméra FPS : œil du Terminator. Présentation seulement — aucune règle de sim.
// Isolé de web/combat-cam.ts (PR combat 3e personne) pour limiter les conflits.
import * as THREE from 'three';
import type { Box } from '../../src/sim';
import { TERM_HEIGHT } from '../stride';

/** Visor d'une Terminator en armure tactique Dreadnought (~84 % de 2,6 m). */
export const FPS_EYE = TERM_HEIGHT * 0.838; // 2.1788 m
export const FPS_NEAR = 0.07;
export const FPS_FAR = 200;
export const FPS_FOV = 72;
export const FPS_FOV_PORTRAIT = 80;
export const FPS_PITCH_MIN = -1.15;
export const FPS_PITCH_MAX = 0.72;
export const FPS_LOOK_SENS = 0.00215;
export const FPS_EXPOSURE = 1.72;
export const FPS_FOG_DENSITY = 0.036;
export const FPS_AHEAD = 0.11;

export const FPS_BOB = {
  w: 21.4,
  z: 0.68,
  vY: 0.62,
  vX: 0.38,
  idleY: 0.006,
  idleT: 4.4,
};

export type CamMode = 'fps' | 'couloir' | 'epaule' | 'troisquarts';

export function parseCamMode(raw: string | null): CamMode {
  if (raw === 'couloir') return 'couloir';
  if (raw === 'troisquarts') return 'troisquarts';
  if (raw === 'epaule') return 'epaule';
  return 'fps';
}

export function fpsFov(portrait: boolean): number {
  return portrait ? FPS_FOV_PORTRAIT : FPS_FOV;
}

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface FpsLook {
  yaw: number;
  pitch: number;
  locked: boolean;
}

export function freshLook(yaw = 0): FpsLook {
  return { yaw, pitch: -0.06, locked: false };
}

export function applyLookDelta(look: FpsLook, dx: number, dy: number, sens = FPS_LOOK_SENS): void {
  look.yaw = wrapPi(look.yaw - dx * sens);
  look.pitch = clamp(look.pitch - dy * sens, FPS_PITCH_MIN, FPS_PITCH_MAX);
}

/** Consigne `turn` ∈ [-1, 1] pour que la sim rattrape le lacet souris, sans toucher src/sim.ts. */
export function turnTowardYaw(facing: number, yaw: number, turnMax: number, dt: number): number {
  const err = wrapPi(yaw - facing);
  const maxStep = Math.max(1e-6, turnMax * dt);
  return clamp(err / maxStep, -1, 1);
}

type Imp = { t0: number; v: number; foot: 0 | 1 };

export function osc(imps: readonly Imp[], t: number, w: number, z: number): number {
  const wd = w * Math.sqrt(1 - z * z);
  let x = 0;
  for (const i of imps) {
    const a = t - i.t0;
    if (a < 0 || a > 1.05) continue;
    x += (i.v / wd) * Math.exp(-z * w * a) * Math.sin(wd * a);
  }
  return x;
}

export function pushStepImpulse(imps: Imp[], t0: number, intensity: number, foot: 0 | 1): void {
  const amp = intensity > 0 ? 0.72 + 0.28 * intensity : 1.22;
  imps.push({ t0, v: -FPS_BOB.vY * amp, foot });
}

export function bobAt(imps: readonly Imp[], t: number): { y: number; x: number; roll: number } {
  const yStep = osc(imps, t, FPS_BOB.w, FPS_BOB.z);
  let x = 0;
  let roll = 0;
  const wd = FPS_BOB.w * Math.sqrt(1 - FPS_BOB.z * FPS_BOB.z);
  for (const i of imps) {
    const a = t - i.t0;
    if (a < 0 || a > 1.05) continue;
    const s = (i.v / wd) * Math.exp(-FPS_BOB.z * FPS_BOB.w * a) * Math.sin(wd * a);
    const side = i.foot === 0 ? 1 : -1;
    x += side * FPS_BOB.vX * s;
    roll += side * s * 0.045;
  }
  const idle = Math.sin(t * (2 * Math.PI / FPS_BOB.idleT)) * FPS_BOB.idleY;
  return { y: yStep + idle, x, roll };
}

export function inPillar(x: number, z: number, pillars: readonly Box[], pad = 0.22): boolean {
  return pillars.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.y0 - pad && z < b.y1 + pad);
}

export function unclipEye(
  x: number,
  y: number,
  z: number,
  pillars: readonly Box[],
  arena: { w: number; h: number },
  pad = 0.28,
): { x: number; y: number; z: number } {
  let cx = clamp(x, pad, arena.w - pad);
  let cz = clamp(z, pad, arena.h - pad);
  const cy = clamp(y, 0.4, 4.6);
  for (const b of pillars) {
    const inside = cx > b.x0 - pad && cx < b.x1 + pad && cz > b.y0 - pad && cz < b.y1 + pad;
    if (!inside) continue;
    const left = cx - (b.x0 - pad);
    const right = (b.x1 + pad) - cx;
    const down = cz - (b.y0 - pad);
    const up = (b.y1 + pad) - cz;
    const m = Math.min(left, right, down, up);
    if (m === left) cx = b.x0 - pad;
    else if (m === right) cx = b.x1 + pad;
    else if (m === down) cz = b.y0 - pad;
    else cz = b.y1 + pad;
  }
  return { x: cx, y: cy, z: cz };
}

export interface FpsPoseIn {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  now: number;
  steps: readonly Imp[];
  shake: { sx: number; sz: number };
  pillars: readonly Box[];
  arena: { w: number; h: number };
  impact: boolean;
}

export interface FpsPose {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  roll: number;
  bobY: number;
}

export function fpsPose(input: FpsPoseIn): FpsPose {
  const fwdX = Math.cos(input.yaw);
  const fwdZ = Math.sin(input.yaw);
  const rx = -fwdZ;
  const rz = fwdX;
  const bob = input.impact ? bobAt(input.steps, input.now) : { y: 0, x: 0, roll: 0 };
  const eyeY = FPS_EYE + bob.y + input.shake.sx * 0.08;
  const ox = fwdX * FPS_AHEAD + rx * bob.x + input.shake.sx;
  const oz = fwdZ * FPS_AHEAD + rz * bob.x + input.shake.sz;
  const rawX = input.x + ox;
  const rawZ = input.y + oz;
  const clipped = unclipEye(rawX, eyeY, rawZ, input.pillars, input.arena);
  const cp = Math.cos(input.pitch);
  const sp = Math.sin(input.pitch);
  const lx = clipped.x + fwdX * cp;
  const ly = clipped.y + sp;
  const lz = clipped.z + fwdZ * cp;
  return {
    camX: clipped.x,
    camY: clipped.y,
    camZ: clipped.z,
    lookX: lx,
    lookY: ly,
    lookZ: lz,
    roll: bob.roll,
    bobY: bob.y,
  };
}

export function applyFpsCamera(camera: THREE.PerspectiveCamera, pose: FpsPose): void {
  camera.near = FPS_NEAR;
  camera.far = FPS_FAR;
  camera.position.set(pose.camX, pose.camY, pose.camZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  if (pose.roll) camera.rotateZ(pose.roll);
}

export function projectNdc(
  wx: number, wy: number, wz: number, camera: THREE.PerspectiveCamera,
): { x: number; y: number; z: number } {
  const v = new THREE.Vector3(wx, wy, wz).project(camera);
  return { x: v.x, y: v.y, z: v.z };
}

export interface OffscreenMark {
  i: number;
  ang: number;
  edgeX: number;
  edgeY: number;
  d: number;
  armed: boolean;
}

export function offscreenMarks(
  term: { x: number; y: number; yaw: number },
  nls: readonly { x: number; y: number; alive: boolean; armTicks: number }[],
  camera: THREE.PerspectiveCamera,
): OffscreenMark[] {
  const out: OffscreenMark[] = [];
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    const d = Math.hypot(n.x - term.x, n.y - term.y);
    const ndc = projectNdc(n.x, 1.7, n.y, camera);
    const on = ndc.z < 1 && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1;
    if (on && d < 14) continue;
    let ang = Math.atan2(n.y - term.y, n.x - term.x) - term.yaw;
    ang = wrapPi(ang);
    const r = 0.86;
    out.push({
      i,
      ang,
      edgeX: Math.sin(ang) * r,
      edgeY: -Math.cos(ang) * r * 0.55,
      d,
      armed: n.armTicks > 0,
    });
  }
  return out;
}
