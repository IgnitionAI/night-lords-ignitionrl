// ELO : formule, K, nuls et ordre de mise à jour. Les valeurs attendues sont calculées à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELO_K, ELO_SCALE, INITIAL_ELO, expectedScore, applyMatch, ratingsFromMatches, type EloMatch } from '../src/elo.ts';

test('constantes documentées : K=32, échelle 400, départ 1500', () => {
  assert.equal(ELO_K, 32);
  assert.equal(ELO_SCALE, 400);
  assert.equal(INITIAL_ELO, 1500);
});

test('espérance : écart nul ⇒ 0,5 ; +400 ⇒ 10/11', () => {
  assert.equal(expectedScore(1500, 1500), 0.5);
  assert.equal(expectedScore(1900, 1500), 10 / 11);
  assert.equal(expectedScore(1500, 1900), 1 / 11);
});

test('une victoire entre égaux : 1516 / 1484 (mise à jour simultanée)', () => {
  const next = applyMatch({ A: 1500, B: 1500 }, 'A');
  assert.equal(next.A, 1516);
  assert.equal(next.B, 1484);
});

test('égalité déterministe : scores inchangés si cotes égales', () => {
  const next = applyMatch({ A: 1500, B: 1500 }, 'draw');
  assert.equal(next.A, 1500);
  assert.equal(next.B, 1500);
});

test('égalité avec écart : chacun se rapproche (S=0,5)', () => {
  // E_A = 1/(1+10^((1484-1516)/400)) = 1/(1+10^(-0.08))
  const eA = 1 / (1 + 10 ** (-32 / 400));
  const next = applyMatch({ A: 1516, B: 1484 }, 'draw');
  assert.equal(next.A, 1516 + ELO_K * (0.5 - eA));
  assert.equal(next.B, 1484 + ELO_K * (0.5 - (1 - eA)));
});

test('séquence calculée à la main : A bat B, puis B bat A', () => {
  const matches: EloMatch[] = [
    { home: 'A', away: 'B', winner: 'home' },
    { home: 'A', away: 'B', winner: 'away' },
  ];
  const r1 = ratingsFromMatches(matches.slice(0, 1), ['A', 'B']);
  assert.equal(r1.A, 1516);
  assert.equal(r1.B, 1484);
  const eA = 1 / (1 + 10 ** ((1484 - 1516) / 400));
  const r2 = ratingsFromMatches(matches, ['A', 'B']);
  assert.equal(r2.A, 1516 + ELO_K * (0 - eA));
  assert.equal(r2.B, 1484 + ELO_K * (1 - (1 - eA)));
});

test('rejeu du journal ⇒ exactement le même classement (ordre du journal)', () => {
  const matches: EloMatch[] = [
    { home: 'g1', away: 'g10', winner: 'home' },
    { home: 'g10', away: 'g50', winner: 'draw' },
    { home: 'g50', away: 'g1', winner: 'away' },
    { home: 'g1', away: 'g50', winner: 'home' },
  ];
  const a = ratingsFromMatches(matches, ['g1', 'g10', 'g50']);
  const b = ratingsFromMatches(matches, ['g1', 'g10', 'g50']);
  assert.deepEqual(a, b);
  const shuffledIds = ratingsFromMatches(matches, ['g50', 'g1', 'g10']);
  assert.equal(shuffledIds.g1, a.g1);
  assert.equal(shuffledIds.g10, a.g10);
  assert.equal(shuffledIds.g50, a.g50);
});

test('ordre de mise à jour : le journal est chronologique ; inverser change le classement', () => {
  const fwd: EloMatch[] = [
    { home: 'A', away: 'B', winner: 'home' },
    { home: 'A', away: 'C', winner: 'away' },
  ];
  const rev = [...fwd].reverse();
  const rFwd = ratingsFromMatches(fwd, ['A', 'B', 'C']);
  const rRev = ratingsFromMatches(rev, ['A', 'B', 'C']);
  assert.notDeepEqual(rFwd, rRev);
});
