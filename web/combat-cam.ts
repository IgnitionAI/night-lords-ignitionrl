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

export const COMBAT_CAM = {
  fov: 56,
  fovPortrait: 68,
  fovMax: 72,
  minBack: 5.0,
  maxBack: 9.4,
  height: 2.82,
  highMax: 5.55,
  eye: 1.38,
  orbitMax: 1.18,
  posLerp: 0.18,
  lookLerp: 0.20,
  side: 1.28,
  along: 0.36,
  lookMix: 0.28,
  nlIncludeM: 30,
  termMargin: 0.78,
  termMinScreen: 0.08,
};

export type CombatNl = { x: number; y: number; alive: boolean; armTicks?: number };
export type CombatTerm = { x: number; y: number; facing: number };
export type CombatPose = {
  camX: number; camY: number; camZ: number;
  lookX: number; lookY: number; lookZ: number;
  fov: number; orbit: number; back: number;
};
export type Ndc = { x: number; y: number; z: number };

export type CamMode = 'combat' | 'couloir' | 'epaule' | 'troisquarts';

export function parseCamMode(raw: string | null): CamMode {
  if (raw === 'couloir') return 'couloir';
  if (raw === 'troisquarts') return 'troisquarts';
  if (raw === 'epaule') return 'epaule';
  return 'combat';
}

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

