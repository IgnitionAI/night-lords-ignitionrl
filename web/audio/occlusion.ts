/** Occlusion 2D : un pilier entre l'écouteur et la source coupe les aigus (filtre). */

export interface Aabb {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function slab(ox: number, oy: number, dx: number, dy: number, b: Aabb): number | null {
  let tmin = 0;
  let tmax = 1;
  const axes: [number, number, number][] = [
    [dx, b.x0 - ox, b.x1 - ox],
    [dy, b.y0 - oy, b.y1 - oy],
  ];
  for (const [d, t1raw, t2raw] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (Math.min(t1raw, t2raw) > 0 || Math.max(t1raw, t2raw) < 0) return null;
      continue;
    }
    let t1 = t1raw / d;
    let t2 = t2raw / d;
    if (t1 > t2) {
      const sw = t1; t1 = t2; t2 = sw;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmax < tmin) return null;
  }
  if (tmin <= 0 || tmin > 1) return null;
  return tmin;
}

export function occluded(lx: number, lz: number, sx: number, sz: number, boxes: readonly Aabb[]): boolean {
  const dx = sx - lx;
  const dz = sz - lz;
  for (const b of boxes) {
    if (slab(lx, lz, dx, dz, b) !== null) return true;
  }
  return false;
}
