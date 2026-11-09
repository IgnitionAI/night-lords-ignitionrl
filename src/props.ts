// Props de décor (#45) : poses partagées avec le rendu, volumes de collision (#46).
// AABB mesurées sur les GLB *simplifiés* de `web/models/props/` (POSITION min/max, puis k+lift
// identiques à `web/main.ts`). Le prisme de jeu est un cœur plus petit que cette AABB — pas la
// boîte englobante des bruts Genex 14–16 Mo.

export const PROP_KINDS = ['debris', 'crate', 'pipes', 'chains', 'reliquary', 'servitor'] as const;
export type PropKind = (typeof PROP_KINDS)[number];

export function isPropKind(s: string): s is PropKind {
  return (PROP_KINDS as readonly string[]).includes(s);
}

export interface PropPlace {
  kind: PropKind;
  x: number;
  z: number;
  rot: number;
  y?: number;
  ceil?: boolean;
  scale?: number;
}

// Copie fidèle des 22 poses de `web/main.ts` (#45). `z` est l'axe Y de la simulation.
export const PROP_PLACES: readonly PropPlace[] = [
  { kind: 'reliquary', x: 8.9, z: 6.0, rot: -Math.PI / 2 },
  { kind: 'reliquary', x: 23.6, z: 5.0, rot: -Math.PI / 2 },
  { kind: 'reliquary', x: 30.6, z: 14.5, rot: -Math.PI / 2 },
  { kind: 'pipes', x: 13.0, z: 1.0, rot: 0 },
  { kind: 'pipes', x: 20.5, z: 23.0, rot: Math.PI },
  { kind: 'pipes', x: 1.0, z: 17.0, rot: Math.PI / 2 },
  { kind: 'chains', x: 10.0, z: 6.0, y: 5.38, rot: 0, ceil: true },
  { kind: 'chains', x: 18.0, z: 17.0, y: 5.38, rot: 0.7, ceil: true },
  { kind: 'chains', x: 26.0, z: 9.0, y: 5.38, rot: 1.9, ceil: true },
  { kind: 'chains', x: 34.0, z: 14.0, y: 5.38, rot: 0.3, ceil: true },
  { kind: 'crate', x: 10.9, z: 3.3, rot: 0.35 },
  { kind: 'crate', x: 11.45, z: 3.85, rot: 1.15, scale: 0.9 },
  { kind: 'crate', x: 10.4, z: 2.75, rot: 2.6, scale: 1.05 },
  { kind: 'crate', x: 23.2, z: 2.6, rot: 2.2 },
  { kind: 'crate', x: 23.9, z: 3.4, rot: 0.8, scale: 0.85 },
  { kind: 'crate', x: 30.5, z: 12.8, rot: 0.15 },
  { kind: 'debris', x: 8.4, z: 8.6, rot: 0.9 },
  { kind: 'debris', x: 23.3, z: 7.4, rot: 1.3 },
  { kind: 'debris', x: 15.5, z: 22.4, rot: 2.4 },
  { kind: 'debris', x: 5.0, z: 1.6, rot: 0.2 },
  { kind: 'servitor', x: 30.7, z: 16.1, rot: 0.4 },
  { kind: 'servitor', x: 1.3, z: 12.0, rot: 0.9 },
];

export const CORRIDOR_DEBRIS_INDEX = 16;
export const ANGLED_CRATE_INDEX = 11;

/** Taille visée sur l'axe de calibration du rendu (`web/main.ts` / PROPS.md). */
export const PROP_VISUAL_SIZE: Record<PropKind, number> = {
  debris: 1.8,
  crate: 1.15,
  pipes: 2.4,
  chains: 2.6,
  reliquary: 2.4,
  servitor: 1.5,
};

