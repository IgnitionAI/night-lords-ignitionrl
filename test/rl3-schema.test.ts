import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecordingSchemaError, validateRecording, inferProvenance } from '../src/recording-schema.ts';
import { TOBS_DIM } from '../src/tobs.ts';
import type { Recording } from '../src/recorder.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function synthFrame(tick: number, overrides: Record<string, unknown> = {}) {
  return {
    tick,
    x: 3,
    y: 8,
    facing: 0,
    a: { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false },
    contact: 0,
    nearest: 99,
    o: Array.from({ length: TOBS_DIM }, (_, i) => (i === 0 ? 1 : 0)),
    move: 22,
    atk: 0,
    ...overrides,
  };
}

function synthRec(frames: Recording['frames']): Recording {
  return {
    createdAt: '2026-11-12T00:00:00.000Z',
    source: 'oracle synthétique (pas un humain)',
    provenance: { kind: 'synthetic', label: 'oracle synthétique', oracle: 'fixture' },
    frames,
    result: 'synthétique — fixture de test',
  };
}

test('rejette un enregistrement vide', () => {
  assert.throws(
    () => validateRecording(synthRec([])),
    (e: unknown) => e instanceof RecordingSchemaError && /vide/.test((e as Error).message),
  );
});

test('rejette un JSON corrompu (pas un objet Recording)', () => {
  assert.throws(
    () => validateRecording(null),
    (e: unknown) => e instanceof RecordingSchemaError && /corrompu|incompatible/.test((e as Error).message),
  );
  assert.throws(
    () => validateRecording({ source: 'x' }),
    RecordingSchemaError,
  );
});

test('jalon1/mesures/recording-synth.json est synthétique et incompatible (pas d\'observations)', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'jalon1/mesures/recording-synth.json'), 'utf8'));
  assert.equal(inferProvenance(raw.source).kind, 'synthetic');
  assert.throws(
    () => validateRecording(raw),
    (e: unknown) => e instanceof RecordingSchemaError && /observation|incompatible/.test((e as Error).message),
  );
});

test('accepte une fixture synthétique étiquetée avec o/move/atk', () => {
  const rec = validateRecording(synthRec([synthFrame(0), synthFrame(1)]));
  assert.equal(rec.provenance?.kind, 'synthetic');
  assert.equal(rec.frames.length, 2);
  assert.equal(rec.frames[0]!.o!.length, TOBS_DIM);
  assert.match(rec.source, /synthétique|oracle/i);
});

test('rejette une observation de mauvaise dimension', () => {
  assert.throws(
    () => validateRecording(synthRec([synthFrame(0, { o: [1, 2, 3] })])),
    RecordingSchemaError,
  );
});

test('reconstruit move/atk depuis a si absents, sans inventer o', () => {
  const rec = validateRecording(synthRec([synthFrame(0, { move: undefined, atk: undefined })]));
  assert.equal(rec.frames[0]!.move, 22);
  assert.equal(rec.frames[0]!.atk, 0);
});

test('n\'étiquette jamais une source joueur comme synthétique', () => {
  assert.equal(inferProvenance('joueur').kind, 'human');
  assert.equal(inferProvenance('joueur synthétique wallHugger').kind, 'synthetic');
});
