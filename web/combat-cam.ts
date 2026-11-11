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
  fov: 58,
  fovPortrait: 68,
  fovMax: 62,
  minBack: 2.85,
  maxBack: 3.55,
  height: 2.58,
  highMax: 5.55,
  eye: 1.72,
  orbitMax: 0.92,
  posLerp: 0.38,
  lookLerp: 0.42,
  side: 1.12,
  along: 0.06,
  lookMix: 0.48,
  nlIncludeM: 8,
  termMargin: 0.80,
  termMinScreen: 0.16,
  termMaxArea: 0.40,
  near: 0.42,
  whipYawMax: 0.85,
};
/** Fenêtre griffe : two-shot amorti dès l’intention, ≤ ces pas par tick. */
export const CLAW_HOLD_AFTER_S = 0.32;
/** Garde le two-shot si l’intention disparaît un tick avant l’armement. */
export const CLAW_INTENT_HOLD_S = 0.85;
export const CLAW_MAX_CAM_STEP_M = 0.72;
export const CLAW_MAX_LOOK_STEP_M = 1.20;
export const CLAW_MAX_ORBIT_STEP_RAD = 0.55;
export const CLAW_MIN_ORBIT = 0.62;
export const CLAW_PRE_RANGE = 2.2;
/** Three-quarter du couple T+NL. Le rendu y va en clampant (pas de coupe). */
export const CLAW_PAIR_SIDE = 4.05;
/** Hold griffe : two-shot plus court, atteignable sans orbiter hors champ. */
export const CLAW_HOLD_PAIR_SIDE = 2.55;
export const STEP_MAX_CAM_M = 0.42;
export const STEP_MAX_LOOK_M = 0.85;
export const STEP_MAX_ORBIT_RAD = 0.28;
/** `NL_ACTIONS` griffe — recopié pour ne pas importer la sim. */
export const CLAW_INTENT = 7;
export const NL_MIN_SCREEN = 0.008;
export const NL_MODEL_H = 2.05;
export const NL_BODY_R = 0.48;
export const NL_MAX_TERM_OVERLAP = 0.55;
/** Capsule visuelle du T : un rayon caméra→NL qui la traverse masque l'attaquant. */
export const TERM_BODY_R = 0.9;
export const TERM_BODY_Y0 = 0.25;
export const TERM_BODY_Y1 = 2.28;
export const SHOULDER_CAM = COMBAT_CAM;

