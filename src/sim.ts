// Simulation à pas fixe, pure (aucune dépendance) : la même sert au jeu, à l'entraînement et à l'éval.
// Principe repris de The Crucible (IgnitionAI/ignition, packages/demo-cage-duel) : tick fixe de 100 ms,
// la sim fait foi pour le rendu comme pour l'entraînement.
import { mulberry32, gauss, type Rng } from './rng';

export const DT = 0.1;
export const MAX_TICKS = 1200; // 120 s simulées
export const ARENA = { w: 40, h: 24 };
export interface Box { x0: number; y0: number; x1: number; y1: number }
export const PILLARS: Box[] = [
  { x0: 9, y0: 4, x1: 11, y1: 8 }, { x0: 9, y0: 16, x1: 11, y1: 20 },
  { x0: 17, y0: 10, x1: 19, y1: 14 },
  { x0: 24, y0: 3, x1: 26, y1: 7 }, { x0: 24, y0: 17, x1: 26, y1: 21 },
  { x0: 31, y0: 8.5, x1: 33, y1: 10.5 }, { x0: 31, y0: 13.5, x1: 33, y1: 15.5 },
];
export const BEACON = { x: 37.5, y: 12, r: 1.6 };
export const ROLES = ['Talos', 'Uzas', 'Xarl', 'Cyrion'] as const;
export const N_NL = 4;

// Valeurs de prototype, à régler au ressenti. Ce ne sont pas des chiffres du lore.
export const T_CFG = {
  radius: 0.8, fwd: 2.5, back: 1.5, strafe: 1.5, turn: 1.6, hp: 30,
  boltCd: 12, boltRange: 16, boltHalf: 0.12, fistCd: 12, fistRange: 2.4, fistHalf: 1.0,
  visionHalf: 1.2, visionRange: 14, auspex: 4,
  noiseMove: 9, noiseIdle: 3, noiseBolt: 18, noiseFist: 12,
  channel: 60, // la téléportation exige 6 s dans la zone sans subir de dégât
};
export const NL_CFG = {
  radius: 0.45, speed: 6, visionHalf: 1.1, visionRange: 12, clawRange: 1.75, clawCd: 8,
  frontHalf: 1.05, rearHalf: 2.1, dmgSide: 1, dmgRear: 2, hearSigma: 1.5,
  noiseMove: 5, noiseClaw: 7, voxRange: 14, // un frère n'est connu que vu, entendu ou à portée de vox
};

export interface TAction { fwd: number; strafe: number; turn: number; bolt: boolean; fist: boolean }
export const T_IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
export interface Belief { valid: boolean; x: number; y: number; age: number; facing: number | null; seen: boolean; heard: boolean; vox: boolean }
export interface Mate { known: boolean; x: number; y: number; age: number; alive: boolean }
export interface NL { role: number; x: number; y: number; facing: number; alive: boolean; cd: number; belief: Belief; lastAction: number; noise: number; mates: Mate[] }
export interface Term { x: number; y: number; facing: number; hp: number; boltCd: number; fistCd: number; noise: number; moving: boolean; channel: number; lastHitTick: number; lastHitAngle: number }
export type Ev =
  | { type: 'bolt'; x: number; y: number; tx: number; ty: number; kill: number }
  | { type: 'fist'; kill: number }
  | { type: 'claw'; who: number; dmg: number; zone: 'front' | 'side' | 'rear' }
  | { type: 'whiff'; who: number };
export interface World {
  seed: number; tick: number; rng: Rng; t: Term; nls: NL[];
  done: boolean; winner: 'pack' | 'terminator' | null; reason: string; events: Ev[];
}
export const NL_ACTIONS = ['tenir', 'approcher', 'reculer', 'flanc G', 'flanc D', 'diag G', 'diag D', 'griffes'] as const;
export const N_ACT = NL_ACTIONS.length;

