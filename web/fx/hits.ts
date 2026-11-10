// Intersection 2D rayon / piliers : un tir qui rate un NL peut quand même peindre un mur.
// Présentation seulement — la sim garde sa propre LOS.

export interface Aabb {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ClipHit {
  x: number;
  y: number;
  t: number;
  hit: boolean;
  nx: number;
  ny: number;
}

function slab(ox: number, oy: number, dx: number, dy: number, b: Aabb): { t: number; nx: number; ny: number } | null {
  const inf = 1e12;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;
  const slabs: [number, number, number, number][] = [
    [dx, b.x0 - ox, b.x1 - ox, 1],
    [dy, b.y0 - oy, b.y1 - oy, 2],
  ];
  for (const [d, t1raw, t2raw, axis] of slabs) {
    if (Math.abs(d) < 1e-9) {
      if (Math.min(t1raw, t2raw) > 0 || Math.max(t1raw, t2raw) < 0) return null;
      continue;
    }
    let t1 = t1raw / d;
    let t2 = t2raw / d;
    let n = axis === 1 ? -Math.sign(d) : 0;
    let m = axis === 2 ? -Math.sign(d) : 0;
    if (t1 > t2) {
      const sw = t1; t1 = t2; t2 = sw;
      n = -n; m = -m;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = axis === 1 ? n : 0;
      ny = axis === 2 ? m : 0;
    }
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  if (tmin <= 0 || tmin > 1 || tmin > inf) return null;
  return { t: tmin, nx, ny };
}

export function clipRayToAabbs(x: number, y: number, tx: number, ty: number, boxes: readonly Aabb[]): ClipHit {
  const dx = tx - x;
  const dy = ty - y;
  let best: ClipHit = { x: tx, y: ty, t: 1, hit: false, nx: 0, ny: 0 };
  for (const b of boxes) {
    const h = slab(x, y, dx, dy, b);
    if (!h) continue;
    if (h.t < best.t) {
      best = { x: x + dx * h.t, y: y + dy * h.t, t: h.t, hit: true, nx: h.nx, ny: h.ny };
    }
  }
  return best;
}
