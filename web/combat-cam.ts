// Caméra de combat : ancrée sur le Terminator (toujours dans le cadre), NL proche en two-shot court.
// Rien ici ne touche la simulation (pas de step, pas de NL_CFG / T_CFG).
import * as THREE from 'three';
import type { Box } from '../src/sim';

export const FOG_CLEAR_M = 22;
export const TERM_MODEL_H = 2.6;
export const PILLAR_TOP = 4.3;
/** Au-dessus du fût visuel (~4 m) + AABB paddée (~4,52 m), sous les poutres (5,55 m) et le plafond (5,75 m). */
export const MELEE_LIFT = 4.72;
/** Pad visuel : le fût rendu est plus large que la boîte de collision. */
export const MELEE_LOS_PAD = 0.28;

/** Épaule droite, cadrage serré (proie). `COMBAT_CAM` = alias historique. */
export const COMBAT_CAM = {
  fov: 50,
  fovPortrait: 60,
  fovMax: 56,
  minBack: 1.22,
  maxBack: 2.62,
  height: 1.94,
  highMax: 5.55,
  eye: 1.52,
  orbitMax: 0.42,
  posLerp: 0.11,
  lookLerp: 0.15,
  side: 0.64,
  along: 0.22,
  lookMix: 0.22,
  nlIncludeM: 14,
  termMargin: 0.84,
  termMinScreen: 0.18,
  near: 0.16,
};
export const SHOULDER_CAM = COMBAT_CAM;

export type CombatNl = { x: number; y: number; alive: boolean; armTicks?: number };
export type CombatTerm = { x: number; y: number; facing: number };
export type CombatPose = {
  camX: number; camY: number; camZ: number;
  lookX: number; lookY: number; lookZ: number;
  fov: number; orbit: number; back: number;
};
export type Ndc = { x: number; y: number; z: number };

function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function worldDist(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return Math.hypot(ax - bx, ay - by, az - bz);
}

export function threatScore(term: CombatTerm, nl: CombatNl): number {
  const d = Math.hypot(nl.x - term.x, nl.y - term.y);
  let s = 100 / (d + 0.4);
  if ((nl.armTicks ?? 0) > 0) s += 80;
  return s;
}

export function pickFocusNl(term: CombatTerm, nls: CombatNl[]): number | null {
  let best = -1;
  let bestS = -1;
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    const s = threatScore(term, n);
    if (s > bestS) { bestS = s; best = i; }
  }
  return best < 0 ? null : best;
}

function inPillar(x: number, z: number, pillars: Box[]): boolean {
  return pillars.some((b) => x > b.x0 - 0.55 && x < b.x1 + 0.55 && z > b.y0 - 0.55 && z < b.y1 + 0.55);
}

export function distToPillars(x: number, z: number, pillars: Box[]): number {
  let best = Infinity;
  for (const b of pillars) {
    const cx = clamp(x, b.x0, b.x1);
    const cz = clamp(z, b.y0, b.y1);
    const inside = x >= b.x0 && x <= b.x1 && z >= b.y0 && z <= b.y1;
    best = Math.min(best, inside ? 0 : Math.hypot(x - cx, z - cz));
  }
  return best;
}

function segNearPillar(
  ax: number, az: number, bx: number, bz: number,
  pillars: Box[], minD: number,
): boolean {
  for (let i = 1; i <= 10; i++) {
    const u = i / 11;
    if (distToPillars(ax + (bx - ax) * u, az + (bz - az) * u, pillars) <= minD) return true;
  }
  return false;
}

export function avoidWalls(
  camX: number, camZ: number, camY: number,
  pillars: Box[], arena: { w: number; h: number },
): { camX: number; camZ: number; camY: number } {
  let x = clamp(camX, 0.6, arena.w - 0.6);
  let z = clamp(camZ, 0.6, arena.h - 0.6);
  let y = camY;
  if (inPillar(x, z, pillars)) y = Math.max(y, COMBAT_CAM.highMax);
  if (inPillar(x, z, pillars)) {
    const cx = arena.w * 0.5, cz = arena.h * 0.5;
    const dx = x - cx, dz = z - cz;
    const len = Math.hypot(dx, dz) || 1;
    x = clamp(x + (dx / len) * 1.4, 0.6, arena.w - 0.6);
    z = clamp(z + (dz / len) * 1.4, 0.6, arena.h - 0.6);
    y = Math.max(y, COMBAT_CAM.highMax);
  }
  return { camX: x, camZ: z, camY: y };
}