export const angNorm = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function segHitsBox(ax: number, ay: number, bx: number, by: number, b: Box): boolean {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - b.x0], [dx, b.x1 - ax], [-dy, ay - b.y0], [dy, b.y1 - ay]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
export function los(ax: number, ay: number, bx: number, by: number): boolean {
  for (const b of PILLARS) if (segHitsBox(ax, ay, bx, by, b)) return false;
  return true;
}
function insideAny(x: number, y: number, m: number) {
  return PILLARS.some(b => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m);
}
export function collide(p: { x: number; y: number }, r: number) {
  p.x = Math.min(ARENA.w - r, Math.max(r, p.x)); p.y = Math.min(ARENA.h - r, Math.max(r, p.y));
  for (const b of PILLARS) {
    const cx = Math.min(b.x1, Math.max(b.x0, p.x)), cy = Math.min(b.y1, Math.max(b.y0, p.y));
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d > 0 && d < r) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; }
    else if (d === 0) {
      const pen = [p.x - b.x0 + r, b.x1 - p.x + r, p.y - b.y0 + r, b.y1 - p.y + r];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) p.x = b.x0 - r; else if (i === 1) p.x = b.x1 + r; else if (i === 2) p.y = b.y0 - r; else p.y = b.y1 + r;
    }
  }
}
// Distance libre le long d'un rayon (pas de 0,25 m), plafonnée.
export function rayFree(x: number, y: number, dx: number, dy: number, max = 6): number {
  for (let s = 0.25; s <= max; s += 0.25) {
    const px = x + dx * s, py = y + dy * s;
    if (px < 0 || py < 0 || px > ARENA.w || py > ARENA.h || insideAny(px, py, 0)) return s;
  }
  return max;
}

export function newWorld(seed: number, tSpawn?: { x: number; y: number; facing: number }): World {
  const rng = mulberry32(seed);
  const t: Term = { x: 3, y: 6 + rng() * 12, facing: 0, hp: T_CFG.hp, boltCd: 0, fistCd: 0, noise: T_CFG.noiseIdle, moving: false, channel: 0, lastHitTick: -999, lastHitAngle: 0 };
  if (tSpawn) { t.x = tSpawn.x; t.y = tSpawn.y; t.facing = tSpawn.facing; }
  const nls: NL[] = [];
  for (let i = 0; i < N_NL; i++) {
    let x = 0, y = 0;
    do { x = 26 + rng() * 12; y = 2 + rng() * 20; } while (insideAny(x, y, 0.8) || dist(x, y, t.x, t.y) < 12);
    nls.push({ role: i, x, y, facing: Math.PI, alive: true, cd: 0, lastAction: 0, noise: 0, mates: [],
      belief: { valid: false, x: BEACON.x, y: BEACON.y, age: 99, facing: null, seen: false, heard: false, vox: false } });
  }
  for (const n of nls) n.mates = nls.map(() => ({ known: false, x: n.x, y: n.y, age: 99, alive: true }));
  const w: World = { seed, tick: 0, rng, t, nls, done: false, winner: null, reason: '', events: [] };
  perceive(w);
  return w;
}

export function nlSees(w: World, n: NL): boolean {
  const t = w.t, d = dist(n.x, n.y, t.x, t.y);
  if (d > NL_CFG.visionRange) return false;
  const a = Math.atan2(t.y - n.y, t.x - n.x);
  if (Math.abs(angNorm(a - n.facing)) > NL_CFG.visionHalf + Math.atan2(T_CFG.radius, d)) return false;
  return los(n.x, n.y, t.x, t.y);
}
// Ce que le Terminator perçoit : cône de vision + auspex court (même logique, pas d'omniscience).
export function terminatorPerceives(w: World): number[] {
  const t = w.t, out: number[] = [];
  for (let i = 0; i < w.nls.length; i++) {
    const n = w.nls[i]; if (!n.alive) continue;
    const d = dist(n.x, n.y, t.x, t.y);
    if (d <= T_CFG.auspex) { out.push(i); continue; }
    if (d > T_CFG.visionRange) continue;
    if (Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing)) > T_CFG.visionHalf) continue;
    if (los(t.x, t.y, n.x, n.y)) out.push(i);
  }
  return out;
}

function nlSeesPoint(n: NL, x: number, y: number, r: number): boolean {
  const d = dist(n.x, n.y, x, y); if (d > NL_CFG.visionRange) return false;
  if (Math.abs(angNorm(Math.atan2(y - n.y, x - n.x) - n.facing)) > NL_CFG.visionHalf + Math.atan2(r, d)) return false;
  return los(n.x, n.y, x, y);
}
function perceive(w: World) {
  const t = w.t;
  const seers = w.nls.filter(n => n.alive && nlSees(w, n));
  for (const n of w.nls) {
    if (!n.alive) continue;
    const b = n.belief; b.seen = seers.includes(n);
    b.vox = !b.seen && seers.some(m => dist(m.x, m.y, n.x, n.y) <= NL_CFG.voxRange); b.heard = false;
    if (b.seen || b.vox) { b.valid = true; b.x = t.x; b.y = t.y; b.age = 0; b.facing = t.facing; }
    else {
      b.facing = null;
      if (dist(n.x, n.y, t.x, t.y) <= t.noise) {
        b.heard = true; b.valid = true; b.age = 0;
        b.x = t.x + gauss(w.rng) * NL_CFG.hearSigma; b.y = t.y + gauss(w.rng) * NL_CFG.hearSigma;
      } else b.age++;
    }
    // frères : vus, entendus (bruit de leurs pas / griffes) ou à portée de vox ; sinon dernière position connue qui vieillit
    w.nls.forEach((m, j) => {
      if (j === n.role) return; const k = n.mates[j]; const d = dist(n.x, n.y, m.x, m.y);
      const known = d <= NL_CFG.voxRange || (m.alive && (d <= m.noise || nlSeesPoint(n, m.x, m.y, NL_CFG.radius))) || (!m.alive && nlSeesPoint(n, m.x, m.y, NL_CFG.radius));
      k.known = known; if (known) { k.x = m.x; k.y = m.y; k.age = 0; k.alive = m.alive; } else k.age++;
    });
  }
}