/** Demi-AABB XZ et hauteur, après k+lift du chargeur, avant rotation d'instance. */
export const PROP_MESH_AABB: Record<PropKind, { hx: number; hz: number; height: number; ox: number; oz: number }> = {
  debris: { hx: 0.830104, hz: 0.900000, height: 0.846527, ox: -0.004741, oz: 0.008603 },
  crate: { hx: 0.436596, hz: 0.575000, height: 0.552527, ox: -0.001146, oz: -0.000344 },
  pipes: { hx: 0.584794, hz: 0.917133, height: 2.400000, ox: -0.001654, oz: -0.005499 },
  chains: { hx: 0.230680, hz: 1.300000, height: 2.248660, ox: 0.001129, oz: -0.004240 },
  reliquary: { hx: 0.385559, hz: 0.570021, height: 2.400000, ox: -0.000964, oz: 0.000673 },
  servitor: { hx: 0.447369, hz: 0.750000, height: 1.105838, ox: -0.006901, oz: -0.000966 },
};

/** Fraction de l'AABB simplifiée gardée comme cœur solide (la caisse, presque un pavé, reste plus proche). */
export function coreFrac(kind: PropKind): number {
  switch (kind) {
    case 'crate': return 0.92;
    case 'reliquary': return 0.85;
    case 'pipes': return 0.80;
    case 'debris': return 0.82;
    case 'servitor': return 0.82;
    case 'chains': return 0;
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

/** Demi-étendues du cœur 2D (x = largeur locale, y = profondeur / Z Three). Chaînes : pas au sol. */
export function propCore(kind: PropKind): { hx: number; hy: number; height: number } | null {
  const f = coreFrac(kind);
  if (f === 0) return null;
  const m = PROP_MESH_AABB[kind];
  return { hx: m.hx * f, hy: m.hz * f, height: m.height };
}

export interface PropPrism {
  index: number;
  kind: PropKind;
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  rot: number;
  cos: number;
  sin: number;
  floor: boolean;
  height: number;
  y0: number;
  y1: number;
}

export function resolvePropKinds(opts: { propsOn: boolean; loaded: readonly string[] }): PropKind[] {
  if (!opts.propsOn) return [];
  const out: PropKind[] = [];
  for (const k of opts.loaded) if (isPropKind(k) && !out.includes(k)) out.push(k);
  return out;
}

export function propPrisms(kinds: readonly string[] | 'all' = 'all'): PropPrism[] {
  const allow = kinds === 'all' ? null : new Set(kinds.filter(isPropKind));
  return PROP_PLACES.map((p, index) => {
    const core = propCore(p.kind);
    const mesh = PROP_MESH_AABB[p.kind];
    const s = p.scale ?? 1;
    const floor = !!core && (allow ? allow.has(p.kind) : true);
    const hx = (core?.hx ?? 0) * s, hy = (core?.hy ?? 0) * s;
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    const ox = mesh.ox * s, oz = mesh.oz * s;
    const cx = p.x + ox * cos + oz * sin;
    const cy = p.z - ox * sin + oz * cos;
    const height = mesh.height * s;
    const y1 = p.ceil ? (p.y ?? 5.38) : height;
    const y0 = p.ceil ? y1 - height : 0;
    return { index, kind: p.kind, cx, cy, hx, hy, rot: p.rot, cos, sin, floor, height, y0, y1 };
  });
}

export function activeFloorPrisms(kinds: readonly string[] | 'all' = 'all'): PropPrism[] {
  return propPrisms(kinds).filter(p => p.floor);
}

/** Local ← monde, même convention que `THREE.Matrix4.makeRotationY`. */
export function toLocal(x: number, y: number, o: PropPrism): [number, number] {
  const dx = x - o.cx, dy = y - o.cy;
  return [dx * o.cos - dy * o.sin, dx * o.sin + dy * o.cos];
}
export function fromLocal(lx: number, ly: number, o: PropPrism): [number, number] {
  return [o.cx + lx * o.cos + ly * o.sin, o.cy - lx * o.sin + ly * o.cos];
}

export function distPointPrism(x: number, y: number, o: PropPrism): number {
  if (!o.floor || o.hx <= 0 || o.hy <= 0) return Infinity;
  const [lx, ly] = toLocal(x, y, o);
  const qx = Math.min(o.hx, Math.max(-o.hx, lx));
  const qy = Math.min(o.hy, Math.max(-o.hy, ly));
  return Math.hypot(lx - qx, ly - qy);
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { d: Math.hypot(ax + dx * t - px, ay + dy * t - py), t };
}

function distSegSeg(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { d: number; t: number } {
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy;
  const D = a * c - b * b, EPS = 1e-14;
  let sN: number, sD = D, tN: number, tD = D;
  if (D < EPS) { sN = 0; sD = 1; tN = e; tD = c; }
  else {
    sN = b * e - c * d; tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0; else if (-d > a) sN = sD = a; else { sN = -d; sD = a; }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0; else if (-d + b > a) sN = sD = a; else { sN = -d + b; sD = a; }
  }
  const sc = Math.abs(sD) < EPS ? 0 : sN / sD;
  const tc = Math.abs(tD) < EPS ? 0 : tN / tD;
  return { d: Math.hypot(wx + sc * ux - tc * vx, wy + sc * uy - tc * vy), t: sc };
}

function segHitsLocalBox(ax: number, ay: number, bx: number, by: number, hx: number, hy: number): boolean {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  const planes: [number, number][] = [[-dx, ax + hx], [dx, hx - ax], [-dy, ay + hy], [dy, hy - ay]];
  for (const [p, q] of planes) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** Distance du segment [A,B] au prisme (0 si le segment perce le rectangle). `t` ≈ paramètre du point le plus proche. */
export function distSegPrism(ax: number, ay: number, bx: number, by: number, o: PropPrism): { d: number; t: number } {
  if (!o.floor || o.hx <= 0 || o.hy <= 0) return { d: Infinity, t: 0 };
  const [lax, lay] = toLocal(ax, ay, o), [lbx, lby] = toLocal(bx, by, o);
  if (segHitsLocalBox(lax, lay, lbx, lby, o.hx, o.hy)) {
    let lo = 0, hi = 1;
    if (Math.max(Math.abs(lax) - o.hx, Math.abs(lay) - o.hy) <= 0) return { d: 0, t: 0 };
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2, x = lax + (lbx - lax) * mid, y = lay + (lby - lay) * mid;
      if (Math.max(Math.abs(x) - o.hx, Math.abs(y) - o.hy) <= 0) hi = mid; else lo = mid;
    }
    return { d: 0, t: lo };
  }
  let best = { d: Infinity, t: 0 };
  const consider = (d: number, t: number) => { if (d < best.d) best = { d, t }; };
  const da = distPointPrism(ax, ay, o); consider(da, 0);
  const db = distPointPrism(bx, by, o); consider(db, 1);
  const x0 = -o.hx, y0 = -o.hy, x1 = o.hx, y1 = o.hy;
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (const [px, py] of corners) consider(distPointSeg(px, py, lax, lay, lbx, lby).d, distPointSeg(px, py, lax, lay, lbx, lby).t);
  const edges: [number, number, number, number][] = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
  for (const [ex0, ey0, ex1, ey1] of edges) consider(distSegSeg(lax, lay, lbx, lby, ex0, ey0, ex1, ey1).d, distSegSeg(lax, lay, lbx, lby, ex0, ey0, ex1, ey1).t);
  return best;
}

export function firstHitT(ax: number, ay: number, bx: number, by: number, r: number, o: PropPrism): number {
  if (!o.floor) return Infinity;
  if (distPointPrism(ax, ay, o) < r) return 0;
  const seg = distSegPrism(ax, ay, bx, by, o);
  if (seg.d >= r - 1e-12) return Infinity;
  let tIn = Math.max(0, Math.min(1, seg.t));
  if (distPointPrism(ax + (bx - ax) * tIn, ay + (by - ay) * tIn, o) >= r) {
    tIn = 1;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      if (distPointPrism(ax + (bx - ax) * t, ay + (by - ay) * t, o) < r) { tIn = t; break; }
    }
    if (distPointPrism(ax + (bx - ax) * tIn, ay + (by - ay) * tIn, o) >= r) return Infinity;
  }
  let lo = 0, hi = tIn;
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) / 2;
    if (distPointPrism(ax + (bx - ax) * mid, ay + (by - ay) * mid, o) < r) hi = mid; else lo = mid;
  }
  return lo;
}

