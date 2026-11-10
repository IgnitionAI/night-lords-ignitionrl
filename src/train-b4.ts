// Réglages b4/b5 (curriculum, shaping, sélection d'acteur) : n'écrit rien dans sim.ts ni dans les artefacts gelés.
import { angNorm, dist, BEACON, T_CFG, type World } from './sim';
import { POOL, UNSEEN, type Tactic } from './tactics';

export const B3_LR = 3e-4;
export const B3_ENT = 0.01;
/** Fine-tune depuis b3 : lr plus bas, un peu plus d'entropie pour les flancs / kiter. Seed ≠ 3 (barre entre runs). */
export const B4_TRAIN = { seed: 4, lr: 1e-4, entCoef: 0.02, updates: 800, envs: 16 };
/** Fine-tune depuis b4 : lr plus bas encore, seed ≠ 3 et ≠ 4. Oversample kiter/elite. */
export const B5_TRAIN = { seed: 5, lr: 5e-5, entCoef: 0.025, updates: 2000, envs: 32, init: 'policies/current-full.json' };

export const B4_SHAPE = {
  death: -0.4,
  channel: -0.25,
  interrupt: 0.25,
  band: 0.008,
  front: -0.012,
  spread: 0.01,
  clump: -0.008,
};

/** Shaping b5 : plus de flanc / dos / interruption, chase du kiter, léger rythme (durée) sans casser le WR. */
export const B5_SHAPE = {
  death: -0.55,
  channel: -0.4,
  interrupt: 0.4,
  band: 0.01,
  bandMu: 6,
  bandVar: 18,
  front: -0.016,
  spread: 0.014,
  clump: -0.012,
  rear: 0.014,
  chase: 0.004,
  intercept: 0.012,
  packAlive: 0.002,
  pace: 0.0005,
  rush: -0.003,
};

export const POLICY_FILES: Record<string, string> = {
  current: 'current.json',
  b4: 'current.json',
  b3: 'b3/current.json',
  b5: 'candidates/b5/actor.json',
};

export function policyFileFromQuery(policy: string | null | undefined): { id: string; file: string } {
  const key = policy && POLICY_FILES[policy] ? policy : 'current';
  return { id: key, file: POLICY_FILES[key] };
}

export function parseTrainPreset(args: Record<string, string>): {
  preset: string;
  shapeB4: boolean;
  curriculumB4: boolean;
  shapeB5: boolean;
  curriculumB5: boolean;
  lr: number;
  entCoef: number;
  seed: number;
} {
  const preset = args.preset ?? '';
  const b4 = preset === 'b4';
  const b5 = preset === 'b5';
  const lr = b5 ? B5_TRAIN.lr : b4 ? B4_TRAIN.lr : B3_LR;
  const entCoef = b5 ? B5_TRAIN.entCoef : b4 ? B4_TRAIN.entCoef : B3_ENT;
  const seed = b5 ? B5_TRAIN.seed : b4 ? B4_TRAIN.seed : 1;
  return {
    preset,
    shapeB4: args.shape === 'b4' || b4,
    curriculumB4: args.curriculum === 'b4' || b4,
    shapeB5: args.shape === 'b5' || b5,
    curriculumB5: args.curriculum === 'b5' || b5,
    lr: Number(args.lr ?? lr),
    entCoef: Number(args.entCoef ?? entCoef),
    seed: Number(args.seed ?? seed),
  };
}

export function pickB4Opp(rng: () => number, progress: number): { opp: string; tactic: Tactic } {
  const p = Math.max(0, Math.min(1, progress));
  const unseenW = 0.12 + 0.28 * p;
  if (rng() < unseenW) {
    const u = rng();
    const name = u < 0.5 ? 'kiter' : u < 0.75 ? 'wallHugger' : 'elite';
    return { opp: name, tactic: UNSEEN[name]() };
  }
  const s = rng();
  if (s < 0.30) return { opp: 'turret', tactic: POOL.turret() };
  if (s < 0.50) return { opp: 'brawler', tactic: POOL.brawler() };
  if (s < 0.80) return { opp: 'randomized', tactic: POOL.randomized() };
  if (s < 0.90) return { opp: 'march', tactic: POOL.march() };
  return { opp: 'backpedal', tactic: POOL.backpedal() };
}

/**
 * Curriculum b5 : kiter / elite / wallHugger sur-échantillonnés (faiblesses b4),
 * mix vu (turret, brawler, march, backpedal, randomized) conservé pour ne pas régresser.
 * Poids durs : 48 % → 75 % au fil du run ; dans le sac dur : kiter 42 %, elite 40 %, wallHugger 18 %.
 */
