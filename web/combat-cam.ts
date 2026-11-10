// Caméra de combat : cadre le Terminator et le NL vivant le plus menaçant / le plus proche.
// Rien ici ne touche la simulation (pas de step, pas de NL_CFG / T_CFG).
import * as THREE from 'three';
import type { Box } from '../src/sim';

export const FOG_CLEAR_M = 22;

export const COMBAT_CAM = {
  fov: 58,
  fovPortrait: 68,
  fovMax: 82,
  minBack: 7.2,
  maxBack: 16.5,
  height: 3.55,
  highMax: 5.6,
  eye: 1.38,
  orbitMax: 2.05,
  posLerp: 0.18,
  lookLerp: 0.20,
  side: 4.6,
  along: 0.36,
  lookMix: 0.58,
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

function sideSign(term: CombatTerm, alongX: number, alongZ: number, arena: { w: number; h: number }): number {
  const sx = -alongZ, sz = alongX;
  const probe = 6;
  const a = term.x + sx * probe, b = term.y + sz * probe;
  const c = term.x - sx * probe, d = term.y - sz * probe;
  const inA = a > 1 && a < arena.w - 1 && b > 1 && b < arena.h - 1;
  const inC = c > 1 && c < arena.w - 1 && d > 1 && d < arena.h - 1;
  if (inA && !inC) return 1;
  if (inC && !inA) return -1;
  return 1;
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
  let alongX = Math.cos(term.facing), alongZ = Math.sin(term.facing);
  if (nl && span > 0.15) {
    alongX = (nl.x - term.x) / span;
    alongZ = (nl.y - term.y) / span;
  }
  const sgn = sideSign(term, alongX, alongZ, arena);
  const sideX = -alongZ * sgn, sideZ = alongX * sgn;
  const lookMix = nl ? 0.5 : 0.18;
  const lookX = term.x + alongX * (nl ? span * lookMix : 5.5);
  const lookZ = term.y + alongZ * (nl ? span * lookMix : 5.5);
  const lookY = COMBAT_CAM.eye;
  const pairYaw = Math.atan2(alongZ, alongX);
  const orbit = clamp(wrapPi(pairYaw - term.facing), -COMBAT_CAM.orbitMax, COMBAT_CAM.orbitMax);
  const fov0 = portrait ? COMBAT_CAM.fovPortrait : COMBAT_CAM.fov;

  const make = (alongT: number, lateral: number, height: number, fovTry: number): CombatPose => {
    const rawX = term.x + alongX * alongT + sideX * lateral;
    const rawZ = term.y + alongZ * alongT + sideZ * lateral;
    const cleared = avoidWalls(rawX, rawZ, height, pillars, arena);
    return {
      camX: cleared.camX, camY: cleared.camY, camZ: cleared.camZ,
      lookX, lookY, lookZ, fov: fovTry, orbit,
      back: Math.hypot(cleared.camX - lookX, cleared.camZ - lookZ),
    };
  };

  const scorePose = (p: CombatPose): number => {
    const tNdc = projectWorld(term.x, 1.4, term.y, p, input.aspect);
    const dT = worldDist(p.camX, p.camY, p.camZ, term.x, 1.4, term.y);
    let s = 0;
    if (inFrustum(tNdc, 0.84)) s += 5;
    else if (inFrustum(tNdc, 0.999)) s += 2;
    if (dT <= FOG_CLEAR_M && dT > 0.7) s += 6; else s -= 12;
    if (nl) {
      const nNdc = projectWorld(nl.x, 1.4, nl.y, p, input.aspect);
      const dN = worldDist(p.camX, p.camY, p.camZ, nl.x, 1.4, nl.y);
      if (inFrustum(nNdc, 0.84)) s += 5;
      else if (inFrustum(nNdc, 0.999)) s += 2;
      if (dN <= FOG_CLEAR_M && dN > 0.7) s += 8; else s -= 16;
    }
    return s;
  };

  const candidates: CombatPose[] = [];
  if (!nl) {
    candidates.push(make(-7.2, 1.1, COMBAT_CAM.height, fov0));
  } else {
    // Plan latéral (two-shot) : les deux sujets devant la caméra, profondeur = écartement.
    const midAlong = span * lookMix;
    for (const lat of [10, 12, 14, 16, 8.5, 7]) {
      for (const f of [COMBAT_CAM.fovMax, 76, 68, 64, fov0]) {
        candidates.push(make(midAlong, lat, COMBAT_CAM.height + 0.55, f));
      }
    }
    // Plan oblique : recul derrière le T, zoom pour un NL plus proche.
    for (const a of [-5.5, -4, -2.5, span * 0.08]) {
      for (const lat of [2.4, 3.6, 5]) {
        candidates.push(make(a, lat, COMBAT_CAM.height, fov0));
      }
    }
  }

  let best = candidates[0]!;
  let bestS = -1;
  for (const p of candidates) {
    const s = scorePose(p);
    if (s > bestS) { bestS = s; best = p; }
    if (s >= 17) return p;
  }
  return best;
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