export function desiredCombatPose(input: {
  term: CombatTerm;
  nls: CombatNl[];
  aspect: number;
  portrait: boolean;
  pillars: Box[];
  arena: { w: number; h: number };
}): CombatPose {
  const { term, nls, portrait, pillars, arena } = input;
  const fi = pickFocusNl(term, nls);
  const nl = fi === null ? null : nls[fi]!;
  const span = nl ? Math.hypot(nl.x - term.x, nl.y - term.y) : 8;
  const includeNl = !!nl && span <= COMBAT_CAM.nlIncludeM + 1e-6;
  const fov0 = portrait ? COMBAT_CAM.fovPortrait : COMBAT_CAM.fov;
  let orbitWant = 0;
  if (includeNl && nl) {
    const toNl = Math.atan2(nl.y - term.y, nl.x - term.x);
    orbitWant = clamp(wrapPi(toNl - term.facing), -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax);
  }

  const melee = includeNl && span <= 3.2;
  if (melee && nl) {
    const midX = (term.x + nl.x) * 0.5, midZ = (term.y + nl.y) * 0.5;
    const hullNear = Math.min(
      distToPillars(term.x, term.y, pillars),
      distToPillars(nl.x, nl.y, pillars),
      distToPillars(midX, midZ, pillars),
    ) < 1.85;
    const lookX = hullNear ? term.x * 0.52 + nl.x * 0.48 : term.x * 0.82 + nl.x * 0.18;
    const lookZ = hullNear ? term.y * 0.52 + nl.y * 0.48 : term.y * 0.82 + nl.y * 0.18;
    const lookY = hullNear ? 1.22 : COMBAT_CAM.eye;
    const toNlX = nl.x - term.x, toNlZ = nl.y - term.y;
    const toLen = Math.hypot(toNlX, toNlZ) || 1;
    const ux = toNlX / toLen, uz = toNlZ / toLen;
    const px = -uz, pz = ux;
    const heights = hullNear ? [3.34, 3.58, 4.12, MELEE_LIFT] : [COMBAT_CAM.height, 3.6, MELEE_LIFT];
    const radii = hullNear ? [3.45, 4.25, 5.1, 5.9] : [2.9, 3.5, 4.2];
    const fovs = hullNear ? [58, 64, 70] : [58, 64, 70];
    let pick: CombatPose | null = null;
    let pickS = -1e9;
    for (const h of heights) {
      for (const r of radii) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const ox = Math.cos(a) * r;
          const oz = Math.sin(a) * r;
          const rawX = clamp(term.x + ox, 0.6, arena.w - 0.6);
          const rawZ = clamp(term.y + oz, 0.6, arena.h - 0.6);
          if (inPillar(rawX, rawZ, pillars)) continue;
          const parked = avoidWalls(rawX, rawZ, h, pillars, arena);
          if (inPillar(parked.camX, parked.camZ, pillars)) continue;
          const camY = parked.camY > COMBAT_CAM.highMax - 0.05 ? MELEE_LIFT : parked.camY;
          const overShaft = camY >= PILLAR_TOP + 0.2;
          if (!overShaft && segNearPillar(parked.camX, parked.camZ, term.x, term.y, pillars, 0.45)) continue;
          if (!overShaft && segNearPillar(parked.camX, parked.camZ, nl.x, nl.y, pillars, 0.45)) continue;
          if (!losClear(parked.camX, camY, parked.camZ, term.x, 1.4, term.y, pillars, MELEE_LOS_PAD)) continue;
          if (!losClear(parked.camX, camY, parked.camZ, nl.x, 1.4, nl.y, pillars, MELEE_LOS_PAD)) continue;
          if (distToPillars(lookX, lookZ, pillars) < 0.85) continue;
          const cdx = lookX - parked.camX, cdz = lookZ - parked.camZ;
          const clen = Math.hypot(cdx, cdz) || 1;
          const alongPunch = (cdx / clen) * ux + (cdz / clen) * uz;
          if (hullNear && alongPunch > 0.72) continue;
          for (const fovTry of fovs) {
            const p: CombatPose = {
              camX: parked.camX, camY, camZ: parked.camZ,
              lookX, lookY, lookZ,
              fov: fovTry, orbit: 0,
              back: Math.hypot(parked.camX - term.x, parked.camZ - term.y),
            };
            const tNdc = projectWorld(term.x, 1.4, term.y, p, input.aspect);
            const nNdc = projectWorld(nl.x, 1.4, nl.y, p, input.aspect);
            if (!inFrustum(tNdc, 0.72) || !inFrustum(nNdc, 0.72)) continue;
            let s = 220;
            if (inFrustum(tNdc, COMBAT_CAM.termMargin)) s += 50;
            s += screenHeightFrac(term.x, term.y, p, input.aspect) * 40;
            s += screenHeightFrac(nl.x, nl.y, p, input.aspect) * 36;
            s -= Math.abs(camY - (hullNear ? 3.58 : COMBAT_CAM.height)) * 14;
            s -= Math.abs(tNdc.x) * 24;
            s -= Math.abs(nNdc.x) * 52;
            s += distToPillars(parked.camX, parked.camZ, pillars) * 8;
            s -= Math.abs(alongPunch) * (hullNear ? 28 : 12);
            if (s > pickS) { pickS = s; pick = p; }
          }
        }
      }
    }
    if (pick) return pick;
    const sideA = distToPillars(term.x + px * 4.2, term.y + pz * 4.2, pillars);
    const sideB = distToPillars(term.x - px * 4.2, term.y - pz * 4.2, pillars);
    const sign = sideA >= sideB ? 1 : -1;
    const camX = clamp(term.x + px * 4.2 * sign, 0.6, arena.w - 0.6);
    const camZ = clamp(term.y + pz * 4.2 * sign, 0.6, arena.h - 0.6);
    const parked = avoidWalls(camX, camZ, MELEE_LIFT, pillars, arena);
    return {
      camX: parked.camX, camY: MELEE_LIFT, camZ: parked.camZ,
      lookX: term.x, lookY: COMBAT_CAM.eye, lookZ: term.y,
      fov: 68, orbit: 0,
      back: Math.hypot(parked.camX - term.x, parked.camZ - term.y),
    };
  }
  const orbits = melee
    ? [orbitWant, clamp(orbitWant + 0.85, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax), clamp(orbitWant - 0.85, -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax), 0]
    : includeNl
      ? [orbitWant, orbitWant * 0.55, 0]
      : [0, 0.5, -0.5];
  const fogBack = includeNl ? clamp(FOG_CLEAR_M - span - 1.4, 3.7, COMBAT_CAM.maxBack) : COMBAT_CAM.maxBack;
  const backs = melee
    ? [2.6, 3.2, 3.9]
    : includeNl
      ? [clamp(fogBack * 0.82, 3.7, fogBack), fogBack]
      : [5.2, 6.4, 7.4];
  const sides = melee ? [0.35, 1.55, -1.55, 2.35, -2.35] : [1.12, -1.12];
  const heights = melee ? [COMBAT_CAM.highMax] : [COMBAT_CAM.height, COMBAT_CAM.highMax];
  const fovs = includeNl ? [62, 68, COMBAT_CAM.fovMax] : [fov0];

  const scorePose = (p: CombatPose): number => {
    const tNdc = projectWorld(term.x, 1.4, term.y, p, input.aspect);
    const dT = worldDist(p.camX, p.camY, p.camZ, term.x, 1.4, term.y);
    const hT = screenHeightFrac(term.x, term.y, p, input.aspect);
    let s = 0;
    if (inFrustum(tNdc, COMBAT_CAM.termMargin)) s += 50;
    else if (inFrustum(tNdc, 0.92)) s += 4 - Math.abs(tNdc.x) * 20;
    else s -= 80;
    s -= Math.max(0, Math.abs(tNdc.x) - COMBAT_CAM.termMargin) * 90;
    if (hT >= COMBAT_CAM.termMinScreen) s += 25 + Math.min(18, (hT - COMBAT_CAM.termMinScreen) * 40);
    else s -= 50;
    if (dT <= FOG_CLEAR_M && dT > 0.9) s += 8; else s -= 20;
    if (losClear(p.camX, p.camY, p.camZ, term.x, 1.4, term.y, pillars)) s += 30;
    else s -= 60;
    if (includeNl && nl) {
      const nNdc = projectWorld(nl.x, 1.4, nl.y, p, input.aspect);
      const dN = worldDist(p.camX, p.camY, p.camZ, nl.x, 1.4, nl.y);
      if (inFrustum(nNdc, 0.92)) s += 22;
      else if (inFrustum(nNdc, 0.999)) s += 8;
      else s -= 40;
      if (dN <= FOG_CLEAR_M && dN > 0.7) s += 16; else s -= 35;
      if (losClear(p.camX, p.camY, p.camZ, nl.x, 1.4, nl.y, pillars)) s += 6;
    }
    return s;
  };

  let best: CombatPose | null = null;
  let bestS = -1e9;
  for (const orb of orbits) {
    const yaw = term.facing + orb;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const rx = -fz, rz = fx;
    const mixes = includeNl && nl ? (melee ? [0.18, 0.38] : [0.10, 0.20]) : [0];
    for (const lookMix of mixes) {
      const lookX = includeNl && nl ? term.x + (nl.x - term.x) * lookMix : term.x + fx * 3.5;
      const lookZ = includeNl && nl ? term.y + (nl.y - term.y) * lookMix : term.y + fz * 3.5;
      for (const side of sides) {
        for (const back of backs) {
          for (const h of heights) {
            for (const fovTry of fovs) {
              const rawX = term.x - fx * back + rx * side;
              const rawZ = term.y - fz * back + rz * side;
              const near = Math.hypot(rawX - term.x, rawZ - term.y) <= 4.6;
              const cleared = (melee && near)
                ? { camX: clamp(rawX, 0.6, arena.w - 0.6), camZ: clamp(rawZ, 0.6, arena.h - 0.6), camY: h }
                : avoidWalls(rawX, rawZ, h, pillars, arena);
              const pulled = (melee && near)
                ? { camX: cleared.camX, camY: cleared.camY, camZ: cleared.camZ }
                : pullForLos(cleared.camX, cleared.camY, cleared.camZ, term.x, 1.4, term.y, pillars);
              const p: CombatPose = {
                camX: pulled.camX, camY: pulled.camY, camZ: pulled.camZ,
                lookX, lookY: COMBAT_CAM.eye, lookZ,
                fov: fovTry, orbit: orb,
                back: Math.hypot(pulled.camX - term.x, pulled.camZ - term.y),
              };
              const sc = scorePose(p);
              if (sc > bestS) { bestS = sc; best = p; }
            }
          }
        }
      }
    }
  }
  return best!;
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