/** Repère d'action d'un Night Lord : axe u vers la croyance (ou la balise si aucune info), v à gauche. */
export function nlFrame(n: NL) {
  const tx = n.belief.valid ? n.belief.x : BEACON.x, ty = n.belief.valid ? n.belief.y : BEACON.y;
  let ux = tx - n.x, uy = ty - n.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
  return { ux, uy, vx: -uy, vy: ux, d };
}

export const OBS_DIM = 32;
/** Observation d'un Night Lord : uniquement sa croyance (vu / entendu / vox), ce qu'il sait de ses frères, les murs. */
export function observe(w: World, i: number): number[] {
  const n = w.nls[i], b = n.belief, f = nlFrame(n), o: number[] = [];
  for (let r = 0; r < N_NL; r++) o.push(r === n.role ? 1 : 0);
  o.push(n.cd / NL_CFG.clawCd, b.seen ? 1 : 0, b.heard ? 1 : 0, b.vox ? 1 : 0, b.facing !== null ? 1 : 0);
  o.push(Math.min(1, b.valid ? b.age / 50 : 1), Math.min(1, f.d / 20));
  if (b.facing !== null) { const rel = angNorm(Math.atan2(n.y - b.y, n.x - b.x) - b.facing); o.push(Math.cos(rel), Math.sin(rel)); }
  else o.push(0, 0);
  o.push(w.t.hp / T_CFG.hp); // armure entamée : visible et relayée (règle publique du prototype)
  o.push(w.t.channel / T_CFG.channel); // la balise s'illumine pendant la téléportation : publique
  for (let j = 0; j < N_NL; j++) {
    if (j === i) continue; const k = n.mates[j];
    const dx = k.x - n.x, dy = k.y - n.y, live = k.alive && k.age < 99;
    o.push(k.known ? 1 : 0, Math.min(1, k.age / 50), live ? (dx * f.ux + dy * f.uy) / 20 : 0, live ? (dx * f.vx + dy * f.vy) / 20 : 0);
  }
  o.push(rayFree(n.x, n.y, f.ux, f.uy) / 6, rayFree(n.x, n.y, -f.ux, -f.uy) / 6, rayFree(n.x, n.y, f.vx, f.vy) / 6, rayFree(n.x, n.y, -f.vx, -f.vy) / 6);
  o.push(w.tick / MAX_TICKS);
  return o;
}

export const REWARD = { tick: -0.002, dmgSelf: 0.5, dmgTeam: 0.2, front: -0.05, death: -1, win: 3, loss: -2, shaping: 0.03, gamma: 0.99,
  uzasBait: 0.01, cyrionRear: 0.5, xarlFinish: 0.3, talosSpot: 0.005 };

export interface StepOut { rewards: number[]; died: boolean[] }

