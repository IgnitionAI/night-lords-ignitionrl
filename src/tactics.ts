// Terminators scriptés : ils n'utilisent que ce que le Terminator perçoit (cône + auspex), comme un joueur.
import { mulberry32, type Rng } from './rng';
import { type World, type TAction, BEACON, PILLARS, T_CFG, NL_CFG, angNorm, dist, terminatorPerceives, beaconHeading, los, rayFree } from './sim';
import type { TacticSummary } from './recorder';
import { tObserve, decodeAction } from './tobs';
import { bcAct, type ActorJSON } from './policy';

export type Tactic = (w: World) => TAction;

function heading(w: World, tx: number, ty: number): number {
  const t = w.t;
  if (tx === BEACON.x && ty === BEACON.y) return beaconHeading(t.x, t.y);
  if (!los(t.x, t.y, tx, ty)) return beaconHeading(t.x, t.y); let hx = tx - t.x, hy = ty - t.y; const d = Math.hypot(hx, hy) || 1; hx /= d; hy /= d;
  for (const b of PILLARS) { // répulsion simple des piliers
    const cx = Math.min(b.x1, Math.max(b.x0, t.x)), cy = Math.min(b.y1, Math.max(b.y0, t.y));
    const dx = t.x - cx, dy = t.y - cy, dd = Math.hypot(dx, dy);
    if (dd > 0 && dd < 2.5) { const k = (2.5 - dd) / 2.5 * 1.6; hx += dx / dd * k; hy += dy / dd * k; }
  }
  return Math.atan2(hy, hx);
}
const turnTo = (w: World, a: number) => { const e = angNorm(a - w.t.facing); return Math.abs(e) < 0.08 ? 0 : Math.sign(e); };
function nearest(w: World) {
  const p = terminatorPerceives(w); let best = -1, bd = 1e9;
  for (const i of p) { const n = w.nls[i]; const d = dist(n.x, n.y, w.t.x, w.t.y); if (d < bd) { bd = d; best = i; } }
  return best < 0 ? null : { n: w.nls[best], d: bd, a: Math.atan2(w.nls[best].y - w.t.y, w.nls[best].x - w.t.x) };
}
function fire(w: World, tgt: { d: number; a: number }, act: TAction) {
  const e = Math.abs(angNorm(tgt.a - w.t.facing));
  if (tgt.d <= T_CFG.fistRange + NL_CFG.radius && e <= T_CFG.fistHalf) act.fist = true;
  else if (e <= T_CFG.boltHalf + 0.03 && tgt.d <= T_CFG.boltRange) act.bolt = true;
}
function walk(w: World, tx: number, ty: number, act: TAction, backwards = false) {
  const h = heading(w, tx, ty), want = backwards ? angNorm(h + Math.PI) : h;
  act.turn = turnTo(w, want);
  if (Math.abs(angNorm(want - w.t.facing)) < 0.7) act.fwd = backwards ? -1 : 1;
}

export function march(): Tactic { // avance vers la téléportation, se retourne et tire sur ce qu'il voit
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg && tg.d < 10) { a.turn = turnTo(w, tg.a); fire(w, tg, a); if (tg.d > 3) a.fwd = Math.abs(angNorm(tg.a - w.t.facing)) < 0.4 ? 1 : 0; }
    else walk(w, BEACON.x, BEACON.y, a);
    return a; };
}
export function turret(): Tactic { // reste sur place, balaye, n'avance qu'après un silence
  let quiet = 0;
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg) { quiet = 0; a.turn = turnTo(w, tg.a); fire(w, tg, a); }
    else if (++quiet > 30) walk(w, BEACON.x, BEACON.y, a); else a.turn = 1;
    return a; };
}
export function brawler(): Tactic { // charge le plus proche au gantelet
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg) { a.turn = turnTo(w, tg.a); a.fwd = 1; fire(w, tg, a); } else walk(w, BEACON.x, BEACON.y, a);
    return a; };
}
export function backpedal(): Tactic { // recule vers la téléportation en gardant le front vers la menace
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg) { a.turn = turnTo(w, tg.a); fire(w, tg, a);
      const away = Math.atan2(BEACON.y - w.t.y, BEACON.x - w.t.x); const rel = angNorm(away - w.t.facing);
      a.fwd = Math.cos(rel) > 0.3 ? 1 : Math.cos(rel) < -0.3 ? -1 : 0; a.strafe = Math.sin(rel) > 0.3 ? 1 : Math.sin(rel) < -0.3 ? -1 : 0; }
    else walk(w, BEACON.x, BEACON.y, a, true);
    return a; };
}
// Tactique « hors pool » qui sert de joueur synthétique pour tester le mécanisme C sans humain :
// longe le mur nord, puis fonce sur la téléportation, tire à longue portée.
export function wallHugger(): Tactic {
  let phase = 0;
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg && tg.d < 12) { a.turn = turnTo(w, tg.a); fire(w, tg, a); if (tg.d > 6) return a; a.fwd = -1; return a; }
    if (phase === 0 && w.t.x > 30) phase = 1;
    if (phase === 0) walk(w, Math.min(w.t.x + 6, 34), 22.5, a); else walk(w, BEACON.x, BEACON.y, a);
    return a; };
}

