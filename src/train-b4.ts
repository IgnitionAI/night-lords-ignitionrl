// Réglages b4/b5 (curriculum, shaping, sélection d'acteur) : n'écrit rien dans sim.ts ni dans les artefacts gelés.
import { angNorm, dist, BEACON, DT, T_CFG, type World } from './sim';
import { POOL, UNSEEN, type Tactic } from './tactics';
import { B8_OBS_DIM, beaconFeatures } from './pack-obs';

export const B3_LR = 3e-4;
export const B3_ENT = 0.01;
/** Fine-tune depuis b3 : lr plus bas, un peu plus d'entropie pour les flancs / kiter. Seed ≠ 3 (barre entre runs). */
export const B4_TRAIN = { seed: 4, lr: 1e-4, entCoef: 0.02, updates: 800, envs: 16 };
/** Fine-tune depuis b4 : lr plus bas encore, seed ≠ 3 et ≠ 4. Oversample kiter/elite. */
export const B5_TRAIN = { seed: 5, lr: 5e-5, entCoef: 0.025, updates: 2000, envs: 32, init: 'policies/current-full.json' };
/** Fine-tune depuis b5 : tempo lisible (30–90 s) sans casser le WR. Seed ≠ 3, 4, 5. */
export const B6_TRAIN = { seed: 6, lr: 2e-5, entCoef: 0.02, updates: 1000, envs: 32, init: 'policies/candidates/b5/full.json' };
/**
 * Fine-tune depuis vis2, après chirurgie d’observation (32→34).
 * Seed ≠ 3, 4, 5, 6, 8 (b7). Init = full vis2, agrandi au chargement.
 */
export const B8_TRAIN = {
  seed: 10, lr: 8e-6, entCoef: 0.02, updates: 220, envs: 32,
  init: 'policies/candidates/b6/full.json', obsDim: B8_OBS_DIM,
};

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

/**
 * Shaping b6 : encerclement / harcèlement / feintes, engagement après mise en place.
 * Pas de fuite (pénalité loin), pas de stall absurde (commit après ~30 s, overtime).
 * Les kills trop rapides sont découragés ; le WR reste porté par canal / interrupt / mort.
 */
export const B6_SHAPE = {
  death: -0.55,
  channel: -0.5,
  interrupt: 0.5,
  band: 0.022,
  bandMu: 8.4,
  bandVar: 16,
  front: -0.02,
  spread: 0.022,
  clump: -0.018,
  rear: 0.012,
  chase: 0.01,
  intercept: 0.02,
  packAlive: 0.004,
  stallFar: -0.04,
  meleeEarly: -0.1,
  harass: 0.014,
  feint: 0.014,
  commitLate: 0.022,
  visible: 0.02,
  outOfCone: -0.008,
  unseenPack: -0.012,
  boltLane: -0.03,
  earlyHit: -5,
  lateHit: 0.22,
  earlyWin: -12,
  tempoWin: 2.5,
  escape: -2.5,
  overtime: -0.012,
  hpHold: 0.018,
  hpBleed: -0.03,
  earlySec: 30,
  commitSec: 32,
  tempoHi: 90,
};

/** Garde de balise conditionnelle (essai 2 de b7) : piquet si T < 10 m, wallCut mur nord. */
export const B8_SHAPE = {
  threatDist: 16,
  threatNear: 4,
  progressX0: 30,
  visKeep: 0.12,
  beaconGuard: 0.05,
  guardHalf: 0.95,
  guardMaxD: 12,
  picketDist: 10,
  picket: 0.02,
  picketR: 5,
  wallY: 18,
  wallCut: 0.08,
  earlyCamp: -0.04,
};