/** Intersection rayon 3D / AABB (méthode des slabs). */
function rayHitsAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  tMax: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): boolean {
  let t0 = 0, t1 = tMax;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, ox - minX)) return false;
  if (!clip(dx, maxX - ox)) return false;
  if (!clip(-dy, oy - minY)) return false;
  if (!clip(dy, maxY - oy)) return false;
  if (!clip(-dz, oz - minZ)) return false;
  if (!clip(dz, maxZ - oz)) return false;
  return t1 >= t0;
}

export function losClear(
  camX: number, camY: number, camZ: number,
  tx: number, ty: number, tz: number,
  pillars: Box[],
  pad = 0.22,
): boolean {
  const dx = tx - camX, dy = ty - camY, dz = tz - camZ;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.15) return true;
  for (const b of pillars) {
    if (rayHitsAabb(
      camX, camY, camZ, dx, dy, dz, len,
      b.x0 - pad, -0.2, b.y0 - pad,
      b.x1 + pad, PILLAR_TOP + pad, b.y1 + pad,
    )) return false;
  }
  return true;
}

/**
 * Occlusion unique (combat, épaule, 3/4, couloir) : rayon 3D vs AABB des piliers (`losClear`)
 * et œil hors volume (`avoidWalls`). Si le rayon est coupé, on **monte** (`highMax`) et on se
 * rapproche du sujet — le lift de #72, sans second test 2D ad hoc.
 */
export function liftFollowIfOccluded(
  camX: number, camY: number, camZ: number,
  subjX: number, subjY: number,
  fwdX: number, fz: number, rx: number, rz: number,
  back: number, side: number,
  pillars: Box[],
  arena: { w: number; h: number },
  highMax: number,
  targetX?: number,
  targetY?: number,
): { camX: number; camY: number; camZ: number } {
  const eye = 1.4;
  let x = camX, y = camY, z = camZ;
  const parked = avoidWalls(x, z, y, pillars, arena);
  x = parked.camX; y = parked.camY; z = parked.camZ;
  const subjClear = losClear(x, y, z, subjX, eye, subjY, pillars);
  const tgtClear = targetX === undefined || targetY === undefined
    || losClear(x, y, z, targetX, eye, targetY, pillars, MELEE_LOS_PAD);
  if (subjClear && tgtClear) return { camX: x, camY: y, camZ: z };
  x = subjX - fwdX * (back * 0.45) + rx * (side + 1.35);
  z = subjY - fz * (back * 0.45) + rz * (side + 1.35);
  y = Math.max(y, highMax === COMBAT_CAM.highMax ? MELEE_LIFT : highMax);
  const cleared = avoidWalls(x, z, y, pillars, arena);
  const pulled = pullForLos(cleared.camX, cleared.camY, cleared.camZ, subjX, eye, subjY, pillars);
  if (targetX === undefined || targetY === undefined) return pulled;
  if (losClear(pulled.camX, pulled.camY, pulled.camZ, targetX, eye, targetY, pillars, MELEE_LOS_PAD)) return pulled;
  return pullForLos(pulled.camX, MELEE_LIFT, pulled.camZ, targetX, eye, targetY, pillars);
}

function pullForLos(
  camX: number, camY: number, camZ: number,
  tx: number, ty: number, tz: number,
  pillars: Box[],
): { camX: number; camY: number; camZ: number } {
  if (losClear(camX, camY, camZ, tx, ty, tz, pillars)) {
    return { camX, camY, camZ };
  }
  const raisedY = MELEE_LIFT;
  if (losClear(camX, raisedY, camZ, tx, ty, tz, pillars)) {
    return { camX, camY: raisedY, camZ };
  }
  for (let k = 1; k <= 10; k++) {
    const u = k / 10;
    const x = camX + (tx - camX) * u;
    const y = camY + (ty - camY) * u;
    const z = camZ + (tz - camZ) * u;
    if (losClear(x, y, z, tx, ty, tz, pillars)) return { camX: x, camY: Math.max(y, 2.4), camZ: z };
    if (losClear(x, raisedY, z, tx, ty, tz, pillars)) return { camX: x, camY: raisedY, camZ: z };
  }
  return { camX, camY: raisedY, camZ };
}

export function huntThreatCount(
  term: CombatTerm,
  nls: CombatNl[],
  radius = 9,
): number {
  let n = 0;
  for (const nl of nls) {
    if (!nl.alive) continue;
    if (Math.hypot(nl.x - term.x, nl.y - term.y) <= radius) n++;
  }
  return n;
}