export type CombatNl = { x: number; y: number; alive: boolean; armTicks?: number; lastAction?: number };
export type CombatTerm = { x: number; y: number; facing: number };
export type CombatPose = {
  camX: number; camY: number; camZ: number;
  lookX: number; lookY: number; lookZ: number;
  fov: number; orbit: number; back: number;
};
export type ShoulderClawHold = {
  who: number;
  until: number;
  orbitSign: number;
  fov: number;
  termX: number; termY: number;
  camX: number; camY: number; camZ: number;
  lookX: number; lookY: number; lookZ: number;
  startedAt: number;
  frozen?: boolean;
};
export type ScreenAabb = {
  minX: number; maxX: number; minY: number; maxY: number;
  samples: number; onScreen: number;
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

/** Pousse l'œil hors du volume d'un pilier **sans** monter à `highMax` (ça ferait un plan large). */
export function slideOutOfPillars(
  camX: number, camZ: number,
  pillars: Box[],
  arena: { w: number; h: number },
  pad = 0.62,
): { camX: number; camZ: number } {
  let x = clamp(camX, 0.6, arena.w - 0.6);
  let z = clamp(camZ, 0.6, arena.h - 0.6);
  for (let n = 0; n < 4; n++) {
    let hit = false;
    for (const b of pillars) {
      const x0 = b.x0 - pad, x1 = b.x1 + pad, z0 = b.y0 - pad, z1 = b.y1 + pad;
      if (x <= x0 || x >= x1 || z <= z0 || z >= z1) continue;
      hit = true;
      const dl = x - x0, dr = x1 - x, db = z - z0, dt = z1 - z;
      const m = Math.min(dl, dr, db, dt);
      if (m === dl) x = x0 - 0.04;
      else if (m === dr) x = x1 + 0.04;
      else if (m === db) z = z0 - 0.04;
      else z = z1 + 0.04;
      x = clamp(x, 0.6, arena.w - 0.6);
      z = clamp(z, 0.6, arena.h - 0.6);
    }
    if (!hit) break;
  }
  return { camX: x, camZ: z };
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
      camX, camY, camZ, dx, dy, dz, 1,
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

function focusNl(
  term: CombatTerm,
  nls: CombatNl[],
  lookBias?: { x: number; y: number; k: number },
): CombatNl | null {
  if (lookBias && lookBias.k > 0) {
    let best: CombatNl | null = null;
    let bestD = 1.2;
    for (const n of nls) {
      if (!n.alive) continue;
      const d = Math.hypot(n.x - lookBias.x, n.y - lookBias.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) return best;
  }
  const i = pickFocusNl(term, nls);
  return i === null ? null : nls[i]!;
}

function shoulderYaw(
  term: CombatTerm,
  nl: CombatNl | null,
  lookBias?: { x: number; y: number; k: number },
): number {
  if (lookBias && lookBias.k > 0) {
    const span = Math.hypot(lookBias.x - term.x, lookBias.y - term.y);
    const cap = span <= 3.8 ? COMBAT_CAM.orbitMax : COMBAT_CAM.whipYawMax * Math.min(1, lookBias.k);
    const to = Math.atan2(lookBias.y - term.y, lookBias.x - term.x);
    return term.facing + clamp(wrapPi(to - term.facing), -cap, cap);
  }
  if (nl && nl.alive) {
    const span = Math.hypot(nl.x - term.x, nl.y - term.y);
    if (span <= 3.6) {
      const toNl = Math.atan2(nl.y - term.y, nl.x - term.x);
      return term.facing + clamp(wrapPi(toNl - term.facing), -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax);
    }
  }
  return term.facing;
}

function placeShoulder(
  term: CombatTerm,
  yaw: number,
  back: number,
  side: number,
  height: number,
  pillars: Box[],
  arena: { w: number; h: number },
): { camX: number; camY: number; camZ: number } {
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  const rx = -fz, rz = fx;
  let camX = term.x - fx * back + rx * side;
  let camZ = term.y - fz * back + rz * side;
  const slid = slideOutOfPillars(camX, camZ, pillars, arena);
  camX = slid.camX;
  camZ = slid.camZ;
  let camY = height;
  if (!losClear(camX, camY, camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) {
    const tries: { b: number; s: number }[] = [
      { b: back, s: side + 0.35 }, { b: back, s: side + 0.7 }, { b: back, s: side + 1.05 },
      { b: back, s: side + 1.4 }, { b: back * 0.55, s: side + 1.85 }, { b: back * 0.28, s: side + 2.35 },
      { b: back * 0.45, s: -(side + 1.9) }, { b: 1.15, s: 2.45 },
    ];
    for (const t of tries) {
      const p = slideOutOfPillars(term.x - fx * t.b + rx * t.s, term.y - fz * t.b + rz * t.s, pillars, arena);
      if (losClear(p.camX, height, p.camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) {
        return { camX: p.camX, camY: height, camZ: p.camZ };
      }
    }
    camY = Math.min(2.72, height + 0.35);
  }
  return { camX, camY, camZ };
}

function lookAhead(
  term: CombatTerm,
  yaw: number,
  nl: CombatNl | null,
  melee: boolean,
): { lookX: number; lookY: number; lookZ: number } {
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  const rx = -fz, rz = fx;
  // Regard un cran plus court que 5 m : T plus haut dans le cadre, sans exploser la surface.
  let lookX = term.x + fx * 3.85 + rx * 0.58;
  let lookZ = term.y + fz * 3.85 + rz * 0.58;
  if (melee && nl) {
    lookX = term.x * (1 - COMBAT_CAM.lookMix) + nl.x * COMBAT_CAM.lookMix + fx * 1.55 + rx * 0.30;
    lookZ = term.y * (1 - COMBAT_CAM.lookMix) + nl.y * COMBAT_CAM.lookMix + fz * 1.55 + rz * 0.30;
  }
  return { lookX, lookY: 1.62, lookZ };
}

/** Pose OTS canonique : ~0,6–1,0 m derrière le dos, ~0,4 m à droite, hauteur d'épaule. */
export function canonicalShoulderPose(input: {
  term: CombatTerm;
  nls: CombatNl[];
  aspect: number;
  pillars: Box[];
  arena: { w: number; h: number };
  lookBias?: { x: number; y: number; k: number };
  fov?: number;
}): CombatPose {
  const { term, nls, pillars, arena } = input;
  const nl = focusNl(term, nls, input.lookBias);
  const span = nl ? Math.hypot(nl.x - term.x, nl.y - term.y) : 99;
  const melee = !!nl && nl.alive && span <= 3.6;
  const yaw = shoulderYaw(term, melee ? nl : null, input.lookBias);
  const back = melee ? 3.32 : 3.28;
  const side = melee ? COMBAT_CAM.side + 0.18 : COMBAT_CAM.side;
  const placed = placeShoulder(term, yaw, back, side, COMBAT_CAM.height, pillars, arena);
  const look = lookAhead(term, yaw, melee ? nl : null, melee);
  const pose: CombatPose = {
    camX: placed.camX, camY: clamp(placed.camY, 2.05, 2.82), camZ: placed.camZ,
    lookX: look.lookX, lookY: look.lookY, lookZ: look.lookZ,
    fov: input.fov ?? COMBAT_CAM.fov, orbit: wrapPi(yaw - term.facing),
    back: Math.hypot(placed.camX - term.x, placed.camZ - term.y),
  };
  return keepTermFramed(pose, term, input.aspect, { nls, pillars, arena, lookBias: input.lookBias, skipRebuild: true });
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
  const fov0 = portrait ? COMBAT_CAM.fovPortrait : COMBAT_CAM.fov;
  const nl = focusNl(term, nls, input.lookBias);
  const span = nl ? Math.hypot(nl.x - term.x, nl.y - term.y) : 99;
  const melee = !!nl && nl.alive && span <= 3.6;
  const yaw0 = shoulderYaw(term, melee ? nl : null, input.lookBias);
  const hullNear = distToPillars(term.x, term.y, pillars) < 2.4;
  const backs = melee ? [2.95, 3.22, 3.48] : [2.95, 3.18, 3.42];
  const sides = hullNear || melee ? [0.95, 1.18, 1.42, 1.68] : [0.98, 1.12, 1.28];
  const heights = hullNear ? [2.38, 2.58, 2.72] : melee ? [2.42, 2.58, 2.70] : [2.45, 2.58, 2.68];
  const wantOrb = wrapPi(yaw0 - term.facing);
  const orbits = melee
    ? [wantOrb, clamp(wantOrb * 0.7, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax), 0, 0.45, -0.45]
    : hullNear
      ? [0, 0.32, -0.32, wantOrb]
      : [0, wantOrb];

  const scorePose = (p: CombatPose, fx: number, fz: number, rx: number, rz: number): number => {
    const tNdc = projectWorld(term.x, 1.4, term.y, p, input.aspect);
    const dT = worldDist(p.camX, p.camY, p.camZ, term.x, 1.4, term.y);
    const toCamX = p.camX - term.x, toCamZ = p.camZ - term.y;
    const behind = -(toCamX * fx + toCamZ * fz);
    const right = toCamX * rx + toCamZ * rz;
    let s = 0;
    if (inFrustum(tNdc, COMBAT_CAM.termMargin)) s += 90;
    else if (inFrustum(tNdc, 0.94)) s += 8 - Math.abs(tNdc.x) * 24;
    else s -= 160;
    if (tNdc.x < 0 && tNdc.x > -0.72) s += 24;
    else s -= Math.abs(tNdc.x) * 20;
    if (dT >= 2.5 && dT <= 3.55) s += 44;
    else if (dT < 2.25) s -= 90;
    else if (dT > 3.9) s -= 70;
    if (losClear(p.camX, p.camY, p.camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) s += 50;
    else s -= 220;
    if (behind > 2.35 && behind < 3.5) s += 32;
    else if (behind < 1.8) s -= 150;
    else s -= 40;
    if (!melee && Math.abs(p.orbit) > 0.45) s -= 70;
    if (p.camY >= 2.35 && p.camY <= 2.78) s += 28;
    else if (p.camY < 2.15) s -= 70;
    if (right > 0.7 && right < 1.5) s += 28;
    else if (right < 0) s -= 90;
    else s -= 28;
    const area = termScreenAreaFrac(term, p, input.aspect);
    if (area <= COMBAT_CAM.termMaxArea) s += 36;
    else s -= 80 + (area - COMBAT_CAM.termMaxArea) * 200;
    const hs = termHeadShoulderInFrame(term, p, input.aspect);
    if (hs.head && hs.shoulder) s += 24; else s -= 50;
    if (melee && nl) {
      const nNdc = projectWorld(nl.x, 1.4, nl.y, p, input.aspect);
      const nLos = losClear(p.camX, p.camY, p.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD);
      const blocked = nlOccludedByTerm(p, term, nl);
      if (inFrustum(nNdc, 0.96)) s += 70;
      else if (nNdc.z > 1 || nNdc.z < -1) s -= 90;
      else s -= 36;
      if (nLos) s += 28; else s -= 90;
      if (!blocked) s += 80; else s -= 110;
    }
    return s;
  };

  let best: CombatPose | null = null;
  let bestS = -1e9;
  for (const orb of orbits) {
    const yaw = term.facing + orb;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const rx = -fz, rz = fx;
    const look = lookAhead(term, yaw, melee ? nl : null, melee);
    const lookX = look.lookX;
    const lookZ = look.lookZ;
    for (const side of sides) {
      for (const back of backs) {
        for (const h of heights) {
          const placed = placeShoulder(term, yaw, back, side, h, pillars, arena);
          let camY = clamp(placed.camY, 2.05, 2.82);
          if (melee && nl && !losClear(placed.camX, camY, placed.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD)) {
            camY = Math.min(2.72, camY + 0.45);
          }
          const p: CombatPose = {
            camX: placed.camX, camY, camZ: placed.camZ,
            lookX, lookY: COMBAT_CAM.eye, lookZ,
            fov: fov0, orbit: orb,
            back: Math.hypot(placed.camX - term.x, placed.camZ - term.y),
          };
          const sc = scorePose(p, fx, fz, rx, rz);
          if (sc > bestS) { bestS = sc; best = p; }
        }
      }
    }
  }
  if (!best) {
    return canonicalShoulderPose({ term, nls, aspect: input.aspect, pillars, arena, lookBias: input.lookBias, fov: fov0 });
  }
  if (melee && nl) {
    const blocked = !losClear(best.camX, best.camY, best.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD)
      || nlOccludedByTerm(best, term, nl);
    if (blocked) {
      const ring = ringMeleePose(term, nl, fov0, input.aspect, pillars, arena);
      if (ring) best = ring;
    }
  }
  return keepTermFramed(best, term, input.aspect, { nls, pillars, arena, lookBias: input.lookBias });
}

function ringMeleePose(
  term: CombatTerm,
  nl: CombatNl,
  fov: number,
  aspect: number,
  pillars: Box[],
  arena: { w: number; h: number },
): CombatPose | null {
  let best: CombatPose | null = null;
  let bestS = -1e9;
  const lookX = term.x * 0.55 + nl.x * 0.45;
  const lookZ = term.y * 0.55 + nl.y * 0.45;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const back = 3.0;
    const rawX = term.x + Math.cos(ang) * back;
    const rawZ = term.y + Math.sin(ang) * back;
    const slid = slideOutOfPillars(rawX, rawZ, pillars, arena);
    const camY = COMBAT_CAM.height;
    if (!losClear(slid.camX, camY, slid.camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) continue;
    if (!losClear(slid.camX, camY, slid.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD)) continue;
    const p: CombatPose = {
      camX: slid.camX, camY, camZ: slid.camZ,
      lookX, lookY: COMBAT_CAM.eye, lookZ,
      fov, orbit: wrapPi(Math.atan2(term.y - slid.camZ, term.x - slid.camX) - term.facing),
      back: Math.hypot(slid.camX - term.x, slid.camZ - term.y),
    };
    if (!inFrustum(projectWorld(term.x, 1.4, term.y, p, aspect), 0.9)) continue;
    if (!inFrustum(projectWorld(nl.x, 1.4, nl.y, p, aspect), 0.96)) continue;
    if (nlOccludedByTerm(p, term, nl)) continue;
    const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
    const behind = -((p.camX - term.x) * fx + (p.camZ - term.y) * fz);
    let s = behind > 1.2 ? 40 : behind > 0 ? 5 : -40;
    s += inFrustum(projectWorld(nl.x, 1.4, nl.y, p, aspect), 0.96) ? 50 : -20;
    if (s > bestS) { bestS = s; best = p; }
  }
  return best;
}

function clampLookToTerm(pose: CombatPose, term: CombatTerm, aspect: number): CombatPose {
  const tNdc = projectWorld(term.x, 1.4, term.y, pose, aspect);
  if (inFrustum(tNdc, 0.82) && tNdc.x <= 0.35) return pose;
  const look = lookAhead(term, term.facing + pose.orbit, null, false);
  return { ...pose, lookX: look.lookX, lookY: look.lookY, lookZ: look.lookZ };
}

/** Filet : un whip / alcôve ne doit jamais sortir le Terminator du cadre, ni reculer en plan large. */
export function keepTermFramed(
  pose: CombatPose,
  term: CombatTerm,
  aspect: number,
  extra?: {
    nls?: CombatNl[];
    pillars?: Box[];
    arena?: { w: number; h: number };
    lookBias?: { x: number; y: number; k: number };
    skipRebuild?: boolean;
  },
): CombatPose {
  const tNdc = projectWorld(term.x, 1.4, term.y, pose, aspect);
  const d = Math.hypot(pose.camX - term.x, pose.camZ - term.y);
  const framed = inFrustum(tNdc, 0.86);
  const clear = extra?.pillars
    ? losClear(pose.camX, pose.camY, pose.camZ, term.x, 1.4, term.y, extra.pillars, MELEE_LOS_PAD)
    : true;
  const hs = termHeadShoulderInFrame(term, pose, aspect);
  const area = termScreenAreaFrac(term, pose, aspect);
  const tightOk = framed && clear && hs.head && hs.shoulder
    && d >= COMBAT_CAM.minBack - 0.15 && d <= COMBAT_CAM.maxBack + 0.2
    && pose.camY >= 2.05 && pose.camY <= 2.88
    && area <= COMBAT_CAM.termMaxArea + 0.04;
  const keepClear = framed && clear
    && d >= 2.2 && d <= 4.2 && pose.camY >= 2.0 && pose.camY <= 2.95
    && area <= COMBAT_CAM.termMaxArea + 0.12;
  if (tightOk || keepClear) return clampLookToTerm(pose, term, aspect);
  if (extra?.skipRebuild || !extra?.pillars || !extra.arena) {
    const yaw = shoulderYaw(term, focusNl(term, extra?.nls ?? [], extra?.lookBias), extra?.lookBias);
    const back = clamp(d >= COMBAT_CAM.minBack && d <= COMBAT_CAM.maxBack ? d : 2.95, COMBAT_CAM.minBack, COMBAT_CAM.maxBack);
    const placed = extra?.pillars && extra.arena
      ? placeShoulder(term, yaw, back, COMBAT_CAM.side, clamp(pose.camY, 2.18, 2.55), extra.pillars, extra.arena)
      : (() => {
        const fx = Math.cos(yaw), fz = Math.sin(yaw);
        const rx = -fz, rz = fx;
        return {
          camX: term.x - fx * back + rx * COMBAT_CAM.side,
          camY: clamp(pose.camY, 2.18, 2.55),
          camZ: term.y - fz * back + rz * COMBAT_CAM.side,
        };
      })();
    const look = lookAhead(term, yaw, null, false);
    const snap: CombatPose = {
      camX: placed.camX, camY: clamp(placed.camY, 2.05, 2.82), camZ: placed.camZ,
      lookX: look.lookX, lookY: look.lookY, lookZ: look.lookZ,
      fov: clamp(pose.fov, 54, 62), orbit: wrapPi(yaw - term.facing),
      back: Math.hypot(placed.camX - term.x, placed.camZ - term.y),
    };
    return clampLookToTerm(snap, term, aspect);
  }
  return canonicalShoulderPose({
    term, nls: extra.nls ?? [], aspect, pillars: extra.pillars, arena: extra.arena,
    lookBias: extra.lookBias, fov: pose.fov,
  });
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

/** Rayon caméra → poitrine NL : true si le volume du T le coupe avant l'attaquant. */
export function nlOccludedByTerm(pose: CombatPose, term: CombatTerm, nl: { x: number; y: number }): boolean {
  const dx = nl.x - pose.camX, dy = 1.4 - pose.camY, dz = nl.y - pose.camZ;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.2) return false;
  return rayHitsAabb(
    pose.camX, pose.camY, pose.camZ, dx, dy, dz, 0.92,
    term.x - TERM_BODY_R, TERM_BODY_Y0, term.y - TERM_BODY_R,
    term.x + TERM_BODY_R, TERM_BODY_Y1, term.y + TERM_BODY_R,
  );
}

export function projectedAabbNdc(
  x: number, z: number, rx: number, y0: number, y1: number,
  pose: CombatPose, aspect: number,
): ScreenAabb | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let samples = 0, onScreen = 0;
  for (const ox of [-rx, rx]) {
    for (const oz of [-rx, rx]) {
      for (const oy of [y0, (y0 + y1) * 0.5, y1]) {
        const n = projectWorld(x + ox, oy, z + oz, pose, aspect);
        if (n.z < -1 || n.z > 1) continue;
        samples++;
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
        if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) onScreen++;
      }
    }
  }
  if (samples < 2) return null;
  return { minX, maxX, minY, maxY, samples, onScreen };
}

function projectedAabbArea(
  x: number, z: number, rx: number, y0: number, y1: number,
  pose: CombatPose, aspect: number,
): number {
  const box = projectedAabbNdc(x, z, rx, y0, y1, pose, aspect);
  if (!box) return 0;
  const w = Math.max(0, Math.min(box.maxX, 1) - Math.max(box.minX, -1));
  const h = Math.max(0, Math.min(box.maxY, 1) - Math.max(box.minY, -1));
  return (w * h) / 4;
}

export function aabbOverlapFrac(a: ScreenAabb, b: ScreenAabb): number {
  const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const area = Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY);
  if (area < 1e-8) return 1;
  return (ix * iy) / area;
}

/** Fraction d'écran (0–1) de la bbox projetée du T, clampée au cadre. */
export function termScreenAreaFrac(term: CombatTerm, pose: CombatPose, aspect: number): number {
  const a = projectedAabbArea(term.x, term.y, 0.82, 0, TERM_MODEL_H, pose, aspect);
  return a > 0 ? a : 1;
}

/** Bbox projetée du NL (ce qu’on voit, pas un point poitrine). */
export function nlScreenAreaFrac(nl: { x: number; y: number }, pose: CombatPose, aspect: number): number {
  return projectedAabbArea(nl.x, nl.y, NL_BODY_R, 0.05, NL_MODEL_H, pose, aspect);
}

/** Ce qu’on voit : bbox NL dans le cadre visible, pas avalée par le T, pas sous le cadre. */
export function nlVisibleInFrame(
  nl: { x: number; y: number },
  term: CombatTerm,
  pose: CombatPose,
  aspect: number,
): boolean {
  const chest = projectWorld(nl.x, 1.15, nl.y, pose, aspect);
  const head = projectWorld(nl.x, 1.85, nl.y, pose, aspect);
  if (!inFrustum(head, 0.90) && !inFrustum(chest, 0.90)) return false;
  if (head.y < -0.28 || chest.y < -0.62) return false;
  const box = projectedAabbNdc(nl.x, nl.y, NL_BODY_R, 0.05, NL_MODEL_H, pose, aspect);
  if (!box || box.onScreen / box.samples < 0.45) return false;
  if (nlScreenAreaFrac(nl, pose, aspect) < NL_MIN_SCREEN) return false;
  const tBox = projectedAabbNdc(term.x, term.y, 0.82, 0, TERM_MODEL_H, pose, aspect);
  if (tBox && aabbOverlapFrac(box, tBox) > NL_MAX_TERM_OVERLAP) return false;
  const tChest = projectWorld(term.x, 1.4, term.y, pose, aspect);
  if (Math.hypot(chest.x - tChest.x, chest.y - tChest.y) < 0.14) return false;
  return true;
}

export function poseDelta(a: CombatPose, b: CombatPose): { cam: number; look: number; orbit: number } {
  const ax = a.lookX - a.camX, ay = a.lookY - a.camY, az = a.lookZ - a.camZ;
  const bx = b.lookX - b.camX, by = b.lookY - b.camY, bz = b.lookZ - b.camZ;
  const al = Math.hypot(ax, ay, az) || 1;
  const bl = Math.hypot(bx, by, bz) || 1;
  const dot = clamp((ax * bx + ay * by + az * bz) / (al * bl), -1, 1);
  return {
    cam: Math.hypot(b.camX - a.camX, b.camY - a.camY, b.camZ - a.camZ),
    look: Math.hypot(b.lookX - a.lookX, b.lookY - a.lookY, b.lookZ - a.lookZ),
    orbit: Math.acos(dot),
  };
}

export function clampPoseStep(
  prev: CombatPose, next: CombatPose,
  maxCam: number, maxLook: number, maxOrbit = Infinity,
): CombatPose {
  const d = poseDelta(prev, next);
  const kCam = d.cam > maxCam + 1e-9 ? maxCam / d.cam : 1;
  const kLook = d.look > maxLook + 1e-9 ? maxLook / d.look : 1;
  const kOrb = d.orbit > maxOrbit + 1e-9 ? maxOrbit / d.orbit : 1;
  const k = Math.min(kCam, kLook, kOrb);
  if (k >= 1) return next;
  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    camX: lerp(prev.camX, next.camX),
    camY: lerp(prev.camY, next.camY),
    camZ: lerp(prev.camZ, next.camZ),
    lookX: lerp(prev.lookX, next.lookX),
    lookY: lerp(prev.lookY, next.lookY),
    lookZ: lerp(prev.lookZ, next.lookZ),
    fov: lerp(prev.fov, next.fov),
    orbit: prev.orbit + wrapPi(next.orbit - prev.orbit) * k,
    back: lerp(prev.back, next.back),
  };
}

export function pickClawWho(
  term: CombatTerm,
  nls: CombatNl[],
  clawWho?: number | null,
): number | null {
  if (clawWho != null && nls[clawWho]?.alive) return clawWho;
  let best = -1;
  let bestS = -1;
  for (let i = 0; i < nls.length; i++) {
    const n = nls[i]!;
    if (!n.alive) continue;
    const d = Math.hypot(n.x - term.x, n.y - term.y);
    const armed = (n.armTicks ?? 0) > 0;
    const intent = n.lastAction === CLAW_INTENT;
    if (!armed && !intent) continue;
    const s = (armed ? 90 : 50) + (intent ? 25 : 0) + 20 / (d + 0.4);
    if (s > bestS) { bestS = s; best = i; }
  }
  return best < 0 ? null : best;
}

function pairClawPose(
  term: CombatTerm,
  nl: CombatNl,
  sign: number,
  fov: number,
  pillars: Box[],
  arena: { w: number; h: number },
  _aspect = 16 / 9,
  side = CLAW_PAIR_SIDE,
): CombatPose {
  const px = nl.x - term.x, pz = nl.y - term.y;
  const plen = Math.hypot(px, pz) || 1;
  const fx = px / plen, fz = pz / plen;
  const rx = -fz * sign, rz = fx * sign;
  const mx = term.x * 0.32 + nl.x * 0.68;
  const mz = term.y * 0.32 + nl.y * 0.68;
  const rawX = mx + rx * side - fx * 0.25;
  const rawZ = mz + rz * side - fz * 0.25;
  const slid = slideOutOfPillars(rawX, rawZ, pillars, arena);
  const camX = slid.camX, camZ = slid.camZ, camY = 2.72;
  return {
    camX, camY, camZ,
    lookX: mx, lookY: 1.52, lookZ: mz,
    fov,
    orbit: wrapPi(Math.atan2(term.y - camZ, term.x - camX) - term.facing),
    back: Math.hypot(camX - term.x, camZ - term.y),
  };
}

function scoreClawPose(
  term: CombatTerm, nl: CombatNl, pose: CombatPose, aspect: number, prev?: CombatPose | null,
): number {
  const tN = projectWorld(term.x, 1.4, term.y, pose, aspect);
  const dCam = prev ? poseDelta(prev, pose).cam : 0;
  let s = 0;
  if (inFrustum(tN, 0.82)) s += 20;
  if (tN.x < 0) s += 18; else s -= 6;
  if (nlVisibleInFrame(nl, term, pose, aspect)) s += 80;
  s -= dCam * 28;
  return s;
}

/** Two-shot du couple T+NL : caméra à côté de l’axe, T à gauche, NL à droite. */
export function clawTwoShot(
  term: CombatTerm,
  nl: CombatNl,
  aspect: number,
  pillars: Box[],
  arena: { w: number; h: number },
  fov: number,
  prev?: CombatPose | null,
  sign?: number,
): CombatPose {
  if (sign === 1 || sign === -1) return pairClawPose(term, nl, sign, fov, pillars, arena, aspect);
  const plus = pairClawPose(term, nl, 1, fov, pillars, arena, aspect);
  const minus = pairClawPose(term, nl, -1, fov, pillars, arena, aspect);
  const pick = scoreClawPose(term, nl, plus, aspect, prev)
    >= scoreClawPose(term, nl, minus, aspect, prev) ? 1 : -1;
  return pick > 0 ? plus : minus;
}

export function beginClawHold(
  pose: CombatPose,
  term: CombatTerm,
  nl: CombatNl | null,
  who: number,
  until: number,
  aspect: number,
  pillars: Box[],
  arena: { w: number; h: number },
  now = 0,
): ShoulderClawHold {
  let orbitSign = pose.orbit >= 0 ? 1 : -1;
  if (nl) {
    const plus = pairClawPose(term, nl, 1, pose.fov, pillars, arena, aspect);
    const minus = pairClawPose(term, nl, -1, pose.fov, pillars, arena, aspect);
    orbitSign = scoreClawPose(term, nl, plus, aspect, pose) >= scoreClawPose(term, nl, minus, aspect, pose) ? 1 : -1;
  }
  return {
    who, until, orbitSign, fov: pose.fov, startedAt: now,
    termX: term.x, termY: term.y,
    camX: pose.camX, camY: pose.camY, camZ: pose.camZ,
    lookX: pose.lookX, lookY: pose.lookY, lookZ: pose.lookZ,
  };
}

export function applyClawHold(
  hold: ShoulderClawHold,
  term: CombatTerm,
  nl?: CombatNl | null,
  aspect = 16 / 9,
  pillars: Box[] = [],
  arena: { w: number; h: number } = { w: 40, h: 24 },
): CombatPose {
  if (!nl?.alive) return followLockedClawHold(hold, term);
  return pairClawPose(term, nl, hold.orbitSign, hold.fov, pillars, arena, aspect, CLAW_HOLD_PAIR_SIDE);
}

/** Ancien suivi rigide T : coupe / masque le NL à l’impact — gardé pour le test de non-régression. */
export function followLockedClawHold(
  lock: { termX: number; termY: number; camX: number; camY: number; camZ: number; lookX: number; lookY: number; lookZ: number; fov: number },
  term: CombatTerm,
): CombatPose {
  const dx = term.x - lock.termX;
  const dz = term.y - lock.termY;
  const camX = lock.camX + dx;
  const camZ = lock.camZ + dz;
  return {
    camX, camY: lock.camY, camZ,
    lookX: lock.lookX + dx, lookY: lock.lookY, lookZ: lock.lookZ + dz,
    fov: lock.fov,
    orbit: wrapPi(Math.atan2(term.y - camZ, term.x - camX) - term.facing),
    back: Math.hypot(camX - term.x, camZ - term.y),
  };
}

/** Même pose que l’enregistrement : hold griffe ou desiredCombatPose, sans coupe. */
export function stepShoulderCam(input: {
  prev: CombatPose | null;
  prevTerm?: CombatTerm | null;
  hold: ShoulderClawHold | null;
  term: CombatTerm;
  nls: CombatNl[];
  aspect: number;
  portrait: boolean;
  pillars: Box[];
  arena: { w: number; h: number };
  now: number;
  clawWho?: number | null;
}): { pose: CombatPose; hold: ShoulderClawHold | null } {
  let hold = input.hold;
  if (hold && input.now > hold.until) hold = null;
  const who = pickClawWho(input.term, input.nls, input.clawWho);
  if (who != null && input.prev) {
    const n = input.nls[who];
    const wind = n ? ((n.armTicks ?? 0) * 0.1) : 0;
    const until = input.now + CLAW_INTENT_HOLD_S + wind + CLAW_HOLD_AFTER_S;
    if (!hold) {
      hold = beginClawHold(
        input.prev, input.prevTerm ?? input.term, n ?? null, who, until,
        input.aspect, input.pillars, input.arena, input.now,
      );
    } else {
      hold = { ...hold, who, until: Math.max(hold.until, until) };
    }
  }
  const heldNl = hold ? input.nls[hold.who] ?? null : null;
  const want = hold?.frozen
    ? (() => {
      const base = followLockedClawHold(hold, input.term);
      if (!heldNl?.alive) return base;
      return {
        ...base,
        lookX: input.term.x * 0.32 + heldNl.x * 0.68,
        lookY: 1.52,
        lookZ: input.term.y * 0.32 + heldNl.y * 0.68,
      };
    })()
    : hold
      ? applyClawHold(hold, input.term, heldNl, input.aspect, input.pillars, input.arena)
      : desiredCombatPose({
        term: input.term, nls: input.nls, aspect: input.aspect, portrait: input.portrait,
        pillars: input.pillars, arena: input.arena,
      });
  let pose = want;
  if (input.prev) {
    pose = hold
      ? clampPoseStep(input.prev, want, CLAW_MAX_CAM_STEP_M, CLAW_MAX_LOOK_STEP_M, CLAW_MAX_ORBIT_STEP_RAD)
      : clampPoseStep(input.prev, smoothCombatPose(input.prev, want, 0.1), STEP_MAX_CAM_M, STEP_MAX_LOOK_M, STEP_MAX_ORBIT_RAD);
  }
  if (!hold) {
    pose = keepTermFramed(pose, input.term, input.aspect, {
      nls: input.nls, pillars: input.pillars, arena: input.arena, skipRebuild: true,
    });
    if (input.prev) {
      pose = clampPoseStep(input.prev, pose, STEP_MAX_CAM_M, STEP_MAX_LOOK_M, STEP_MAX_ORBIT_RAD);
    }
  } else if (!hold.frozen) {
    const tNdc = projectWorld(input.term.x, 1.4, input.term.y, pose, input.aspect);
    if (!inFrustum(tNdc, 0.82)) pose = clampLookToTerm(pose, input.term, input.aspect);
    if (input.prev) {
      pose = clampPoseStep(input.prev, pose, CLAW_MAX_CAM_STEP_M, CLAW_MAX_LOOK_STEP_M, CLAW_MAX_ORBIT_STEP_RAD);
    }
    if (
      heldNl?.alive
      && input.now - hold.startedAt >= 0.48
      && nlVisibleInFrame(heldNl, input.term, pose, input.aspect)
    ) {
      hold = {
        ...hold,
        frozen: true,
        termX: input.term.x, termY: input.term.y,
        camX: pose.camX, camY: pose.camY, camZ: pose.camZ,
        lookX: pose.lookX, lookY: pose.lookY, lookZ: pose.lookZ,
        fov: pose.fov,
      };
    }
  }
  return { pose, hold };
}

export function termHeadShoulderInFrame(
  term: CombatTerm,
  pose: CombatPose,
  aspect: number,
): { head: boolean; shoulder: boolean } {
  const fx = Math.cos(term.facing), fz = Math.sin(term.facing);
  const rx = -fz, rz = fx;
  const head = projectWorld(term.x, 2.22, term.y, pose, aspect);
  const shoulder = projectWorld(term.x + rx * 0.48, 1.88, term.y + rz * 0.48, pose, aspect);
  return { head: inFrustum(head, 0.98), shoulder: inFrustum(shoulder, 0.98) };
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

/** Bbox monde → NDC du *vrai* frustum caméra (après `applyCombatCamera`). */
export function worldBoxOnScreen(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
  camera: THREE.Camera,
): ScreenAabb | null {
  camera.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let minNx = Infinity, maxNx = -Infinity, minNy = Infinity, maxNy = -Infinity;
  let samples = 0, onScreen = 0;
  for (const x of [minX, maxX]) {
    for (const y of [minY, (minY + maxY) * 0.5, maxY]) {
      for (const z of [minZ, maxZ]) {
        v.set(x, y, z).project(camera);
        if (v.z < -1 || v.z > 1) continue;
        samples++;
        minNx = Math.min(minNx, v.x);
        maxNx = Math.max(maxNx, v.x);
        minNy = Math.min(minNy, v.y);
        maxNy = Math.max(maxNy, v.y);
        if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) onScreen++;
      }
    }
  }
  if (samples < 2) return null;
  return { minX: minNx, maxX: maxNx, minY: minNy, maxY: maxNy, samples, onScreen };
}

export function ndcInFrame(x: number, y: number, z: number, margin = 0.98): boolean {
  return Math.abs(x) <= margin && Math.abs(y) <= margin && z >= -1 && z <= 1;
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
