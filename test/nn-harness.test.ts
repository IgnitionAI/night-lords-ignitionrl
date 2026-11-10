// Harnais de mesure NN : idempotence sur une graine, et interdiction d'écraser les artefacts b3 gelés.
// Exécution : `bun test test/nn-harness.test.ts` (aucun entraînement PPO, aucun tfjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FROZEN_ARTIFACTS,
  SMOKE_N,
  SMOKE_SEED_BASE,
  fingerprintFrozen,
  isFrozenArtifact,
  assertSafeWritePath,
  writeHarnessReport,
  runMeasure,
  comparableMetrics,
  parseHarnessArgs,
  runCli,
} from '../src/nn-harness.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const B3_EVAL = join(ROOT, 'mesures/eval-b3.json');
const POLICY = join(ROOT, 'policies/current.json');
const POLICY_FULL = join(ROOT, 'policies/current-full.json');

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('les chemins b3 / politiques courantes sont gelés', () => {
  assert.equal(isFrozenArtifact('mesures/eval-b3.json', ROOT), true);
  assert.equal(isFrozenArtifact('policies/current.json', ROOT), true);
  assert.equal(isFrozenArtifact('policies/current-full.json', ROOT), true);
  assert.equal(isFrozenArtifact('policies/b3/current.json', ROOT), true);
  assert.equal(isFrozenArtifact('policies/b3/current-full.json', ROOT), true);
  assert.equal(isFrozenArtifact('runs/b3/metrics.jsonl', ROOT), true);
  assert.equal(isFrozenArtifact('runs/eval-b3-snap700-n50.json', ROOT), true);
  assert.equal(isFrozenArtifact('mesures/nn-scratch/smoke.json', ROOT), false);
  assert.equal(isFrozenArtifact('runs/nn-scratch/actor.json', ROOT), false);
  assert.ok(FROZEN_ARTIFACTS.some(p => p.startsWith('policies')));
});

test('assertSafeWritePath refuse un artefact gelé', () => {
  assert.throws(() => assertSafeWritePath('mesures/eval-b3.json', ROOT), /gelé|frozen/i);
  assert.throws(() => assertSafeWritePath('policies/current.json', ROOT), /gelé|frozen/i);
  assert.throws(() => assertSafeWritePath(join(ROOT, 'runs/b3/full.json'), ROOT), /gelé|frozen/i);
  assert.doesNotThrow(() => assertSafeWritePath('mesures/nn-scratch/smoke.json', ROOT));
});

test('mesure sur une graine : deux passes identiques (hors horloge)', () => {
  const a = runMeasure({ pack: POLICY, n: 1, seedBase: SMOKE_SEED_BASE, opps: ['march'], clawWindup: false, root: ROOT });
  const b = runMeasure({ pack: POLICY, n: 1, seedBase: SMOKE_SEED_BASE, opps: ['march'], clawWindup: false, root: ROOT });
  assert.equal(a.seeds, `${SMOKE_SEED_BASE}..${SMOKE_SEED_BASE}`);
  assert.equal(a.clawWindup, false);
  assert.equal(a.comparableToB3, false, 'n=1 / seed 910000 n\'est pas l\'éval b3');
  assert.deepEqual(comparableMetrics(a), comparableMetrics(b));
  assert.equal(a.results.march.games, 1);
});

test('écrire le rapport n\'écrase pas les artefacts b3', () => {
  const before = {
    eval: sha(B3_EVAL),
    policy: sha(POLICY),
    full: sha(POLICY_FULL),
    frozen: fingerprintFrozen(ROOT),
  };
  const dir = mkdtempSync(join(tmpdir(), 'nn-harness-'));
  const out = join(dir, 'smoke.json');
  const report = runMeasure({ pack: 'naive', n: SMOKE_N, seedBase: SMOKE_SEED_BASE, opps: ['march'], clawWindup: false, root: ROOT });
  writeHarnessReport(out, report, ROOT);
  assert.equal(readFileSync(out, 'utf8').includes('"kind": "nn-harness-measure"'), true);
  assert.throws(() => writeHarnessReport(B3_EVAL, report, ROOT), /gelé|frozen/i);
  assert.throws(() => writeHarnessReport(POLICY, report, ROOT), /gelé|frozen/i);
  assert.equal(sha(B3_EVAL), before.eval);
  assert.equal(sha(POLICY), before.policy);
  assert.equal(sha(POLICY_FULL), before.full);
  assert.deepEqual(fingerprintFrozen(ROOT), before.frozen);
  rmSync(dir, { recursive: true, force: true });
});

test('le CLI refuse --updates (pas de job PPO)', () => {
  assert.throws(() => parseHarnessArgs(['--updates', '2000']), /entraînement refusé/);
  assert.throws(() => parseHarnessArgs(['--train']), /entraînement refusé/);
  assert.throws(() => parseHarnessArgs(['--n', '200']), /hors smoke/);
  assert.throws(() => runCli(['--out', 'policies/current.json'], ROOT), /gelé|frozen|bac à sable/);
  const cfg = parseHarnessArgs([]);
  assert.equal(cfg.mode, 'measure');
  assert.equal(cfg.n, SMOKE_N);
  assert.equal(cfg.seedBase, SMOKE_SEED_BASE);
  assert.equal(cfg.out, 'mesures/nn-scratch/smoke.json');
});

test('writeHarnessReport refuse mesures/eval-b3.json avant tout writeFile', () => {
  const before = sha(B3_EVAL);
  const probe = JSON.parse(readFileSync(B3_EVAL, 'utf8')) as { results: { march: { packWins: number } } };
  assert.equal(probe.results.march.packWins, 190);
  assert.throws(() => writeHarnessReport('mesures/eval-b3.json', { kind: 'nn-harness-measure' }, ROOT), /gelé|frozen/i);
  assert.equal(sha(B3_EVAL), before);
});

/** Empreintes b3 publiées (avant promotion b4) — l'archive policies/b3/ doit rester byte-identique. */
const B3_ACTOR_SHA256 = '950b924f4ac96602836f53f6faac04a40ae6868d0a65f5aedd29dec81c1fef9f';
const B3_FULL_SHA256 = '7c4e37f9c625e5217103b9d1125ad830508ed1a4454ce87250ba56596ff1ba4c';

test('archive policies/b3/ est byte-identique à b3 ; current.json est b4', () => {
  const archived = join(ROOT, 'policies/b3/current.json');
  const archivedFull = join(ROOT, 'policies/b3/current-full.json');
  assert.equal(sha(archived), B3_ACTOR_SHA256);
  assert.equal(sha(archivedFull), B3_FULL_SHA256);
  const deployed = JSON.parse(readFileSync(POLICY, 'utf8')) as { version: string };
  const frozen = JSON.parse(readFileSync(archived, 'utf8')) as { version: string };
  assert.equal(frozen.version, 'runs/b3@2000');
  assert.equal(deployed.version, 'runs/b4@800');
  assert.notEqual(sha(POLICY), B3_ACTOR_SHA256);
});