export function huntTremor(count: number, t: number): { sx: number; sz: number } {
  const a = Math.min(4, Math.max(0, count)) * 0.011;
  return { sx: Math.sin(t * 33.1) * a, sz: Math.cos(t * 29.4) * a * 0.72 };
}

/** Caméra épaule droite : jamais un two-shot orbital. Le Terminator reste ancré. */
export function desiredCombatPose(input: {
  term: CombatTerm;
  nls: CombatNl[];
  aspect: number;
  portrait: boolean;
  pillars: Box[];
  arena: { w: number; h: number };
  lookBias?: { x: number; y: number; k: number };
}): CombatPose {
  const { term, nls, portrait, pillars, arena } = input;
  const fi = pickFocusNl(term, nls);
  const nl = fi === null ? null : nls[fi]!;
  const span = nl ? Math.hypot(nl.x - term.x, nl.y - term.y) : 12;
  const includeNl = !!nl && span <= COMBAT_CAM.nlIncludeM + 1e-6;
  const toNlYaw = nl ? Math.atan2(nl.y - term.y, nl.x - term.x) : term.facing;
  const relNl = nl ? wrapPi(toNlYaw - term.facing) : 0;
  const inFront = includeNl && Math.abs(relNl) < 1.42;
  const melee = includeNl && span <= 3.4;
  const midX = nl ? (term.x + nl.x) * 0.5 : term.x;
  const midZ = nl ? (term.y + nl.y) * 0.5 : term.y;
  const hullNear = melee && nl && Math.min(
    distToPillars(term.x, term.y, pillars),
    distToPillars(nl.x, nl.y, pillars),
    distToPillars(midX, midZ, pillars),
  ) < 1.85;
  const fov0 = portrait ? COMBAT_CAM.fovPortrait : COMBAT_CAM.fov;
  const orbitWant = inFront ? clamp(relNl * 0.42, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax) : 0;
  const orbits = [0, orbitWant, clamp(orbitWant + 0.18, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax), clamp(orbitWant - 0.16, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax)];
  const backs = melee ? [1.42, 1.68, 1.95, 2.28, 2.55] : [1.28, 1.52, 1.78, 2.08, 2.38];
  const sides = [0.48, 0.64, 0.82, 1.02];
  const heights = hullNear
    ? [2.08, 2.35, 2.72, 3.35, MELEE_LIFT]
    : melee ? [1.88, 1.98, 2.18, 2.55, 3.22] : [1.82, 1.94, 2.08];
  const fovs = melee ? [fov0, 54, COMBAT_CAM.fovMax] : [fov0, 48];
  const mixes = melee && inFront ? [0.28, 0.42, 0.58] : inFront ? [0.10, 0.20] : [0];
  const ux = nl ? (nl.x - term.x) / (span || 1) : Math.cos(term.facing);
  const uz = nl ? (nl.y - term.y) / (span || 1) : Math.sin(term.facing);

  const scorePose = (p: CombatPose, fx: number, fz: number, rx: number, rz: number): number => {
    const tNdc = projectWorld(term.x, 1.4, term.y, p, input.aspect);
    const dT = worldDist(p.camX, p.camY, p.camZ, term.x, 1.4, term.y);
    const hT = screenHeightFrac(term.x, term.y, p, input.aspect);
    const toCamX = p.camX - term.x, toCamZ = p.camZ - term.y;
    const behind = -(toCamX * fx + toCamZ * fz);
    const right = toCamX * rx + toCamZ * rz;
    let s = 0;
    if (inFrustum(tNdc, COMBAT_CAM.termMargin)) s += 90;
    else if (inFrustum(tNdc, 0.94)) s += 8 - Math.abs(tNdc.x) * 24;
    else s -= 140;
    s -= Math.max(0, Math.abs(tNdc.x) - COMBAT_CAM.termMargin) * 110;
    if (hT >= COMBAT_CAM.termMinScreen) s += 40 + Math.min(28, (hT - COMBAT_CAM.termMinScreen) * 50);
    else s -= 70;
    if (dT >= 1.05 && dT <= 3.4) s += 22;
    else if (dT > 4.2) s -= 36;
    if (losClear(p.camX, p.camY, p.camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) s += 50;
    else s -= 90;
    if (behind > 0.35) s += 28; else s -= 55;
    if (right > 0.22) s += 22; else s -= 40;
    s -= Math.max(0, p.camY - (hullNear ? 3.4 : 2.25)) * 16;
    if (includeNl && nl && (inFront || melee)) {
      const nNdc = projectWorld(nl.x, 1.4, nl.y, p, input.aspect);
      const nLos = losClear(p.camX, p.camY, p.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD);
      if (inFrustum(nNdc, melee ? 0.88 : 0.96)) s += melee ? 48 : 18;
      else if (melee) s -= 70;
      if (nLos) s += melee ? 36 : 8;
      else if (melee) s -= 55;
      const cdx = p.lookX - p.camX, cdz = p.lookZ - p.camZ;
      const clen = Math.hypot(cdx, cdz) || 1;
      const alongPunch = (cdx / clen) * ux + (cdz / clen) * uz;
      if (hullNear && alongPunch > 0.78) s -= 40;
    }
    return s;
  };

  let best: CombatPose | null = null;
  let bestS = -1e9;
  for (const orb of orbits) {
    const yaw = term.facing + orb;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const rx = -fz, rz = fx;
    for (const lookMix of mixes) {
      let lookX = term.x + fx * 3.15;
      let lookZ = term.y + fz * 3.15;
      if (includeNl && nl && (inFront || melee)) {
        lookX = term.x + (nl.x - term.x) * lookMix + fx * (1.15 * (1 - lookMix));
        lookZ = term.y + (nl.y - term.y) * lookMix + fz * (1.15 * (1 - lookMix));
      }
      const bias = input.lookBias;
      if (bias && bias.k > 0) {
        lookX = lookX * (1 - bias.k) + bias.x * bias.k;
        lookZ = lookZ * (1 - bias.k) + bias.y * bias.k;
      }
      const lookY = hullNear ? 1.28 : COMBAT_CAM.eye;
      for (const side of sides) {
        for (const back of backs) {
          for (const h of heights) {
            for (const fovTry of fovs) {
              const rawX = term.x - fx * back + rx * side;
              const rawZ = term.y - fz * back + rz * side;
              const lifted = liftFollowIfOccluded(
                rawX, h, rawZ,
                term.x, term.y, fx, fz, rx, rz, back, side,
                pillars, arena, hullNear ? COMBAT_CAM.highMax : Math.max(h, 2.4),
                melee && nl ? nl.x : undefined,
                melee && nl ? nl.y : undefined,
              );
              const pulled = pullForLos(lifted.camX, lifted.camY, lifted.camZ, term.x, 1.4, term.y, pillars);
              const p: CombatPose = {
                camX: pulled.camX, camY: pulled.camY, camZ: pulled.camZ,
                lookX, lookY, lookZ,
                fov: fovTry, orbit: orb,
                back: Math.hypot(pulled.camX - term.x, pulled.camZ - term.y),
              };
              const sc = scorePose(p, fx, fz, rx, rz);
              if (sc > bestS) { bestS = sc; best = p; }
            }
          }
        }
      }
    }
  }
  if (!best) {
    const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
    const rx = -fz, rz = fx;
    const lifted = liftFollowIfOccluded(
      term.x - fx * 1.62 + rx * COMBAT_CAM.side, COMBAT_CAM.height, term.y - fz * 1.62 + rz * COMBAT_CAM.side,
      term.x, term.y, fx, fz, rx, rz, 1.62, COMBAT_CAM.side,
      pillars, arena, COMBAT_CAM.height,
    );
    best = {
      camX: lifted.camX, camY: lifted.camY, camZ: lifted.camZ,
      lookX: term.x + fx * 3.1, lookY: COMBAT_CAM.eye, lookZ: term.y + fz * 3.1,
      fov: fov0, orbit: 0,
      back: Math.hypot(lifted.camX - term.x, lifted.camZ - term.y),
    };
  }
  return keepTermFramed(best, term, input.aspect);
}

/** Filet : un whip / alcôve ne doit jamais sortir le Terminator du cadre. */
export function keepTermFramed(pose: CombatPose, term: CombatTerm, aspect: number): CombatPose {
  const tNdc = projectWorld(term.x, 1.4, term.y, pose, aspect);
  const hT = screenHeightFrac(term.x, term.y, pose, aspect);
  if (inFrustum(tNdc, 0.88) && hT >= COMBAT_CAM.termMinScreen * 0.85) return pose;
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const rx = -fz, rz = fx;
  const back = clamp(pose.back, COMBAT_CAM.minBack, 2.05);
  const side = COMBAT_CAM.side;
  const camX = term.x - fx * back + rx * side;
  const camZ = term.y - fz * back + rz * side;
  const camY = clamp(pose.camY, 1.78, 2.35);
  const next: CombatPose = {
    camX, camY, camZ,
    lookX: term.x + fx * 2.6, lookY: COMBAT_CAM.eye, lookZ: term.y + fz * 2.6,
    fov: clamp(pose.fov, 48, 54), orbit: 0, back,
  };
  return next;
}

export function smoothCombatPose(prev: CombatPose, next: CombatPose, dt: number): CombatPose {
  const kPos = 1 - Math.pow(1 - COMBAT_CAM.posLerp, dt / 0.1);
  const kLook = 1 - Math.pow(1 - COMBAT_CAM.lookLerp, dt / 0.1);
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const lerpA = (a: number, b: number, k: number) => a + wrapPi(b - a) * k;
  return {
    camX: lerp(prev.camX, next.camX, kPos),
    camY: lerp(prev.camY, next.camY, kPos),
    camZ: lerp(prev.camZ, next.camZ, kPos),
    lookX: lerp(prev.lookX, next.lookX, kLook),
    lookY: lerp(prev.lookY, next.lookY, kLook),
    lookZ: lerp(prev.lookZ, next.lookZ, kLook),
    fov: lerp(prev.fov, next.fov, kLook),
    orbit: lerpA(prev.orbit, next.orbit, kLook),
    back: lerp(prev.back, next.back, kPos),
  };
}

const _cam = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 200);