export function step(w: World, ta: TAction, acts: number[]): StepOut {
  const t = w.t; w.events = [];
  const rewards = w.nls.map(() => REWARD.tick), died = w.nls.map(() => false);
  const phi0 = w.nls.map(n => -REWARD.shaping * nlFrame(n).d); // potentiel calculé sur la croyance, pas sur la vraie position
  // --- Terminator
  t.facing = angNorm(t.facing + Math.max(-1, Math.min(1, ta.turn)) * T_CFG.turn * DT);
  const fwd = Math.max(-1, Math.min(1, ta.fwd)), str = Math.max(-1, Math.min(1, ta.strafe));
  const sp = (fwd >= 0 ? T_CFG.fwd : T_CFG.back) * fwd, ss = T_CFG.strafe * str;
  const cx = Math.cos(t.facing), cy = Math.sin(t.facing);
  t.x += (cx * sp - cy * ss) * DT; t.y += (cy * sp + cx * ss) * DT; collide(t, T_CFG.radius);
  t.moving = fwd !== 0 || str !== 0;
  t.noise = t.moving ? T_CFG.noiseMove : T_CFG.noiseIdle;
  if (ta.bolt && t.boltCd === 0) {
    t.boltCd = T_CFG.boltCd; t.noise = Math.max(t.noise, T_CFG.noiseBolt);
    let best = -1, bd = 1e9;
    w.nls.forEach((n, i) => {
      if (!n.alive) return; const d = dist(n.x, n.y, t.x, t.y); if (d > T_CFG.boltRange) return;
      const e = Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing));
      if (e <= T_CFG.boltHalf + Math.atan2(NL_CFG.radius, d) && d < bd && los(t.x, t.y, n.x, n.y)) { bd = d; best = i; }
    });
    const ex = best >= 0 ? w.nls[best].x : t.x + cx * T_CFG.boltRange, ey = best >= 0 ? w.nls[best].y : t.y + cy * T_CFG.boltRange;
    if (best >= 0) { w.nls[best].alive = false; died[best] = true; }
    w.events.push({ type: 'bolt', x: t.x, y: t.y, tx: ex, ty: ey, kill: best });
  }
  if (ta.fist && t.fistCd === 0) {
    t.fistCd = T_CFG.fistCd; t.noise = Math.max(t.noise, T_CFG.noiseFist);
    let best = -1, bd = 1e9;
    w.nls.forEach((n, i) => {
      if (!n.alive) return; const d = dist(n.x, n.y, t.x, t.y);
      if (d <= T_CFG.fistRange + NL_CFG.radius && Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing)) <= T_CFG.fistHalf && d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { w.nls[best].alive = false; died[best] = true; }
    w.events.push({ type: 'fist', kill: best });
  }
  if (t.boltCd > 0) t.boltCd--; if (t.fistCd > 0) t.fistCd--;
  // --- Night Lords (mêmes règles de collision et de portée)
  for (let i = 0; i < w.nls.length; i++) {
    const n = w.nls[i]; if (!n.alive || died[i]) continue;
    const a = acts[i] ?? 0; n.lastAction = a; const f = nlFrame(n); n.noise = 0;
    if (n.cd > 0) n.cd--;
    if (a === 7) {
      n.facing = Math.atan2(f.uy, f.ux);
      if (n.cd === 0) {
        n.cd = NL_CFG.clawCd; n.noise = NL_CFG.noiseClaw;
        if (dist(n.x, n.y, t.x, t.y) <= NL_CFG.clawRange) {
          const rel = Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing));
          const zone = rel < NL_CFG.frontHalf ? 'front' : rel > NL_CFG.rearHalf ? 'rear' : 'side';
          const dmg = zone === 'front' ? 0 : zone === 'rear' ? NL_CFG.dmgRear : NL_CFG.dmgSide;
          const before = t.hp; t.hp = Math.max(0, t.hp - dmg);
          if (dmg > 0) { t.lastHitTick = w.tick; t.lastHitAngle = Math.atan2(n.y - t.y, n.x - t.x); }
          w.events.push({ type: 'claw', who: i, dmg, zone });
          if (dmg === 0) rewards[i] += REWARD.front;
          rewards[i] += REWARD.dmgSelf * dmg;
          if (n.role === 3 && zone === 'rear') rewards[i] += REWARD.cyrionRear * dmg;
          if (n.role === 2 && before <= T_CFG.hp / 2) rewards[i] += REWARD.xarlFinish * dmg;
          w.nls.forEach((m, j) => { if (m.alive && !died[j]) rewards[j] += REWARD.dmgTeam * dmg; });
        } else w.events.push({ type: 'whiff', who: i });
      }
    } else if (a > 0) {
      const dirs: Record<number, [number, number]> = { 1: [1, 0], 2: [-1, 0], 3: [0, 1], 4: [0, -1], 5: [0.7071, 0.7071], 6: [0.7071, -0.7071] };
      const [du, dv] = dirs[a]; const mx = f.ux * du + f.vx * dv, my = f.uy * du + f.vy * dv;
      n.x += mx * NL_CFG.speed * DT; n.y += my * NL_CFG.speed * DT; n.facing = Math.atan2(my, mx); n.noise = NL_CFG.noiseMove;
    } else n.facing = Math.atan2(f.uy, f.ux);
    collide(n, NL_CFG.radius);
    const d = dist(n.x, n.y, t.x, t.y), mind = NL_CFG.radius + T_CFG.radius;
    if (d < mind && d > 0) { n.x = t.x + (n.x - t.x) / d * mind; n.y = t.y + (n.y - t.y) / d * mind; collide(n, NL_CFG.radius); }
    if (n.role === 1 && n.belief.facing !== null) { // Uzas : se savoir (vu ou vox) dans le cône avant, proche = appât
      const b = n.belief, rel = Math.abs(angNorm(Math.atan2(n.y - b.y, n.x - b.x) - b.facing!));
      if (rel < 0.6 && dist(n.x, n.y, b.x, b.y) < 7) rewards[i] += REWARD.uzasBait;
    }
  }
  for (let i = 0; i < w.nls.length; i++) for (let j = i + 1; j < w.nls.length; j++) {
    const a = w.nls[i], b = w.nls[j]; if (!a.alive || !b.alive) continue;
    const d = dist(a.x, a.y, b.x, b.y), m = 2 * NL_CFG.radius;
    if (d < m && d > 0) { const p = (m - d) / 2; a.x -= (b.x - a.x) / d * p; a.y -= (b.y - a.y) / d * p; b.x += (b.x - a.x) / d * p; b.y += (b.y - a.y) / d * p; }
  }
  // téléportation : 6 s dans la zone sans être touché
  const inZone = dist(t.x, t.y, BEACON.x, BEACON.y) <= BEACON.r;
  t.channel = inZone && t.lastHitTick !== w.tick ? t.channel + 1 : 0;
  w.tick++;
  perceive(w);
  w.nls.forEach((n, i) => {
    if (died[i]) rewards[i] += REWARD.death;
    if (n.alive && n.role === 0 && n.belief.seen) rewards[i] += REWARD.talosSpot;
    if (n.alive) rewards[i] += REWARD.gamma * -REWARD.shaping * nlFrame(n).d - phi0[i];
  });
  // --- fin de manche
  if (t.hp <= 0) { w.done = true; w.winner = 'pack'; w.reason = 'Terminator abattu'; }
  else if (w.nls.every(n => !n.alive)) { w.done = true; w.winner = 'terminator'; w.reason = 'meute anéantie'; }
  else if (t.channel >= T_CFG.channel) { w.done = true; w.winner = 'terminator'; w.reason = 'téléporté'; }
  else if (w.tick >= MAX_TICKS) { w.done = true; w.winner = 'terminator'; w.reason = 'temps écoulé, il a tenu'; }
  if (w.done) w.nls.forEach((n, i) => { if (n.alive) rewards[i] += w.winner === 'pack' ? REWARD.win : REWARD.loss; });
  return { rewards, died };
}