export const POLICY_FILES: Record<string, string> = {
  current: 'current.json',
  b5: 'current.json',
  b6: 'candidates/b6/actor.json',
  b8: 'candidates/b8/actor.json',
  b4: 'b4/current.json',
  b3: 'b3/current.json',
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
  shapeB6: boolean;
  curriculumB6: boolean;
  shapeB8: boolean;
  curriculumB8: boolean;
  lr: number;
  entCoef: number;
  seed: number;
  obsDim: number;
} {
  const preset = args.preset ?? '';
  const b4 = preset === 'b4';
  const b5 = preset === 'b5';
  const b6 = preset === 'b6';
  const b8 = preset === 'b8';
  const lr = b8 ? B8_TRAIN.lr : b6 ? B6_TRAIN.lr : b5 ? B5_TRAIN.lr : b4 ? B4_TRAIN.lr : B3_LR;
  const entCoef = b8 ? B8_TRAIN.entCoef : b6 ? B6_TRAIN.entCoef : b5 ? B5_TRAIN.entCoef : b4 ? B4_TRAIN.entCoef : B3_ENT;
  const seed = b8 ? B8_TRAIN.seed : b6 ? B6_TRAIN.seed : b5 ? B5_TRAIN.seed : b4 ? B4_TRAIN.seed : 1;
  return {
    preset,
    shapeB4: args.shape === 'b4' || b4,
    curriculumB4: args.curriculum === 'b4' || b4,
    shapeB5: args.shape === 'b5' || b5,
    curriculumB5: args.curriculum === 'b5' || b5,
    shapeB6: args.shape === 'b6' || b6,
    curriculumB6: args.curriculum === 'b6' || b6,
    shapeB8: args.shape === 'b8' || b8,
    curriculumB8: args.curriculum === 'b8' || b8,
    lr: Number(args.lr ?? lr),
    entCoef: Number(args.entCoef ?? entCoef),
    seed: Number(args.seed ?? seed),
    obsDim: Number(args.obsDim ?? (b8 ? B8_TRAIN.obsDim : 32)),
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

/**
 * Curriculum b6 : mix vu conservé (ne pas régresser march/turret), kiter/elite encore
 * présents mais moins saturés que b5 — le run apprend le tempo sur tout le pool.
 */
export function pickB6Opp(rng: () => number, progress: number): { opp: string; tactic: Tactic } {
  const p = Math.max(0, Math.min(1, progress));
  const hardW = 0.40 + 0.22 * p;
  if (rng() < hardW) {
    const u = rng();
    const name = u < 0.40 ? 'kiter' : u < 0.78 ? 'elite' : 'wallHugger';
    return { opp: name, tactic: UNSEEN[name]() };
  }
  const s = rng();
  if (s < 0.26) return { opp: 'turret', tactic: POOL.turret() };
  if (s < 0.48) return { opp: 'brawler', tactic: POOL.brawler() };
  if (s < 0.74) return { opp: 'randomized', tactic: POOL.randomized() };
  if (s < 0.90) return { opp: 'march', tactic: POOL.march() };
  return { opp: 'backpedal', tactic: POOL.backpedal() };
}

/**
 * Curriculum b8 : tous les adversaires, kiter/elite au moins autant que wallHugger
 * (b7 saturait le hug et cassait kiter).
 */
export function pickB8Opp(rng: () => number, progress: number): { opp: string; tactic: Tactic } {
  const p = Math.max(0, Math.min(1, progress));
  const weights: [string, number][] = [
    ['kiter', 0.16 + 0.02 * p],
    ['elite', 0.15 + 0.02 * p],
    ['wallHugger', 0.14 + 0.04 * p],
    ['turret', 0.13],
    ['brawler', 0.12],
    ['randomized', 0.14],
    ['march', 0.08],
    ['backpedal', 0.08],
  ];
  const sum = weights.reduce((s, [, w]) => s + w, 0);
  let u = rng() * sum;
  let name = weights[weights.length - 1][0];
  for (const [k, w] of weights) {
    u -= w;
    if (u <= 0) { name = k; break; }
  }
  if (UNSEEN[name]) return { opp: name, tactic: UNSEEN[name]() };
  if (name === 'randomized') return { opp: name, tactic: POOL.randomized() };
  return { opp: name, tactic: POOL[name]() };
}

/** Menace balise : features d’observation (distance T→balise) + progression est (wallHugger). */
export function beaconThreat(w: World): number {
  const f = beaconFeatures(w);
  const spanD = B8_SHAPE.threatDist - B8_SHAPE.threatNear;
  const byDist = Math.max(0, Math.min(1, (B8_SHAPE.threatDist - f.dB) / spanD));
  const spanX = BEACON.x - B8_SHAPE.progressX0;
  const byProg = Math.max(0, Math.min(1, (w.t.x - B8_SHAPE.progressX0) / spanX));
  const byClose = f.closing > 0 ? f.closing * (1 - f.distNorm) : 0;
  return Math.max(byDist, byProg, byClose);
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

export function applyB6Shaping(w: World, rewards: number[], died: boolean[]): number[] {
  const out = rewards.slice();
  const t = w.t;
  const sec = w.tick * DT;
  const channeling = t.channel > 0;
  const interrupted = t.lastHitTick === w.tick - 1;
  const beaconH = Math.atan2(BEACON.y - t.y, BEACON.x - t.x);
  const aliveIdx: number[] = [];
  const earlyFrac = sec < B6_SHAPE.earlySec ? 1 : 0;
  for (let i = 0; i < out.length; i++) {
    if (died[i]) out[i] += B6_SHAPE.death;
    if (!w.nls[i].alive) continue;
    aliveIdx.push(i);
    if (channeling) out[i] += B6_SHAPE.channel * (0.25 + t.channel / T_CFG.channel);
    if (interrupted) out[i] += B6_SHAPE.interrupt;
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    out[i] += B6_SHAPE.band * Math.exp(-((d - B6_SHAPE.bandMu) ** 2) / B6_SHAPE.bandVar);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    if (rel < 0.7 && d < 7) out[i] += B6_SHAPE.front;
    if (rel > 2.0 && d < 8 && earlyFrac === 0) out[i] += B6_SHAPE.rear;
    if (d > 9) out[i] += B6_SHAPE.chase * Math.min(1, (d - 9) / 8);
    if (d > 12) out[i] += B6_SHAPE.stallFar * Math.min(1, (d - 12) / 8);
    const inCone = rel < T_CFG.visionHalf && d <= T_CFG.visionRange && d > 3.2;
    if (inCone && rel > 0.25) out[i] += B6_SHAPE.visible;
    else if (d > 14 || (d > 6 && rel > 2.2)) out[i] += B6_SHAPE.outOfCone;
    if (rel < 0.25 && d > 4 && d < T_CFG.boltRange) out[i] += B6_SHAPE.boltLane;
    if (earlyFrac > 0 && d < 3.2) out[i] += B6_SHAPE.meleeEarly * earlyFrac;
    if (d > 5.5 && d < 12) out[i] += B6_SHAPE.harass;
    if (rel < 0.85 && d > 4 && d < 9.5) out[i] += B6_SHAPE.feint;
    if (sec >= B6_SHAPE.commitSec && d < 5.5) out[i] += B6_SHAPE.commitLate;
    if (sec > B6_SHAPE.tempoHi) out[i] += B6_SHAPE.overtime;
    if (earlyFrac > 0) {
      const hpFrac = t.hp / T_CFG.hp;
      out[i] += B6_SHAPE.hpHold * hpFrac * earlyFrac;
      out[i] += B6_SHAPE.hpBleed * (1 - hpFrac) * earlyFrac;
    }
    const toNl = Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x);
    if (Math.abs(angNorm(toNl - beaconH)) < 0.7 && d < 9) out[i] += B6_SHAPE.intercept;
  }
  for (const e of w.events) {
    if (e.type !== 'claw') continue;
    if (earlyFrac > 0) out[e.who] += B6_SHAPE.earlyHit * earlyFrac;
    else if (sec >= B6_SHAPE.commitSec) out[e.who] += B6_SHAPE.lateHit;
  }
  if (aliveIdx.length >= 3) {
    for (const i of aliveIdx) out[i] += B6_SHAPE.packAlive;
  }
  const anyoneVisible = aliveIdx.some(i => {
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    return rel < T_CFG.visionHalf && d <= T_CFG.visionRange;
  });
  if (aliveIdx.length && !anyoneVisible) {
    for (const i of aliveIdx) out[i] += B6_SHAPE.unseenPack;
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
      out[aliveIdx[a]] += minGap > 1.0 ? B6_SHAPE.spread : minGap < 0.4 ? B6_SHAPE.clump : 0;
    }
  }
  if (w.done && w.winner === 'pack') {
    let extra = 0;
    if (sec < B6_SHAPE.earlySec) extra = B6_SHAPE.earlyWin;
    else if (sec >= 30 && sec <= 90) extra = B6_SHAPE.tempoWin;
    for (let i = 0; i < out.length; i++) if (w.nls[i].alive) out[i] += extra;
  }
  if (w.done && w.reason === 'téléporté') {
    for (let i = 0; i < out.length; i++) if (w.nls[i].alive) out[i] += B6_SHAPE.escape;
  }
  return out;
}

/**
 * Shaping b8 = vis2, atténué sous menace balise (feature T→balise) :
 * wallCut + piquet si T < 10 m, earlyCamp pendant le hug.
 */
export function applyB8Shaping(w: World, rewards: number[], died: boolean[]): number[] {
  const out = rewards.slice();
  const t = w.t;
  const sec = w.tick * DT;
  const channeling = t.channel > 0;
  const interrupted = t.lastHitTick === w.tick - 1;
  const beaconH = Math.atan2(BEACON.y - t.y, BEACON.x - t.x);
  const f = beaconFeatures(w);
  const dBeacon = f.dB;
  const threat = beaconThreat(w);
  const visW = 1 - threat * (1 - B8_SHAPE.visKeep);
  const aliveIdx: number[] = [];
  const earlyFrac = sec < B6_SHAPE.earlySec ? 1 : 0;
  for (let i = 0; i < out.length; i++) {
    if (died[i]) out[i] += B6_SHAPE.death;
    if (!w.nls[i].alive) continue;
    aliveIdx.push(i);
    if (channeling) out[i] += B6_SHAPE.channel * (0.25 + t.channel / T_CFG.channel);
    if (interrupted) out[i] += B6_SHAPE.interrupt;
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    out[i] += B6_SHAPE.band * Math.exp(-((d - B6_SHAPE.bandMu) ** 2) / B6_SHAPE.bandVar);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    if (rel < 0.7 && d < 7) out[i] += B6_SHAPE.front;
    if (rel > 2.0 && d < 8 && earlyFrac === 0) out[i] += B6_SHAPE.rear;
    if (d > 9) out[i] += B6_SHAPE.chase * Math.min(1, (d - 9) / 8);
    if (d > 12) out[i] += B6_SHAPE.stallFar * visW * Math.min(1, (d - 12) / 8);
    const inCone = rel < T_CFG.visionHalf && d <= T_CFG.visionRange && d > 3.2;
    if (inCone && rel > 0.25) out[i] += B6_SHAPE.visible * visW;
    else if (d > 14 || (d > 6 && rel > 2.2)) out[i] += B6_SHAPE.outOfCone * visW;
    if (rel < 0.25 && d > 4 && d < T_CFG.boltRange) out[i] += B6_SHAPE.boltLane;
    if (earlyFrac > 0 && d < 3.2) out[i] += B6_SHAPE.meleeEarly * earlyFrac;
    if (d > 5.5 && d < 12) out[i] += B6_SHAPE.harass;
    if (rel < 0.85 && d > 4 && d < 9.5) out[i] += B6_SHAPE.feint;
    if (sec >= B6_SHAPE.commitSec && d < 5.5) out[i] += B6_SHAPE.commitLate;
    if (sec > B6_SHAPE.tempoHi) out[i] += B6_SHAPE.overtime;
    if (earlyFrac > 0) {
      const hpFrac = t.hp / T_CFG.hp;
      out[i] += B6_SHAPE.hpHold * hpFrac * earlyFrac;
      out[i] += B6_SHAPE.hpBleed * (1 - hpFrac) * earlyFrac;
    }
    const toNl = Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x);
    if (Math.abs(angNorm(toNl - beaconH)) < 0.7 && d < 9) out[i] += B6_SHAPE.intercept;
    const dBnl = dist(w.nls[i].x, w.nls[i].y, BEACON.x, BEACON.y);
    const nearBeacon = dBeacon < B8_SHAPE.picketDist;
    if (nearBeacon && threat > 0) {
      const onPath = Math.abs(angNorm(toNl - beaconH)) < B8_SHAPE.guardHalf && d < B8_SHAPE.guardMaxD && dBnl <= dBeacon + 1;
      if (onPath) out[i] += B8_SHAPE.beaconGuard * threat;
      if (dBnl < B8_SHAPE.picketR) out[i] += B8_SHAPE.picket * threat * (1 - dBnl / B8_SHAPE.picketR);
    }
    if (t.y > B8_SHAPE.wallY && w.nls[i].y > B8_SHAPE.wallY - 1 && w.nls[i].x > t.x - 0.5 && w.nls[i].x < BEACON.x) {
      out[i] += B8_SHAPE.wallCut * Math.max(threat, 0.35);
    }
    if (t.y > B8_SHAPE.wallY && dBeacon > B8_SHAPE.picketDist && dBnl < 6) {
      out[i] += B8_SHAPE.earlyCamp;
    }
  }
  for (const e of w.events) {
    if (e.type !== 'claw') continue;
    if (earlyFrac > 0) out[e.who] += B6_SHAPE.earlyHit * earlyFrac;
    else if (sec >= B6_SHAPE.commitSec) out[e.who] += B6_SHAPE.lateHit;
  }
  if (aliveIdx.length >= 3) {
    for (const i of aliveIdx) out[i] += B6_SHAPE.packAlive;
  }
  const anyoneVisible = aliveIdx.some(i => {
    const d = dist(w.nls[i].x, w.nls[i].y, t.x, t.y);
    const rel = Math.abs(angNorm(Math.atan2(w.nls[i].y - t.y, w.nls[i].x - t.x) - t.facing));
    return rel < T_CFG.visionHalf && d <= T_CFG.visionRange;
  });
  if (aliveIdx.length && !anyoneVisible) {
    for (const i of aliveIdx) out[i] += B6_SHAPE.unseenPack * visW;
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
      out[aliveIdx[a]] += minGap > 1.0 ? B6_SHAPE.spread : minGap < 0.4 ? B6_SHAPE.clump : 0;
    }
  }
  if (w.done && w.winner === 'pack') {
    let extra = 0;
    if (sec < B6_SHAPE.earlySec) extra = B6_SHAPE.earlyWin;
    else if (sec >= 30 && sec <= 90) extra = B6_SHAPE.tempoWin;
    for (let i = 0; i < out.length; i++) if (w.nls[i].alive) out[i] += extra;
  }
  if (w.done && w.reason === 'téléporté') {
    for (let i = 0; i < out.length; i++) if (w.nls[i].alive) out[i] += B6_SHAPE.escape;
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