export function projectWorld(wx: number, wy: number, wz: number, pose: CombatPose, aspect: number): Ndc {
  _cam.fov = pose.fov;
  _cam.aspect = aspect;
  _cam.near = 0.1;
  _cam.far = 200;
  _cam.position.set(pose.camX, pose.camY, pose.camZ);
  _cam.up.set(0, 1, 0);
  _cam.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  _cam.updateProjectionMatrix();
  _cam.updateMatrixWorld(true);
  const v = new THREE.Vector3(wx, wy, wz).project(_cam);
  return { x: v.x, y: v.y, z: v.z };
}

export function inFrustum(ndc: Ndc, margin = 0.999): boolean {
  return Math.abs(ndc.x) <= margin && Math.abs(ndc.y) <= margin && ndc.z >= -1 && ndc.z <= 1;
}

export function screenHeightFrac(wx: number, wz: number, pose: CombatPose, aspect: number, height = TERM_MODEL_H): number {
  const feet = projectWorld(wx, 0, wz, pose, aspect);
  const head = projectWorld(wx, height, wz, pose, aspect);
  if (feet.z < -1 || head.z > 1) return 0;
  return Math.abs(head.y - feet.y) / 2;
}

export function isReadableOnScreen(ndc: Ndc, distCam: number, fogM: number): boolean {
  return inFrustum(ndc) && distCam <= fogM && distCam > 0.4;
}