// Champ de distances vers la balise (Dijkstra sur grille 0,5 m, piliers gonflés du rayon du Terminator).
// Sert aux Terminators scriptés pour contourner les piliers ; c'est une carte publique, pas une triche.
const CELL = 0.5, GW = Math.round(ARENA.w / CELL), GH = Math.round(ARENA.h / CELL);
let FIELD: Float32Array | null = null;
function buildField() {
  const f = new Float32Array(GW * GH).fill(Infinity); const blocked = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
    if (insideAny(x, y, T_CFG.radius) || x < T_CFG.radius || y < T_CFG.radius || x > ARENA.w - T_CFG.radius || y > ARENA.h - T_CFG.radius) blocked[gy * GW + gx] = 1;
  }
  const bx = Math.floor(BEACON.x / CELL), by = Math.floor(BEACON.y / CELL); f[by * GW + bx] = 0;
  const q: number[] = [by * GW + bx];
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (q.length) { // petite file de priorité naïve (grille de 3 840 cases, calcul unique)
    let bi = 0; for (let i = 1; i < q.length; i++) if (f[q[i]] < f[q[bi]]) bi = i;
    const c = q.splice(bi, 1)[0], cx = c % GW, cy = (c - cx) / GW;
    for (const [dx, dy, cost] of nb) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx; if (blocked[ni]) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
      if (f[c] + cost < f[ni]) { if (f[ni] === Infinity) q.push(ni); f[ni] = f[c] + cost; }
    }
  }
  return f;
}
/** Direction (angle) de descente du champ vers la balise depuis (x, y). */
export function beaconHeading(x: number, y: number): number {
  FIELD ??= buildField();
  const gx = Math.min(GW - 1, Math.max(0, Math.floor(x / CELL))), gy = Math.min(GH - 1, Math.max(0, Math.floor(y / CELL)));
  let best = FIELD[gy * GW + gx], bx = 0, by = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const v = FIELD[ny * GW + nx] + 0.01 * Math.hypot(dx, dy); if (v < best) { best = v; bx = dx; by = dy; }
  }
  if (bx === 0 && by === 0) return Math.atan2(BEACON.y - y, BEACON.x - x);
  return Math.atan2(by, bx);
}
