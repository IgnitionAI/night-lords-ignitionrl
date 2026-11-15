// Aides de lecture de la vue Diablo : anneau de bruit du Terminator et cônes de vision des Night Lords.
// Géométrie pure, en coordonnées sim (x, y = z monde). On lit l'état de la sim, on ne l'écrit jamais.

/** Rayon de l'anneau de bruit : le bruit courant `t.noise`, celui qui alerte la meute (`dist ≤ t.noise`). */
export function noiseRingRadius(t: { noise: number }): number {
  return Math.max(0, t.noise);
}

/**
 * Éventail de vision en local (sommet à l'origine, cap 0 = +x), `segments` arcs.
 * Retourne le sommet puis `segments + 1` points de l'arc, de `-half` à `+half`, à distance `range`.
 */
export function coneFan(range: number, half: number, segments: number): { x: number; y: number }[] {
  const pts = [{ x: 0, y: 0 }];
  for (let i = 0; i <= segments; i++) {
    const a = -half + (2 * half * i) / segments;
    pts.push({ x: range * Math.cos(a), y: range * Math.sin(a) });
  }
  return pts;
}

/** Point local (cap 0) → point sim d'un cône posé en (cx, cy) et orienté selon `facing`. */
export function placeConePoint(p: { x: number; y: number }, cx: number, cy: number, facing: number): { x: number; y: number } {
  const c = Math.cos(facing), s = Math.sin(facing);
  return { x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c };
}

/** Le point (px, py) tombe-t-il dans le cône dessiné (portée et demi-angle, sans occlusion) ? */
export function inCone(cx: number, cy: number, facing: number, range: number, half: number, px: number, py: number): boolean {
  const d = Math.hypot(px - cx, py - cy);
  if (d > range) return false;
  if (d === 0) return true;
  let e = Math.atan2(py - cy, px - cx) - facing;
  while (e > Math.PI) e -= 2 * Math.PI;
  while (e < -Math.PI) e += 2 * Math.PI;
  return Math.abs(e) <= half;
}

/**
 * Éventail maillé en anneaux, avec un alpha par sommet qui décroît du sommet (1) à la portée max (`edge`).
 * Sert au dégradé radial du cône de vision : présent près du Night Lord, effacé au bout de sa portée.
 * Sommets : le sommet, puis `rings` anneaux de `segments + 1` points. Indices : triangles en local (cap 0 = +x).
 */
export function coneGradient(range: number, half: number, segments: number, rings: number, edge = 0): { pts: { x: number; y: number }[]; alpha: number[]; index: number[] } {
  const pts = [{ x: 0, y: 0 }], alpha = [1], index: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const f = r / rings, rad = range * f;
    for (let i = 0; i <= segments; i++) {
      const a = -half + (2 * half * i) / segments;
      pts.push({ x: rad * Math.cos(a), y: rad * Math.sin(a) });
      alpha.push(1 - (1 - edge) * f);
    }
  }
  const at = (r: number, i: number) => 1 + (r - 1) * (segments + 1) + i;
  for (let i = 0; i < segments; i++) index.push(0, at(1, i), at(1, i + 1));
  for (let r = 2; r <= rings; r++) for (let i = 0; i < segments; i++) {
    index.push(at(r - 1, i), at(r, i), at(r, i + 1), at(r - 1, i), at(r, i + 1), at(r - 1, i + 1));
  }
  return { pts, alpha, index };
}
