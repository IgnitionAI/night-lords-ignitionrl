import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOBS_DIM } from '../src/tobs.ts';
import { runDagger } from '../src/dagger.ts';
import type { Recording } from '../src/recorder.ts';

function synthRec(n: number): Recording {
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push({
      tick: i, x: 3, y: 8, facing: 0,
      a: { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false },
      contact: 0, nearest: 99,
      o: Array.from({ length: TOBS_DIM }, (_, k) => (k === 12 ? 0.2 : 0)),
      move: 18, atk: 0,
    });
  }
  return {
    createdAt: '2026-11-12T00:00:00.000Z',
    source: 'oracle synthétique (pas un humain)',
    provenance: { kind: 'synthetic', label: 'oracle synthétique', oracle: 'dagger-fixture' },
    frames,
    result: 'synthétique',
  };
}

test('DAgger : agrège des corrections expertes sans écraser D0, val figée, budget borné', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-dag-'));
  try {
    const r = runDagger({
      recordings: [synthRec(40)],
      outDir: dir,
      seed: 2,
      iters: 2,
      epochs: 1,
      patience: 1,
      hidden: 16,
      maxTicks: 12,
      maxNewFrames: 12,
      pack: 'naive',
      expert: 'wallHugger',
    });
    assert.equal(r.provenance.kind, 'synthetic');
    assert.equal(r.disclaimer, 'oracle synthétique : aucune métrique de style humain');
    assert.ok(r.initialFrames >= 40);
    assert.ok(r.aggregatedFrames > r.initialFrames);
    assert.equal(r.valIndexMax, r.initialFrames - 1);
    assert.ok(r.itersUsed <= 2);
    assert.ok(r.newFrames <= 12 * 2);
    const names = readdirSync(dir).filter(n => n.startsWith('ghost-iter-'));
    assert.ok(names.length >= 1);
    const last = JSON.parse(readFileSync(join(dir, r.checkpoint), 'utf8'));
    assert.match(String(last.version), /dagger/);
    assert.equal(last.meta.provenance.kind, 'synthetic');
    assert.equal(last.meta.initialFrames, r.initialFrames);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
