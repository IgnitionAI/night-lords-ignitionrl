import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOBS_DIM } from '../src/tobs.ts';
import { trainBehaviorCloning } from '../src/bc-lib.ts';
import { forward, bcAct } from '../src/policy.ts';
import { bcGhost } from '../src/tactics.ts';
import { newWorld, step } from '../src/sim.ts';
import { packActs } from '../src/evallib.ts';
import { mulberry32 } from '../src/rng.ts';
import type { Recording } from '../src/recorder.ts';
import type { ActorJSON } from '../src/policy.ts';
import { rl3Handle, createRl3State, RL3_RECORD_MAX_BYTES } from '../src/rl3-http.ts';

function synthRec(n: number): Recording {
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push({
      tick: i, x: 3, y: 8, facing: 0,
      a: { fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false },
      contact: 0, nearest: 99,
      o: Array.from({ length: TOBS_DIM }, (_, k) => ((i * 3 + k) % 5) / 5),
      move: 18, atk: 0,
    });
  }
  return {
    createdAt: '2026-11-12T00:00:00.000Z',
    source: 'oracle synthétique (pas un humain)',
    provenance: { kind: 'synthetic', label: 'oracle synthétique', oracle: 'replay-fixture' },
    frames,
    result: 'synthétique',
  };
}

test('sauvegarde et rechargement : même forward sur la même observation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-rp-'));
  try {
    const out = join(dir, 'ghost.json');
    trainBehaviorCloning({ recordings: [synthRec(40)], out, epochs: 2, patience: 2, seed: 3, hidden: 16 });
    const a = JSON.parse(readFileSync(out, 'utf8')) as ActorJSON;
    const copyPath = join(dir, 'ghost-copy.json');
    writeFileSync(copyPath, JSON.stringify(a));
    const b = JSON.parse(readFileSync(copyPath, 'utf8')) as ActorJSON;
    const x = Array.from({ length: TOBS_DIM }, (_, i) => i / TOBS_DIM);
    assert.deepEqual(forward(b, x), forward(a, x));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('inférence figée (temp=0) : deux appels identiques, pas de tirage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-fz-'));
  try {
    const out = join(dir, 'ghost.json');
    trainBehaviorCloning({ recordings: [synthRec(40)], out, epochs: 1, patience: 1, seed: 4, hidden: 16 });
    const m = JSON.parse(readFileSync(out, 'utf8')) as ActorJSON;
    const x = Array.from({ length: TOBS_DIM }, (_, i) => (i % 3) / 3);
    const rng = mulberry32(99);
    assert.deepEqual(bcAct(m, x, rng, 0), bcAct(m, x, rng, 0));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('replay dans le vrai environnement : une manche se termine, politique figée', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-env-'));
  try {
    const out = join(dir, 'ghost.json');
    trainBehaviorCloning({ recordings: [synthRec(40)], out, epochs: 1, patience: 1, seed: 5, hidden: 16 });
    const m = JSON.parse(readFileSync(out, 'utf8')) as ActorJSON;
    const seed = 4242;
    const t = bcGhost(m, seed, 0);
    const w = newWorld(seed, undefined, { clawWindup: false });
    const rng = mulberry32(seed);
    let ticks = 0;
    while (!w.done && ticks < 80) {
      const a = t(w);
      step(w, a, packActs('naive', w, rng));
      ticks++;
    }
    assert.ok(ticks >= 1);
    assert.ok(w.tick === ticks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API RL3 : erreur explicite sans données / sans checkpoint ; pas d\'entraînement concurrent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-api-'));
  try {
    const st = createRl3State(dir);
    const missRec = await rl3Handle('POST', '/api/rl3/train', '{}', st);
    assert.equal(missRec.status, 400);
    assert.match(JSON.stringify(missRec.json), /donn|recording|absent/i);
    const missGhost = await rl3Handle('GET', '/api/rl3/ghost', '', st);
    assert.equal(missGhost.status, 404);
    assert.match(JSON.stringify(missGhost.json), /checkpoint|absent/i);
    st.busy = true;
    const busy = await rl3Handle('POST', '/api/rl3/train', JSON.stringify({ seed: 1, epochs: 1 }), st);
    assert.equal(busy.status, 409);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API RL3 : un verrou laissé par un pid mort n\'empêche pas un nouvel entraînement', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-lock-'));
  try {
    const rec = synthRec(40);
    const recPath = join(dir, 'recordings/rl3/round-1.json');
    mkdirSync(join(dir, 'recordings/rl3'), { recursive: true });
    mkdirSync(join(dir, 'runs/rl3'), { recursive: true });
    writeFileSync(recPath, JSON.stringify(rec));
    writeFileSync(join(dir, 'runs/rl3/state.json'), JSON.stringify({
      busy: true,
      busyPid: 999999999,
      recordings: [recPath],
      ghostPath: null,
      runPath: null,
    }));
    const st = createRl3State(dir);
    const r = await rl3Handle('POST', '/api/rl3/train', JSON.stringify({ seed: 1, epochs: 1 }), st);
    assert.equal(r.status, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('API RL3 : POST /api/rl3/record > 5 Mo → 413', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rl3-413-'));
  try {
    const st = createRl3State(dir);
    const body = 'x'.repeat(RL3_RECORD_MAX_BYTES + 1);
    const r = await rl3Handle('POST', '/api/rl3/record', body, st);
    assert.equal(r.status, 413);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
