// Ligue : duels appariés par graine. Il n'y a pas de combat Night Lords contre Night Lords.
// Sur une graine d'éval, A pilote seule les 4 rôles contre la sonde `march`, puis B fait de même.
// Gagnant : Terminator vaincu, puis dégâts infligés, puis ticks de survie de la meute.
import { newWorld, step, observe, DT, MAX_TICKS, type World } from './sim';
import { march } from './tactics';
import { forward, softmax, sample, type ActorJSON } from './policy';
import { mulberry32 } from './rng';
import type { MatchWinner, EloMatch } from './elo';

export const TRAIN_SEED_MAX = 899999;
export const EVAL_SEED_BASE = 910000;
export const ENV_TACTIC = 'march' as const;

export interface ProbeGame {
  ticks: number;
  seconds: number;
  damage: number;
  alive: number;
  worldWinner: World['winner'];
  reason: string;
}

export interface LeagueMatch extends EloMatch {
  seed: number;
  homeSeed: number;
  awaySeed: number;
  homeGeneration: number;
  awayGeneration: number;
  homeHash: string;
  awayHash: string;
  homeGame: ProbeGame;
  awayGame: ProbeGame;
  envTactic: typeof ENV_TACTIC;
  envIsCheckpoint: false;
  nlVsNl: false;
  pairing: 'same-seed-probe';
}

export interface LeaguePolicy { actor: ActorJSON; meta: { generation: number; hash: string } }

export function compareProbe(home: { worldWinner: World['winner']; damage: number; ticks: number }, away: { worldWinner: World['winner']; damage: number; ticks: number }): MatchWinner {
  const homeKill = home.worldWinner === 'pack';
  const awayKill = away.worldWinner === 'pack';
  if (homeKill && !awayKill) return 'home';
  if (awayKill && !homeKill) return 'away';
  if (home.damage !== away.damage) return home.damage > away.damage ? 'home' : 'away';
  if (home.ticks !== away.ticks) return home.ticks > away.ticks ? 'home' : 'away';
  return 'draw';
}

function actFrom(actor: ActorJSON, w: World, i: number, rng: () => number): number {
  if (!w.nls[i].alive) return 0;
  return sample(softmax(forward(actor, observe(w, i))), rng);
}

export function playProbe(actor: ActorJSON, seed: number): ProbeGame {
  if (seed <= TRAIN_SEED_MAX) throw new Error(`graine d'éval ${seed} chevauche l'entraînement (<= ${TRAIN_SEED_MAX})`);
  const w = newWorld(seed, undefined, { clawWindup: false });
  const tactic = march();
  const rng = mulberry32(seed ^ 0x51ed);
  let damage = 0;
  while (!w.done) {
    const acts = w.nls.map((_, i) => actFrom(actor, w, i, rng));
    step(w, tactic(w), acts);
    for (const e of w.events) {
      if (e.type === 'claw' && e.dmg > 0) damage += e.dmg;
    }
  }
  return {
    ticks: w.tick,
    seconds: +(w.tick * DT).toFixed(1),
    damage,
    alive: w.nls.filter(n => n.alive).length,
    worldWinner: w.winner,
    reason: w.reason,
  };
}

export function playLeagueMatch(home: LeaguePolicy, away: LeaguePolicy, seed: number): LeagueMatch {
  const homeGame = playProbe(home.actor, seed);
  const awayGame = playProbe(away.actor, seed);
  return {
    home: `gen-${home.meta.generation}`,
    away: `gen-${away.meta.generation}`,
    winner: compareProbe(homeGame, awayGame),
    seed,
    homeSeed: seed,
    awaySeed: seed,
    homeGeneration: home.meta.generation,
    awayGeneration: away.meta.generation,
    homeHash: home.meta.hash,
    awayHash: away.meta.hash,
    homeGame,
    awayGame,
    envTactic: ENV_TACTIC,
    envIsCheckpoint: false,
    nlVsNl: false,
    pairing: 'same-seed-probe',
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
    if (row.nlVsNl) throw new Error(artefactMessage('incompatible', 'combat NL vs NL : hors protocole'));
    if (typeof row.home !== 'string' || typeof row.away !== 'string') throw new Error(artefactMessage('incompatible', 'identifiants match'));
    if (row.winner !== 'home' && row.winner !== 'away' && row.winner !== 'draw') {
      throw new Error(artefactMessage('incompatible', `winner ${String(row.winner)}`));
    }
  }
  return { matches: o.matches as LeagueMatch[], eloSource: 'matches.json' };
}

export function replayTicks(actor: ActorJSON, seed: number, maxTicks = MAX_TICKS): {
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
  while (!w.done && w.tick < maxTicks) {
    const acts = w.nls.map((_, i) => actFrom(actor, w, i, rng));
    step(w, tactic(w), acts);
    frames.push(snap());
  }
  return frames;
}
