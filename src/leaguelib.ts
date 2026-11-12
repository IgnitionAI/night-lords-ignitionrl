// Ligue : matchs Night Lords réels dans la simulation existante, entre snapshots figés.
// Rôles 0–1 = home, 2–3 = away. Le Terminator `march` est une sonde d'environnement,
// jamais un checkpoint appris (`envIsCheckpoint: false`).
import { newWorld, step, observe, DT, type World } from './sim';
import { march } from './tactics';
import { forward, softmax, sample, type ActorJSON } from './policy';
import { mulberry32 } from './rng';
import type { MatchWinner, EloMatch } from './elo';
import type { ActorJSON } from './policy';

export const TRAIN_SEED_MAX = 899999;
export const EVAL_SEED_BASE = 910000;
export const HOME_ROLES = [0, 1] as const;
export const AWAY_ROLES = [2, 3] as const;
export const ENV_TACTIC = 'march' as const;

export interface DamageSplit { homeDamage: number; awayDamage: number; homeAlive: number; awayAlive: number }

export interface LeagueMatch extends EloMatch {
  seed: number;
  ticks: number;
  seconds: number;
  homeGeneration: number;
  awayGeneration: number;
  homeHash: string;
  awayHash: string;
  homeDamage: number;
  awayDamage: number;
  homeAlive: number;
  awayAlive: number;
  worldWinner: World['winner'];
  reason: string;
  envTactic: typeof ENV_TACTIC;
  envIsCheckpoint: false;
}

export function decideWinner(s: DamageSplit): MatchWinner {
  if (s.homeDamage > s.awayDamage) return 'home';
  if (s.awayDamage > s.homeDamage) return 'away';
  if (s.homeAlive > s.awayAlive) return 'home';
  if (s.awayAlive > s.homeAlive) return 'away';
  return 'draw';
}

function actFrom(actor: ActorJSON, w: World, i: number, rng: () => number): number {
  if (!w.nls[i].alive) return 0;
  return sample(softmax(forward(actor, observe(w, i))), rng);
}

export interface LeaguePolicy { actor: ActorJSON; meta: { generation: number; hash: string } }

export function playLeagueMatch(home: LeaguePolicy, away: LeaguePolicy, seed: number): LeagueMatch {
  if (seed <= TRAIN_SEED_MAX) throw new Error(`graine d'éval ${seed} chevauche l'entraînement (<= ${TRAIN_SEED_MAX})`);
  const w = newWorld(seed, undefined, { clawWindup: false });
  const tactic = march();
  const rng = mulberry32(seed ^ 0x51ed);
  let homeDamage = 0, awayDamage = 0;
  while (!w.done) {
    const acts = w.nls.map((_, i) => {
      const actor = (HOME_ROLES as readonly number[]).includes(i) ? home.actor : away.actor;
      return actFrom(actor, w, i, rng);
    });
    step(w, tactic(w), acts);
    for (const e of w.events) {
      if (e.type === 'claw' && e.dmg > 0) {
        if ((HOME_ROLES as readonly number[]).includes(e.who)) homeDamage += e.dmg;
        else awayDamage += e.dmg;
      }
    }
  }
  const homeAlive = HOME_ROLES.filter(i => w.nls[i].alive).length;
  const awayAlive = AWAY_ROLES.filter(i => w.nls[i].alive).length;
  const winner = decideWinner({ homeDamage, awayDamage, homeAlive, awayAlive });
  return {
    home: `gen-${home.meta.generation}`,
    away: `gen-${away.meta.generation}`,
    winner,
    seed,
    ticks: w.tick,
    seconds: +(w.tick * DT).toFixed(1),
    homeGeneration: home.meta.generation,
    awayGeneration: away.meta.generation,
    homeHash: home.meta.hash,
    awayHash: away.meta.hash,
    homeDamage,
    awayDamage,
    homeAlive,
    awayAlive,
    worldWinner: w.winner,
    reason: w.reason,
    envTactic: ENV_TACTIC,
    envIsCheckpoint: false,
  };
}

export function artefactMessage(kind: 'missing' | 'incompatible', detail: string): string {
  switch (kind) {
    case 'missing': return `Artefact de ligue absent : ${detail}`;
    case 'incompatible': return `Artefact de ligue incompatible : ${detail}`;
    default: {
      const _x: never = kind;
      throw new Error(_x);
    }
  }
}

export function parseLeagueReport(raw: unknown): { matches: LeagueMatch[]; eloSource: 'matches.json' } {
  if (raw === null || typeof raw !== 'object') throw new Error(artefactMessage('incompatible', 'JSON racine'));
  const o = raw as { matches?: unknown };
  if (!Array.isArray(o.matches)) throw new Error(artefactMessage('incompatible', 'champ matches manquant'));
  for (const m of o.matches) {
    if (!m || typeof m !== 'object') throw new Error(artefactMessage('incompatible', 'entrée match'));
    const row = m as LeagueMatch;
    if (row.envIsCheckpoint) throw new Error(artefactMessage('incompatible', 'contrôleur scripté présenté comme checkpoint'));
    if (typeof row.home !== 'string' || typeof row.away !== 'string') throw new Error(artefactMessage('incompatible', 'identifiants match'));
    if (row.winner !== 'home' && row.winner !== 'away' && row.winner !== 'draw') {
      throw new Error(artefactMessage('incompatible', `winner ${String(row.winner)}`));
    }
  }
  return { matches: o.matches as LeagueMatch[], eloSource: 'matches.json' };
}

export function replayTicks(home: ActorJSON, away: ActorJSON, seed: number, maxTicks = Infinity): {
  tick: number; nls: { x: number; y: number; alive: boolean }[]; t: { x: number; y: number; hp: number };
}[] {
  const w = newWorld(seed, undefined, { clawWindup: false });
  const tactic = march();
  const rng = mulberry32(seed ^ 0x51ed);
  const frames = [];
  const snap = () => ({
    tick: w.tick,
    nls: w.nls.map(n => ({ x: n.x, y: n.y, alive: n.alive })),
    t: { x: w.t.x, y: w.t.y, hp: w.t.hp },
  });
  frames.push(snap());
  while (!w.done && frames.length <= maxTicks) {
    const acts = w.nls.map((_, i) => {
      const actor = (HOME_ROLES as readonly number[]).includes(i) ? home : away;
      return actFrom(actor, w, i, rng);
    });
    step(w, tactic(w), acts);
    frames.push(snap());
  }
  return frames;
}