export function pickB5Opp(rng: () => number, progress: number): { opp: string; tactic: Tactic } {
  const p = Math.max(0, Math.min(1, progress));
  const hardW = 0.48 + 0.27 * p;
  if (rng() < hardW) {
    const u = rng();
    const name = u < 0.42 ? 'kiter' : u < 0.82 ? 'elite' : 'wallHugger';
    return { opp: name, tactic: UNSEEN[name]() };
  }
  const s = rng();
  if (s < 0.28) return { opp: 'turret', tactic: POOL.turret() };
  if (s < 0.48) return { opp: 'brawler', tactic: POOL.brawler() };
  if (s < 0.76) return { opp: 'randomized', tactic: POOL.randomized() };
  if (s < 0.90) return { opp: 'march', tactic: POOL.march() };
  return { opp: 'backpedal', tactic: POOL.backpedal() };
}

export function applyB5Shaping(w: World, rewards: number[], died: boolean[]): number[] {
  const out = rewards.slice();
  const t = w.t;
  const channeling = t.channel > 0;
  const interrupted = t.lastHitTick === w.tick - 1;
  const beaconH = Math.atan2(BEACON.y - t.y, BEACON.x - t.x);
  const aliveIdx: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (died[i]) out[i] += B5_SHAPE.death;
    if (!w.nls[i].alive) continue;
    aliveIdx.push(i);
    if (channeling) out[i] += B5_SHAPE.channel * (0.25 + t.channel / T_CFG.channel);
    if (interrupted) out[i] += B5_SHAPE.interrupt;
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    out[i] += B5_SHAPE.band * Math.exp(-((d - B5_SHAPE.bandMu) ** 2) / B5_SHAPE.bandVar);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    if (rel < 0.7 && d < 7) {
      out[i] += B5_SHAPE.front;
      if (w.tick < 200 && d < 5) out[i] += B5_SHAPE.rush;
    }
    if (rel > 2.0 && d < 8) out[i] += B5_SHAPE.rear;
    if (d > 9) out[i] += B5_SHAPE.chase * Math.min(1, (d - 9) / 8);
    const toNl = Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x);
    if (Math.abs(angNorm(toNl - beaconH)) < 0.7 && d < 9) out[i] += B5_SHAPE.intercept;
    out[i] += B5_SHAPE.pace;
  }
  if (aliveIdx.length >= 3) {
    for (const i of aliveIdx) out[i] += B5_SHAPE.packAlive;
  }
  if (aliveIdx.length >= 2) {
    const angs = aliveIdx.map(i => Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x));
    for (let a = 0; a < aliveIdx.length; a++) {
      let minGap = Math.PI;
      for (let b = 0; b < aliveIdx.length; b++) {
        if (a === b) continue;
        const g = Math.abs(angNorm(angs[a] - angs[b]));
        if (g < minGap) minGap = g;
      }
      out[aliveIdx[a]] += minGap > 1.0 ? B5_SHAPE.spread : minGap < 0.4 ? B5_SHAPE.clump : 0;
    }
  }
  return out;
}

export function applyB4Shaping(w: World, rewards: number[], died: boolean[]): number[] {
  const out = rewards.slice();
  const t = w.t;
  const channeling = t.channel > 0;
  const interrupted = t.lastHitTick === w.tick - 1;
  const aliveIdx: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (died[i]) out[i] += B4_SHAPE.death;
    if (!w.nls[i].alive) continue;
    aliveIdx.push(i);
    if (channeling) out[i] += B4_SHAPE.channel * (0.25 + t.channel / T_CFG.channel);
    if (interrupted) out[i] += B4_SHAPE.interrupt;
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    out[i] += B4_SHAPE.band * Math.exp(-((d - 5) ** 2) / 20);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    if (rel < 0.7 && d < 7) out[i] += B4_SHAPE.front;
  }
  if (aliveIdx.length >= 2) {
    const angs = aliveIdx.map(i => Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x));
    for (let a = 0; a < aliveIdx.length; a++) {
      let minGap = Math.PI;
      for (let b = 0; b < aliveIdx.length; b++) {
        if (a === b) continue;
        const g = Math.abs(angNorm(angs[a] - angs[b]));
        if (g < minGap) minGap = g;
      }
      out[aliveIdx[a]] += minGap > 1.0 ? B4_SHAPE.spread : minGap < 0.4 ? B4_SHAPE.clump : 0;
    }
  }
  return out;
}

export function wilsonInterval(k: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return { p, lo: (center - margin) / den, hi: (center + margin) / den };
}

export interface RateRow { packWins: number; games: number; packWinRate: number }
export interface CompareRow {
  deltaWins: number;
  deltaRate: number;
  b3: { p: number; lo: number; hi: number };
  cand: { p: number; lo: number; hi: number };
  regressionVsB3: boolean;
}

export function comparePackRates(
  b3: Record<string, RateRow>,
  cand: Record<string, RateRow>,
): Record<string, CompareRow> {
  const out: Record<string, CompareRow> = {};
  for (const k of Object.keys(b3)) {
    const a = b3[k], b = cand[k];
    if (!b) continue;
    const deltaRate = b.packWinRate - a.packWinRate;
    out[k] = {
      deltaWins: b.packWins - a.packWins,
      deltaRate,
      b3: wilsonInterval(a.packWins, a.games),
      cand: wilsonInterval(b.packWins, b.games),
      regressionVsB3: deltaRate < -0.03,
    };
  }
  return out;
}
