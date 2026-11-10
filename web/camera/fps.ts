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

/** Rotation seule : vise un NL au casque, sans reculer la caméra dans le vide derrière lui. */
export function lookAtNlChest(
  camera: THREE.PerspectiveCamera,
  camX: number,
  camZ: number,
  nlX: number,
  nlZ: number,
): void {
  const dx = nlX - camX;
  const dz = nlZ - camZ;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return;
  camera.up.set(0, 1, 0);
  camera.lookAt(camX + (dx / d) * 2.6, 1.86, camZ + (dz / d) * 2.6);
  camera.updateMatrixWorld(true);
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

export interface FpsThreatNL {
  x: number;
  y: number;
  alive: boolean;
  armTicks: number;
}

export interface FpsAimHint {
  x: number;
  y: number;
}

export interface FpsThreatFocus {
  yaw: number;
  pitch: number;
  dist: number;
  i: number;
}

/** Hint de visée à partir des événements du tick (présentation seulement). */
export function eventAimHint(
  events: readonly { type: string; who?: number; tx?: number; ty?: number; kill?: number }[],
  nls: readonly FpsThreatNL[],
  term?: { x: number; y: number },
): FpsAimHint | null {
  for (const e of events) {
    if (e.type === 'claw' || e.type === 'clawArm' || e.type === 'whiff') {
      const n = typeof e.who === 'number' ? nls[e.who] : undefined;
      if (n) return { x: n.x, y: n.y };
    }
    if (e.type === 'bolt' && typeof e.tx === 'number' && typeof e.ty === 'number') {
      return { x: e.tx, y: e.ty };
    }
    if (e.type === 'fistCharge') {
      if (!term) continue;
      let best: FpsThreatNL | null = null;
      let bestD = Infinity;
      for (const n of nls) {
        if (!n.alive) continue;
        const d = Math.hypot(n.x - term.x, n.y - term.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) return { x: best.x, y: best.y };
    }
    if (e.type === 'fist') {
      if (typeof e.kill === 'number' && e.kill >= 0 && nls[e.kill]) {
        const n = nls[e.kill]!;
        return { x: n.x, y: n.y };
      }
      if (!term) continue;
      let best: FpsThreatNL | null = null;
      let bestD = Infinity;
      for (const n of nls) {
        if (!n.alive) continue;
        const d = Math.hypot(n.x - term.x, n.y - term.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) return { x: best.x, y: best.y };
    }
  }
  return null;
}

/** Distance à laquelle un joueur se tourne vers un NL (corps à corps). */
export const MELEE_AIM_M = 3;
/** Demi-champ horizontal de visée (rad) — ~FOV 72° 16:9 un peu conservateur. */
export const FPS_LOOK_HALF = 0.85;
export const MELEE_LOCK_TICKS = 14;

export function nlInLook(
  lookYaw: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  half = FPS_LOOK_HALF,
): boolean {
  const ang = wrapPi(Math.atan2(to.y - from.y, to.x - from.x) - lookYaw);
  return Math.abs(ang) <= half;
}

export interface MeleeLock {
  i: number;
  until: number;
}

export function updateMeleeLock(
  lock: MeleeLock | null,
  tick: number,
  events: readonly { type: string; who?: number }[],
  nls: readonly FpsThreatNL[],
): MeleeLock | null {
  let next = lock && tick <= lock.until && nls[lock.i]?.alive ? lock : null;
  for (const e of events) {
    if (e.type !== 'claw' && e.type !== 'clawArm' && e.type !== 'whiff' && e.type !== 'hit') continue;
    const who = typeof e.who === 'number' ? e.who : next?.i;
    if (typeof who !== 'number' || !nls[who]) continue;
    next = { i: who, until: tick + MELEE_LOCK_TICKS };
  }
  return next;
}

function focusAt(
  term: { x: number; y: number },
  x: number,
  y: number,
  i: number,
): FpsThreatFocus {
  const dx = x - term.x;
  const dy = y - term.y;
  const dist = Math.max(0.2, Math.hypot(dx, dy));
  const yaw = Math.atan2(dy, dx);
  // Au contact (~1,2–1,8 m) viser le casque, pas le sol : un pitch de -0,5 sort le NL du haut du FOV 72°.
  const lookH = dist < 2.6 ? 1.88 : 1.55;
  const pitch = clamp(Math.atan2(lookH - FPS_EYE, dist), -0.28, 0.06);
  return { yaw, pitch, dist, i };
}

/** Cible de regard autoplay : menace armée, sinon plus proche (devant prioritaire). */
export function pickFpsThreat(
  term: { x: number; y: number; facing: number },
  nls: readonly FpsThreatNL[],
  hint: FpsAimHint | null = null,
): FpsThreatFocus | null {
  if (hint) return focusAt(term, hint.x, hint.y, -2);
  let bestX = 0;
  let bestY = 0;
  let bestI = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    const dx = n.x - term.x;
    const dy = n.y - term.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.04) continue;
    const rel = Math.abs(wrapPi(Math.atan2(dy, dx) - term.facing));
    let score = 40 / (d + 0.3);
    if (n.armTicks > 0) score += 140;
    if (d < MELEE_AIM_M) score += 160;
    if (rel < 1.05) score += 8;
    // Au contact, un coup dans le dos prime sur un NL lointain devant.
    score -= rel * (d < MELEE_AIM_M ? 0.12 : 2.2);
    if (score > bestScore) {
      bestScore = score;
      bestI = i;
      bestX = n.x;
      bestY = n.y;
    }
  }
  if (bestI < 0) return null;
  return focusAt(term, bestX, bestY, bestI);
}

export function pickAutoplayFocus(
  term: { x: number; y: number; facing: number },
  nls: readonly FpsThreatNL[],
  events: readonly { type: string; who?: number; tx?: number; ty?: number; kill?: number }[],
  lock: MeleeLock | null,
  tick: number,
): { focus: FpsThreatFocus | null; lock: MeleeLock | null; snap: boolean } {
  const nextLock = updateMeleeLock(lock, tick, events, nls);
  const hint = eventAimHint(events, nls, term);
  if (nextLock && nls[nextLock.i]?.alive) {
    const n = nls[nextLock.i]!;
    return { focus: focusAt(term, n.x, n.y, nextLock.i), lock: nextLock, snap: true };
  }
  let armedI = -1;
  let armedD = Infinity;
  let meleeI = -1;
  let meleeD = Infinity;
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    const d = Math.hypot(n.x - term.x, n.y - term.y);
    if (n.armTicks > 0 && d < armedD) { armedD = d; armedI = i; }
    if (d < MELEE_AIM_M && d < meleeD) { meleeD = d; meleeI = i; }
  }
  if (armedI >= 0) {
    const n = nls[armedI]!;
    return {
      focus: focusAt(term, n.x, n.y, armedI),
      lock: { i: armedI, until: tick + MELEE_LOCK_TICKS },
      snap: true,
    };
  }
  if (meleeI >= 0) {
    const n = nls[meleeI]!;
    return { focus: focusAt(term, n.x, n.y, meleeI), lock: nextLock, snap: true };
  }
  const focus = pickFpsThreat(term, nls, hint);
  return { focus, lock: nextLock, snap: !!hint };
}

export function steerFpsLook(look: FpsLook, target: { yaw: number; pitch: number }, snap: boolean): void {
  if (snap) {
    look.yaw = target.yaw;
    look.pitch = clamp(target.pitch, FPS_PITCH_MIN, FPS_PITCH_MAX);
    return;
  }
  look.yaw += wrapPi(target.yaw - look.yaw) * 0.36;
  look.pitch = clamp(look.pitch + (target.pitch - look.pitch) * 0.3, FPS_PITCH_MIN, FPS_PITCH_MAX);
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
