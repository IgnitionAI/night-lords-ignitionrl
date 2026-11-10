// Caméra de combat : ancrée sur le Terminator (toujours dans le cadre), NL proche en two-shot court.
// Rien ici ne touche la simulation (pas de step, pas de NL_CFG / T_CFG).
import * as THREE from 'three';
import type { Box } from '../src/sim';

export const FOG_CLEAR_M = 22;
export const TERM_MODEL_H = 2.6;
export const PILLAR_TOP = 4.3;

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

function pullForLos(
  camX: number, camY: number, camZ: number,
  tx: number, ty: number, tz: number,
  pillars: Box[],
): { camX: number; camY: number; camZ: number } {
  if (losClear(camX, camY, camZ, tx, ty, tz, pillars)) {
    return { camX, camY, camZ };
  }
  const raisedY = COMBAT_CAM.highMax;
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

  const orbits = includeNl
    ? [orbitWant, orbitWant * 0.55, 0]
    : [0, 0.5, -0.5];
  const fogBack = includeNl ? clamp(FOG_CLEAR_M - span - 1.4, 3.7, COMBAT_CAM.maxBack) : COMBAT_CAM.maxBack;
  const backs = includeNl
    ? [clamp(fogBack * 0.82, 3.7, fogBack), fogBack]
    : [5.2, 6.4, 7.4];
  const sides = [1.12, -1.12];
  const heights = [COMBAT_CAM.height, COMBAT_CAM.highMax];
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
    const mixes = includeNl && nl ? [0.10, 0.20] : [0];
    for (const lookMix of mixes) {
      const lookX = includeNl && nl ? term.x + (nl.x - term.x) * lookMix : term.x + fx * 3.5;
      const lookZ = includeNl && nl ? term.y + (nl.y - term.y) * lookMix : term.y + fz * 3.5;
      for (const side of sides) {
        for (const back of backs) {
          for (const h of heights) {
            for (const fovTry of fovs) {
              const rawX = term.x - fx * back + rx * side;
              const rawZ = term.y - fz * back + rz * side;
              const cleared = avoidWalls(rawX, rawZ, h, pillars, arena);
              const pulled = pullForLos(cleared.camX, cleared.camY, cleared.camZ, term.x, 1.4, term.y, pillars);
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