export function collidePrisms(p: { x: number; y: number }, r: number, solids: readonly PropPrism[]) {
  for (let pass = 0; pass < 3; pass++) {
    for (const o of solids) {
      if (!o.floor) continue;
      const [lx, ly] = toLocal(p.x, p.y, o);
      const cx = Math.min(o.hx, Math.max(-o.hx, lx));
      const cy = Math.min(o.hy, Math.max(-o.hy, ly));
      const dx = lx - cx, dy = ly - cy, d = Math.hypot(dx, dy);
      if (d > 0 && d < r) {
        const [wx, wy] = fromLocal(cx + dx / d * r, cy + dy / d * r, o);
        p.x = wx; p.y = wy;
      } else if (d === 0) {
        const pen = [lx + o.hx + r, o.hx - lx + r, ly + o.hy + r, o.hy - ly + r];
        const i = pen.indexOf(Math.min(...pen));
        let nlx = lx, nly = ly;
        if (i === 0) nlx = -o.hx - r; else if (i === 1) nlx = o.hx + r; else if (i === 2) nly = -o.hy - r; else nly = o.hy + r;
        const [wx, wy] = fromLocal(nlx, nly, o);
        p.x = wx; p.y = wy;
      }
    }
  }
}

/** Pousse le disque hors des prismes, et refuse un accord interpolé qui percera un volume orienté. */
export function resolvePrisms(from: { x: number; y: number }, p: { x: number; y: number }, r: number, solids: readonly PropPrism[]) {
  collidePrisms(p, r, solids);
  let tHit = 1, hit: PropPrism | null = null;
  for (const o of solids) {
    const t = firstHitT(from.x, from.y, p.x, p.y, r, o);
    if (t < tHit) { tHit = t; hit = o; }
  }
  if (hit && tHit < 1) {
    const t = Math.max(0, tHit);
    p.x = from.x + (p.x - from.x) * t;
    p.y = from.y + (p.y - from.y) * t;
    collidePrisms(p, r, solids);
  }
}

