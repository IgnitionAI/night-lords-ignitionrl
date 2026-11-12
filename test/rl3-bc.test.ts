import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOBS_DIM } from '../src/tobs.ts';
import { trainBehaviorCloning, type BcTrainResult } from '../src/bc-lib.ts';
import type { Recording } from '../src/recorder.ts';

function synthRec(n: number): Recording {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const fwd = i % 3 === 0 ? 1 : 0;
    const turn = i % 5 === 0 ? 1 : 0;
    const bolt = i % 17 === 0;
    frames.push({
      tick: i,
      x: 3,
      y: 8,
      facing: 0,
      a: { fwd, strafe: 0, turn, bolt, fist: false },
      contact: 0,
      nearest: 99,
      o: Array.from({ length: TOBS_DIM }, (_, k) => ((i + k) % 7) / 7),
      move: (fwd + 1) * 9 + 3 + (turn + 1),
      atk: bolt ? 1 : 0,
    });
  }
  return {
    createdAt: '2026-11-12T00:00:00.000Z',
    source: 'oracle synthétique (pas un humain)',
    provenance: { kind: 'synthetic', label: 'oracle synthétique', oracle: 'fixture-bc' },
    frames,
    result: 'synthétique — fixture de test',
  };
}

test('BC : métriques par tête et jointes vs majorité, écrites dans le JSON de run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-bc-'));
  try {
    const out = join(dir, 'ghost.json');
    const runPath = join(dir, 'run.json');
    const r: BcTrainResult = trainBehaviorCloning({
      recordings: [synthRec(80)],
      out,
      runJson: runPath,
      epochs: 2,
      patience: 2,
      seed: 1,
      hidden: 16,
    });
    const run = JSON.parse(readFileSync(runPath, 'utf8'));
    assert.equal(run.provenance.kind, 'synthetic');
    assert.equal(run.seed, 1);
    assert.equal(run.budget.epochs, 2);
    assert.ok(run.accVal);
    assert.ok(run.majorityVal);
    for (const k of ['fwd', 'strafe', 'turn', 'atk', 'joint'] as const) {
      assert.equal(typeof run.accVal[k], 'number');
      assert.equal(typeof run.majorityVal[k], 'number');
      assert.equal(run.accVal[k], r.meta.accVal?.[k]);
    }
    assert.equal(run.disclaimer, 'données synthétiques : aucune métrique de style humain');
    const ghost = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(ghost.obsDim, TOBS_DIM);
    assert.equal(ghost.nAct, 12);
    assert.equal(ghost.meta.seed, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BC : un mélange humain + synthétique est kind mixed, disclaimer synthétique', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-mix-'));
  try {
    const human: Recording = { ...synthRec(40), source: 'joueur', provenance: { kind: 'human', label: 'joueur' } };
    const synth: Recording = synthRec(40);
    const r = trainBehaviorCloning({
      recordings: [human, synth],
      out: join(dir, 'ghost.json'),
      runJson: join(dir, 'run.json'),
      epochs: 1,
      patience: 1,
      seed: 1,
      hidden: 16,
    });
    assert.equal(r.meta.provenance.kind, 'mixed');
    assert.match(String(r.meta.disclaimer), /synthétique/);
    const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    assert.equal(run.provenance.kind, 'mixed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BC : refuse un recording sans observation', () => {
  assert.throws(
    () => trainBehaviorCloning({
      recordings: [{ createdAt: '', source: 'joueur synthétique wallHugger', frames: [{ tick: 0, x: 0, y: 0, facing: 0, a: { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }, contact: 0, nearest: 99 }] }],
      out: '/tmp/no.json',
      epochs: 1,
      seed: 1,
    }),
    /observation|incompatible|vide/,
  );
});
