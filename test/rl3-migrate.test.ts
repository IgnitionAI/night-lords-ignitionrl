import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecordingSchemaError, validateRecording, inferProvenance } from '../src/recording-schema.ts';
import { MIGRATE_DISCLAIMER, migrateRecordingTo29D, needsObsMigration } from '../src/recording-migrate.ts';
import { TOBS_DIM } from '../src/tobs.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('le JSON jalon 1 pré-29D est synthétique et rejeté par le schéma strict', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/rl3/recording-jalon1-pre-29d.json'), 'utf8'));
  assert.equal(inferProvenance(raw.source).kind, 'synthetic');
  assert.equal(needsObsMigration(raw), true);
  assert.throws(
    () => validateRecording(raw),
    (e: unknown) => e instanceof RecordingSchemaError && /observation|incompatible/.test((e as Error).message),
  );
});

test('la migration jalon 1 produit un recording 29D synthetic validé', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/rl3/recording-jalon1-pre-29d.json'), 'utf8'));
  const rec = migrateRecordingTo29D(raw);
  const again = validateRecording(rec);
  assert.equal(again.provenance.kind, 'synthetic');
  assert.equal(again.frames.length, raw.frames.length);
  assert.equal(again.frames[0]!.o!.length, TOBS_DIM);
  assert.equal(again.frames[0]!.x, raw.frames[0].x);
  assert.equal(again.frames[0]!.a.fwd, raw.frames[0].a.fwd);
  assert.match(again.provenance.label, /synth/);
  assert.match(again.result ?? '', new RegExp(MIGRATE_DISCLAIMER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(needsObsMigration(again), false);
});

test('jalon1/mesures/recording-synth.json est au schéma 29D, provenance synthetic', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'jalon1/mesures/recording-synth.json'), 'utf8'));
  const rec = validateRecording(raw);
  assert.equal(rec.provenance.kind, 'synthetic');
  assert.equal(rec.frames.length, 134);
  assert.ok(rec.frames.every(fr => fr.o?.length === TOBS_DIM));
  assert.match(rec.source, /synthétique|wallHugger/i);
  assert.match(rec.result ?? '', /pas une partie humaine|synthétique/i);
});

test('la migration est déterministe (même seed → même o)', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/rl3/recording-jalon1-pre-29d.json'), 'utf8'));
  const a = migrateRecordingTo29D(raw, 1);
  const b = migrateRecordingTo29D(raw, 1);
  assert.deepEqual(a.frames.map(fr => fr.o), b.frames.map(fr => fr.o));
});