/** Fantôme : rejoue la tactique résumée d'un joueur (trajet, style de tir, distance d'engagement). */
export function ghost(s: TacticSummary, seed: number): Tactic {
  const rng: Rng = mulberry32(seed);
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    const engage = Math.max(4, s.engageDist * 1.3);
    if (tg && tg.d < engage) {
      a.turn = turnTo(w, tg.a);
      const e = Math.abs(angNorm(tg.a - w.t.facing));
      if (s.fistShare > 0.3 && tg.d <= T_CFG.fistRange + NL_CFG.radius && e <= T_CFG.fistHalf) a.fist = true;
      else if (s.boltPerContactTick > 0.01 && e <= T_CFG.boltHalf + 0.03) a.bolt = true;
      else if (tg.d <= T_CFG.fistRange + NL_CFG.radius && e <= T_CFG.fistHalf) a.fist = true;
      if (rng() < s.backwardRatio) a.fwd = -1;
      return a;
    }
    if (rng() < s.idleRatio * 0.5) return a;
    const i = Math.min(s.path.length - 1, Math.floor(w.tick / 10) + 1);
    const [px, py] = s.path.length ? s.path[i] : [BEACON.x, BEACON.y];
    walk(w, px, py, a, s.backwardRatio > 0.4);
    return a; };
}

// --- Tactiques JAMAIS vues à l'entraînement (éval uniquement)
// kiter : face à la menace, pas chassés latéraux qui changent de sens toutes les 3 s, tir ; sinon va à la balise.
export function kiter(): Tactic {
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const tg = nearest(w);
    if (tg) { a.turn = turnTo(w, tg.a); fire(w, tg, a); a.strafe = Math.floor(w.tick / 30) % 2 ? 1 : -1; if (tg.d < 3) a.fwd = -1; }
    else walk(w, BEACON.x, BEACON.y, a);
    return a; };
}
// elite : le meilleur scripté. Se retourne vers un coup reçu dans le dos, recule contre un mur dès 2 menaces,
// priorise la menace la plus proche, gantelet au contact ; sinon va canaliser la téléportation.
export function elite(): Tactic {
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const t = w.t;
    const p = terminatorPerceives(w); const tg = nearest(w);
    if (w.tick - t.lastHitTick <= 8 && (!tg || tg.d > 3)) { a.turn = turnTo(w, t.lastHitAngle); a.fist = true; return a; }
    if (tg) {
      a.turn = turnTo(w, tg.a); fire(w, tg, a);
      if (p.length >= 2 && rayFree(t.x, t.y, -Math.cos(t.facing), -Math.sin(t.facing), 3) > 1.2) a.fwd = -1;
      return a;
    }
    walk(w, BEACON.x, BEACON.y, a); if (!a.fwd && Math.abs(a.turn) === 0) a.turn = Math.floor(w.tick / 15) % 2 ? 1 : -1;
    return a; };
}
/** Fantôme appris par imitation (behaviour cloning) sur les manches enregistrées du joueur. */
export function bcGhost(m: ActorJSON, seed: number, temp = Number(process.env.GHOST_TEMP ?? 0.5)): Tactic {
  const rng: Rng = mulberry32(seed);
  return w => { const r = bcAct(m, tObserve(w), rng, temp); return decodeAction(r.move, r.atk); };
}

// randomized : tactique paramétrée tirée au hasard à chaque partie (randomisation de domaine pour l'entraînement).
// Ce n'est ni kiter ni elite (jamais utilisés à l'entraînement), mais elle couvre des comportements voisins
// (pas chassés, recul, réaction aux coups) : à dire clairement dans le rapport.
export function randomized(seed = Math.floor(Math.random() * 1e9)): Tactic {
  const r = mulberry32(seed); const P = {
    engage: 5 + r() * 9, strafeP: r(), period: 10 + Math.floor(r() * 40), backOff: r() * 4, scan: r() < 0.5,
    reactHit: r() < 0.5, fistPref: r() < 0.4, chase: r() < 0.3, hold: r() < 0.3, holdTicks: 20 + Math.floor(r() * 60) };
  let quiet = 0;
  return w => { const a: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; const t = w.t; const tg = nearest(w);
    if (P.reactHit && w.tick - t.lastHitTick <= 6 && (!tg || tg.d > 3)) { a.turn = turnTo(w, t.lastHitAngle); a.fist = true; return a; }
    if (tg && tg.d < P.engage) {
      quiet = 0; a.turn = turnTo(w, tg.a); fire(w, tg, a);
      if (P.fistPref && tg.d < 4) a.fwd = 1; else if (tg.d < P.backOff) a.fwd = -1; else if (P.chase && tg.d > 3) a.fwd = 1;
      if (r() < P.strafeP) a.strafe = Math.floor(w.tick / P.period) % 2 ? 1 : -1;
      return a;
    }
    quiet++;
    if (P.hold && quiet < P.holdTicks) { if (P.scan) a.turn = 1; return a; }
    walk(w, BEACON.x, BEACON.y, a); return a; };
}

export const POOL: Record<string, () => Tactic> = { march, turret, brawler, backpedal, randomized: () => randomized() };
export const UNSEEN: Record<string, () => Tactic> = { wallHugger, kiter, elite };