/** Accord qui perce un prisme orienté avec extrémités libres — le trou R46-02. */
export function findGrazingChord(o: PropPrism, r: number, len: number): { ax: number; ay: number; bx: number; by: number; d: number } | null {
  const corners: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sy] of corners) {
    const [ax0, ay0] = fromLocal(sx * (o.hx + r + 0.08), sy * (o.hy - 0.12), o);
    const [bx0, by0] = fromLocal(sx * (o.hx - 0.12), sy * (o.hy + r + 0.08), o);
    const seg0 = distSegPrism(ax0, ay0, bx0, by0, o);
    if (distPointPrism(ax0, ay0, o) < r || distPointPrism(bx0, by0, o) < r || seg0.d >= r) continue;
    const L = Math.hypot(bx0 - ax0, by0 - ay0) || 1;
    const nx = (bx0 - ax0) / L, ny = (by0 - ay0) / L;
    const mx = ax0 + (bx0 - ax0) * seg0.t, my = ay0 + (by0 - ay0) * seg0.t;
    const ax = mx - nx * len / 2, ay = my - ny * len / 2;
    const bx = mx + nx * len / 2, by = my + ny * len / 2;
    const seg = distSegPrism(ax, ay, bx, by, o);
    if (distPointPrism(ax, ay, o) >= r && distPointPrism(bx, by, o) >= r && seg.d < r) {
      return { ax, ay, bx, by, d: seg.d };
    }
    return { ax: ax0, ay: ay0, bx: bx0, by: by0, d: seg0.d };
  }
  return null;
}
