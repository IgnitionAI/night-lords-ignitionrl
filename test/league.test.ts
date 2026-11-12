import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBS_DIM, N_ACT, DT } from '../src/sim.ts';
import type { ActorJSON } from '../src/policy.ts';
import { ratingsFromMatches, type EloMatch } from '../src/elo.ts';
import { EVAL_SEED_BASE, TRAIN_SEED_MAX, playLeagueMatch, decideWinner, artefactMessage, parseLeagueReport } from '../src/leaguelib.ts';
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

test('décision win/loss/draw : dégâts puis survivants, jamais une tactique comme checkpoint', () => {
  assert.equal(decideWinner({ homeDamage: 4, awayDamage: 1, homeAlive: 0, awayAlive: 2 }), 'home');
  assert.equal(decideWinner({ homeDamage: 1, awayDamage: 4, homeAlive: 2, awayAlive: 0 }), 'away');
  assert.equal(decideWinner({ homeDamage: 2, awayDamage: 2, homeAlive: 2, awayAlive: 1 }), 'home');
  assert.equal(decideWinner({ homeDamage: 2, awayDamage: 2, homeAlive: 1, awayAlive: 1 }), 'draw');
});

test('match réel via la sim : résultat brut, durée, hashes, sonde d\'environnement déclarée', () => {
  const home = stubActor('gen-1', 1);
  const away = stubActor('gen-10', 7);
  const hs = freezeSnapshot(home, { generation: 1, seed: 171, config: {}, provenance: 'test' });
  const as_ = freezeSnapshot(away, { generation: 10, seed: 171, config: {}, provenance: 'test' });
  const m = playLeagueMatch(hs, as_, EVAL_SEED_BASE);
  assert.equal(m.envTactic, 'march');
  assert.equal(m.envIsCheckpoint, false);
  assert.equal(m.seed, EVAL_SEED_BASE);
  assert.ok(m.ticks > 0);
  assert.equal(m.seconds, +(m.ticks * DT).toFixed(1));
  assert.ok(['home', 'away', 'draw'].includes(m.winner));
  assert.equal(m.homeHash, hashActor(home));
  assert.equal(m.awayHash, hashActor(away));
  assert.equal(m.homeGeneration, 1);
  assert.equal(m.awayGeneration, 10);
});

test('même graine + mêmes acteurs ⇒ replay bit-identique du résultat', () => {
  const home = freezeSnapshot(stubActor('g1', 1), { generation: 1, seed: 1, config: {}, provenance: 'g1' });
  const away = freezeSnapshot(stubActor('g10', 2), { generation: 10, seed: 1, config: {}, provenance: 'g10' });
  const a = playLeagueMatch(home, away, EVAL_SEED_BASE + 3);
  const b = playLeagueMatch(home, away, EVAL_SEED_BASE + 3);
  assert.deepEqual(a, b);
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
  const json = JSON.parse(JSON.stringify(matches)) as LeagueMatch[];
  const r = ratingsFromMatches(json, ['gen-1', 'gen-10', 'gen-50']);
  const r2 = ratingsFromMatches(matches, ['gen-1', 'gen-10', 'gen-50']);
  assert.deepEqual(r, r2);
  assert.notEqual(r['gen-1'], 1500);
});