export function offscreenMarker(ndc: Ndc): { visible: boolean; nx: number; ny: number } {
  if (inFrustum(ndc, 1)) return { visible: false, nx: ndc.x, ny: ndc.y };
  const m = Math.max(Math.abs(ndc.x), Math.abs(ndc.y), 1e-6);
  return { visible: true, nx: clamp(ndc.x / m, -1, 1), ny: clamp(ndc.y / m, -1, 1) };
}

export function applyCombatCamera(
  camera: THREE.PerspectiveCamera,
  pose: CombatPose,
  shakeX: number,
  shakeZ: number,
): void {
  camera.fov = pose.fov;
  camera.near = COMBAT_CAM.near;
  camera.position.set(pose.camX + shakeX, pose.camY, pose.camZ + shakeZ);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.lookX + shakeX, pose.lookY, pose.lookZ + shakeZ);
  camera.updateProjectionMatrix();
}

export type ReadabilitySample = {
  tick: number;
  living: number;
  anyOnScreen: boolean;
  nls: { i: number; alive: boolean; ndc: Ndc; distCam: number; readable: boolean }[];
};

export function readabilityOf(
  tick: number,
  term: CombatTerm,
  nls: CombatNl[],
  pose: CombatPose,
  aspect: number,
  fogM = FOG_CLEAR_M,
): ReadabilitySample {
  const rows: ReadabilitySample['nls'] = [];
  let living = 0;
  let anyOnScreen = false;
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    living++;
    const ndc = projectWorld(n.x, 1.4, n.y, pose, aspect);
    const distCam = worldDist(pose.camX, pose.camY, pose.camZ, n.x, 1.4, n.y);
    const readable = isReadableOnScreen(ndc, distCam, fogM);
    if (readable) anyOnScreen = true;
    rows.push({ i, alive: true, ndc, distCam, readable });
  }
  void term;
  return { tick, living, anyOnScreen: living === 0 ? true : anyOnScreen, nls: rows };
}
