// Chute de présentation : impulsion + rebond, clamp sol / murs / piliers.
// Ne déplace pas l'état de sim — seulement un offset visuel sur le groupe.

export interface Box2 { x0: number; y0: number; x1: number; y1: number }
export interface Arena2 { w: number; h: number }

export type FallKind = 'throw' | 'collapse' | 'dismember';

export interface FallBody {
  ox: number;
  oy: number;
  oz: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  radius: number;
}

export function impulseFall(kind: FallKind, facing: number, radius = 0.45): FallBody {
  const fx = Math.cos(facing);
  const fz = Math.sin(facing);
  switch (kind) {
    case 'throw':
      return {
        ox: 0, oy: 0.12, oz: 0,
        vx: -fx * 7.2, vy: 3.4, vz: -fz * 7.2,
        grounded: false, radius,
      };
    case 'dismember':
      return {
        ox: 0, oy: 0.08, oz: 0,
        vx: -fx * 3.4, vy: 2.2, vz: -fz * 3.4,
        grounded: false, radius,
      };
    case 'collapse':
      return {
        ox: 0, oy: 0.04, oz: 0,
        vx: -fx * 1.1, vy: 0.6, vz: -fz * 1.1,
        grounded: false, radius,
      };
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

function pushOut(x: number, z: number, r: number, box: Box2): { x: number; z: number } {
  if (x < box.x0 - r || x > box.x1 + r || z < box.y0 - r || z > box.y1 + r) return { x, z };
  const left = x - (box.x0 - r);
  const right = (box.x1 + r) - x;
  const down = z - (box.y0 - r);
  const up = (box.y1 + r) - z;
  const m = Math.min(left, right, down, up);
  if (m === left) return { x: box.x0 - r, z };
  if (m === right) return { x: box.x1 + r, z };
  if (m === down) return { x, z: box.y0 - r };
  return { x, z: box.y1 + r };
}

export function stepFall(
  b: FallBody,
  dt: number,
  origin: { x: number; z: number },
  arena: Arena2,
  walls: readonly Box2[],
  gravity = 18,
): FallBody {
  if (b.grounded && b.oy <= 0.002 && Math.abs(b.vy) < 0.05) {
    return { ...b, oy: 0, vy: 0, vx: b.vx * 0.5, vz: b.vz * 0.5 };
  }
  let vx = b.vx * Math.exp(-1.8 * dt);
  let vz = b.vz * Math.exp(-1.8 * dt);
  let vy = b.vy - gravity * dt;
  let ox = b.ox + vx * dt;
  let oz = b.oz + vz * dt;
  let oy = b.oy + vy * dt;
  let grounded = false;
  if (oy < 0) {
    oy = 0;
    if (vy < -1.2) vy = -vy * 0.28;
    else vy = 0;
    grounded = vy === 0;
    vx *= 0.55;
    vz *= 0.55;
  }
  let wx = origin.x + ox;
  let wz = origin.z + oz;
  const pad = b.radius + 0.02;
  wx = Math.max(pad, Math.min(arena.w - pad, wx));
  wz = Math.max(pad, Math.min(arena.h - pad, wz));
  for (const box of walls) {
    const p = pushOut(wx, wz, b.radius, box);
    if (p.x !== wx || p.z !== wz) {
      if (Math.abs(p.x - wx) > 1e-6) vx *= -0.15;
      if (Math.abs(p.z - wz) > 1e-6) vz *= -0.15;
      wx = p.x;
      wz = p.z;
    }
  }
  ox = wx - origin.x;
  oz = wz - origin.z;
  return { ox, oy, oz, vx, vy, vz, grounded, radius: b.radius };
}
