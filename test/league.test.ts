import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBS_DIM, N_ACT, DT, MAX_TICKS } from '../src/sim.ts';
import type { ActorJSON } from '../src/policy.ts';
import { ratingsFromMatches, type EloMatch } from '../src/elo.ts';
import {
  EVAL_SEED_BASE, TRAIN_SEED_MAX, playLeagueMatch, compareProbe,
  artefactMessage, parseLeagueReport, playProbe, replayTicks,
} from '../src/leaguelib.ts';
import { freezeSnapshot, hashActor } from '../src/selfplaylib.ts';

function stubActor(tag: string, prefer: number): ActorJSON {
  const w = new Array(OBS_DIM * N_ACT).fill(0);
  const b = new Array(N_ACT).fill(0);
  b[prefer] = 8;
  return { version: tag, obsDim: OBS_DIM, nAct: N_ACT, layers: [{ inDim: OBS_DIM, outDim: N_ACT, w, b, act: 'linear' }] };
}

test('graines d\'évaluation disjointes de l\'entraînement (< 900000)', () => {
  assert.equal(TRAIN_SEED_MAX, 899999);
  assert.ok(EVAL_SEED_BASE >= 910000);
});

test('ordre documenté : Terminator vaincu, puis dégâts, puis ticks de survie', () => {
  assert.equal(compareProbe(
    { worldWinner: 'pack', damage: 0, ticks: 10 },
    { worldWinner: 'terminator', damage: 99, ticks: 999 },
  ), 'home');
  assert.equal(compareProbe(
    { worldWinner: 'terminator', damage: 1, ticks: 10 },
    { worldWinner: 'pack', damage: 0, ticks: 10 },
  ), 'away');
  assert.equal(compareProbe(
    { worldWinner: 'terminator', damage: 5, ticks: 10 },
    { worldWinner: 'terminator', damage: 1, ticks: 999 },
  ), 'home');
  assert.equal(compareProbe(
    { worldWinner: 'terminator', damage: 1, ticks: 200 },
    { worldWinner: 'terminator', damage: 1, ticks: 100 },
  ), 'home');
  assert.equal(compareProbe(
    { worldWinner: 'terminator', damage: 1, ticks: 100 },
    { worldWinner: 'terminator', damage: 1, ticks: 100 },
  ), 'draw');
});

test('match apparié : même graine, chaque génération pilote les 4 rôles seule ; pas de NL vs NL', () => {
  const home = freezeSnapshot(stubActor('gen-1', 1), { generation: 1, seed: 171, config: {}, provenance: 'test' });
  const away = freezeSnapshot(stubActor('gen-10', 7), { generation: 10, seed: 171, config: {}, provenance: 'test' });
  const m = playLeagueMatch(home, away, EVAL_SEED_BASE);
  assert.equal(m.envTactic, 'march');
  assert.equal(m.envIsCheckpoint, false);
  assert.equal(m.nlVsNl, false);
  assert.equal(m.pairing, 'same-seed-probe');
  assert.equal(m.seed, EVAL_SEED_BASE);
  assert.equal(m.homeSeed, EVAL_SEED_BASE);
  assert.equal(m.awaySeed, EVAL_SEED_BASE);
  assert.ok(m.homeGame.ticks > 0 && m.awayGame.ticks > 0);
  assert.equal(m.homeGame.seconds, +(m.homeGame.ticks * DT).toFixed(1));
  assert.equal(m.awayGame.seconds, +(m.awayGame.ticks * DT).toFixed(1));
  assert.ok(['home', 'away', 'draw'].includes(m.winner));
  assert.equal(m.homeHash, hashActor(home.actor));
  assert.equal(m.awayHash, hashActor(away.actor));
  const h = playProbe(home.actor, EVAL_SEED_BASE);
  const a = playProbe(away.actor, EVAL_SEED_BASE);
  assert.deepEqual(m.homeGame, h);
  assert.deepEqual(m.awayGame, a);
  assert.equal(m.winner, compareProbe(h, a));
});

test('deux politiques différentes sur la même graine ⇒ résultat non nul', () => {
  const hold = freezeSnapshot(stubActor('hold', 0), { generation: 1, seed: 1, config: {}, provenance: 'hold' });
  const approach = freezeSnapshot(stubActor('go', 1), { generation: 10, seed: 1, config: {}, provenance: 'go' });
  const m = playLeagueMatch(hold, approach, EVAL_SEED_BASE);
  assert.notEqual(m.winner, 'draw', JSON.stringify({ winner: m.winner, home: m.homeGame, away: m.awayGame }));
});

test('même graine + mêmes acteurs ⇒ replay bit-identique du duel', () => {
  const home = freezeSnapshot(stubActor('g1', 1), { generation: 1, seed: 1, config: {}, provenance: 'g1' });
  const away = freezeSnapshot(stubActor('g10', 2), { generation: 10, seed: 1, config: {}, provenance: 'g10' });
  const a = playLeagueMatch(home, away, EVAL_SEED_BASE + 3);
  const b = playLeagueMatch(home, away, EVAL_SEED_BASE + 3);
  assert.deepEqual(a, b);
});

test('replayTicks (MAX_TICKS) : dernier tick et vainqueur recalculé = journal', () => {
  const home = freezeSnapshot(stubActor('g1', 0), { generation: 1, seed: 1, config: {}, provenance: 'g1' });
  const away = freezeSnapshot(stubActor('g10', 1), { generation: 10, seed: 1, config: {}, provenance: 'g10' });
  const m = playLeagueMatch(home, away, EVAL_SEED_BASE + 5);
  const hf = replayTicks(home.actor, m.seed, MAX_TICKS);
  const af = replayTicks(away.actor, m.seed, MAX_TICKS);
  assert.equal(hf[hf.length - 1]!.tick, m.homeGame.ticks);
  assert.equal(af[af.length - 1]!.tick, m.awayGame.ticks);
  const h = playProbe(home.actor, m.seed);
  const a = playProbe(away.actor, m.seed);
  assert.equal(compareProbe(h, a), m.winner);
});

test('artefact absent ou incompatible : message explicite', () => {
  assert.match(artefactMessage('missing', 'manifest.json'), /absent/);
  assert.match(artefactMessage('incompatible', 'hash'), /incompatible/);
  assert.throws(() => parseLeagueReport({}), /incompatible/);
  assert.throws(() => parseLeagueReport({ matches: [{ home: 'gen-1', away: 'gen-10', winner: 'home', envIsCheckpoint: true }] }), /checkpoint/);
});

test('rejeu ELO depuis le JSON de résultats, pas depuis des scores codés en dur', () => {
  const matches: EloMatch[] = [
    { home: 'gen-1', away: 'gen-10', winner: 'home' },
    { home: 'gen-10', away: 'gen-50', winner: 'away' },
    { home: 'gen-50', away: 'gen-1', winner: 'draw' },
  ];
  const json = JSON.parse(JSON.stringify(matches)) as EloMatch[];
  const r = ratingsFromMatches(json, ['gen-1', 'gen-10', 'gen-50']);
  const r2 = ratingsFromMatches(matches, ['gen-1', 'gen-10', 'gen-50']);
  assert.deepEqual(r, r2);
  assert.notEqual(r['gen-1'], 1500);
});
