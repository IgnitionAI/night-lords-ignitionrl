// Test du commutateur d'évaluation `--claw-windup` : `runGames(..., { clawWindup: true })` doit produire des
// annonces `clawArm` (les griffes s'arment), et l'option absente ou `false` n'en produire aucune (règles b3).
// C'est la preuve que l'option atteint bien `newWorld` et pas seulement la signature.
// Exécution : `npm test` (ou `node --import tsx --test test/eval-claw-windup.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGames } from '../src/evallib.ts';
import { POOL } from '../src/tactics.ts';

// Peu de parties, seeds réservées au test pour ne pas recouper les mesures : `march` approche au contact, donc les
// griffes partent tôt et l'armement est observé de façon fiable.
const N = 4;
const SEED = 777000;
const march = (s: number) => POOL.march();

test('clawWindup: true ⇒ des annonces clawArm sont observées', () => {
  const s = runGames('naive', march, N, SEED, { clawWindup: true });
  assert.ok(s.clawArms > 0, `au moins une griffe armée attendue, obtenu ${s.clawArms}`);
  assert.equal(s.games, N);
});

test('clawWindup: false ⇒ aucune annonce clawArm', () => {
  assert.equal(runGames('naive', march, N, SEED, { clawWindup: false }).clawArms, 0);
});

test('option absente ⇒ identique à clawWindup: false (aucun changement par défaut)', () => {
  const def = runGames('naive', march, N, SEED);
  const off = runGames('naive', march, N, SEED, { clawWindup: false });
  assert.equal(def.clawArms, 0);
  assert.deepEqual(def, off, 'les valeurs par défaut des mesures existantes ne bougent pas');
});

test('lisibilité : morts sans dégât T = 0 ; métriques présentes', () => {
  const s = runGames('naive', march, N, SEED);
  assert.equal(s.deathsWithoutTermDamage, 0);
  assert.ok(s.shareTicksVisible >= 0 && s.shareTicksVisible <= 1);
  assert.ok(s.meanTeleports >= 0);
});
