// Curriculum / shaping b4 et sélection de politique : hors sim.ts, reproductibles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, dist, T_CFG, BEACON, type World } from '../src/sim.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import {
  applyB4Shaping,
  applyB5Shaping,
  pickB4Opp,
  pickB5Opp,
  parseTrainPreset,
  wilsonInterval,
  comparePackRates,
  policyFileFromQuery,
  B4_TRAIN,
  B5_TRAIN,
  B5_SHAPE,
} from '../src/train-b4.ts';
import { mulberry32 } from '../src/rng.ts';

test('sans ?policy le jeu charge current (b4) ; ?policy=b3 lit l\'archive', () => {
  assert.deepEqual(policyFileFromQuery(null), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery(''), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('current'), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('b4'), { id: 'b4', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('b3'), { id: 'b3', file: 'b3/current.json' });
  assert.deepEqual(policyFileFromQuery('b5'), { id: 'b5', file: 'candidates/b5/actor.json' });
  assert.deepEqual(policyFileFromQuery('inconnu'), { id: 'current', file: 'current.json' });
});

test('parseTrainPreset : sans drapeau, hyperparams b3 inchangés', () => {
  const d = parseTrainPreset({});
  assert.equal(d.preset, '');
  assert.equal(d.shapeB4, false);
  assert.equal(d.curriculumB4, false);
  assert.equal(d.shapeB5, false);
  assert.equal(d.curriculumB5, false);
  assert.equal(d.lr, 3e-4);
  assert.equal(d.entCoef, 0.01);
  const b4 = parseTrainPreset({ preset: 'b4' });
  assert.equal(b4.preset, 'b4');
  assert.equal(b4.shapeB4, true);
  assert.equal(b4.curriculumB4, true);
  assert.equal(b4.shapeB5, false);
  assert.equal(b4.lr, B4_TRAIN.lr);
  assert.equal(b4.entCoef, B4_TRAIN.entCoef);
  assert.equal(b4.seed, B4_TRAIN.seed);
  const b5 = parseTrainPreset({ preset: 'b5' });
  assert.equal(b5.preset, 'b5');
  assert.equal(b5.shapeB5, true);
  assert.equal(b5.curriculumB5, true);
  assert.equal(b5.shapeB4, false);
  assert.equal(b5.lr, B5_TRAIN.lr);
  assert.equal(b5.entCoef, B5_TRAIN.entCoef);
  assert.equal(b5.seed, B5_TRAIN.seed);
});

test('curriculum b4 : seed fixe ⇒ même séquence ; kiter et turret apparaissent', () => {
  const rngA = mulberry32(4), rngB = mulberry32(4);
  const a = Array.from({ length: 200 }, (_, i) => pickB4Opp(rngA, i / 199).opp);
  const b = Array.from({ length: 200 }, (_, i) => pickB4Opp(rngB, i / 199).opp);
  assert.deepEqual(a, b);
  const counts = Object.fromEntries([...new Set(a)].map(k => [k, a.filter(x => x === k).length]));
  assert.ok((counts.kiter ?? 0) >= 10, `kiter trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.turret ?? 0) >= 10, `turret trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.wallHugger ?? 0) >= 1);
  assert.ok((counts.elite ?? 0) >= 1);
  for (const name of a) {
    assert.ok(POOL[name] || UNSEEN[name], `opp inconnu ${name}`);
  }
});

test('shaping b4 : canalisation pénalise, un coup qui coupe la balise récompense', () => {
  const w: World = newWorld(7, undefined, { clawWindup: false });
  w.t.x = BEACON.x; w.t.y = BEACON.y; w.t.channel = Math.floor(T_CFG.channel * 0.5);
  const base = w.nls.map(() => 0);
  const died = w.nls.map(() => false);
  const shaped = applyB4Shaping(w, base, died);
  assert.ok(shaped.every((r, i) => w.nls[i].alive ? r < 0 : r === 0), `pénalité canal: ${shaped}`);
  w.t.lastHitTick = w.tick - 1;
  w.t.channel = 0;
  const afterHit = applyB4Shaping(w, base, died);
  assert.ok(afterHit.reduce((s, r) => s + r, 0) > shaped.reduce((s, r) => s + r, 0));
});

test('shaping b4 : mort supplémentaire et dispersion angulaire (flanc)', () => {
  const w = newWorld(11, undefined, { clawWindup: false });
  const died = [true, false, false, false];
  w.nls[0].alive = false;
  const base = [0, 0, 0, 0];
  const withDeath = applyB4Shaping(w, base, died);
  assert.ok(withDeath[0] < 0);
  // place 2 survivants aux antipodes autour du Terminator
  w.t.x = 20; w.t.y = 12;
  w.nls[1].x = 20; w.nls[1].y = 16; w.nls[1].alive = true;
  w.nls[2].x = 20; w.nls[2].y = 8; w.nls[2].alive = true;
  w.nls[3].alive = false;
  const spread = applyB4Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  const stacked = (() => {
    const w2 = newWorld(11, undefined, { clawWindup: false });
    w2.t.x = 20; w2.t.y = 12; w2.t.facing = 0;
    w2.nls[0].alive = true; w2.nls[0].x = 24; w2.nls[0].y = 12.1;
    w2.nls[1].alive = true; w2.nls[1].x = 24; w2.nls[1].y = 11.9;
    w2.nls[2].alive = false; w2.nls[3].alive = false;
    return applyB4Shaping(w2, [0, 0, 0, 0], [false, false, false, false]);
  })();
  const spreadSum = spread[1] + spread[2];
  const stackSum = stacked[0] + stacked[1];
  assert.ok(spreadSum > stackSum, `flanc ${spreadSum} vs tas ${stackSum}`);
});

test('wilson : n=200, 57 victoires (kiter b3) intervalle 95 % autour de 0,285', () => {
  const { lo, hi, p } = wilsonInterval(57, 200);
  assert.equal(+p.toFixed(3), 0.285);
  assert.ok(lo < 0.285 && hi > 0.285);
  assert.ok(hi - lo < 0.14 && hi - lo > 0.10);
});

test('comparePackRates signale une baisse > 3 pts et un gain hors bruit', () => {
  const rows = comparePackRates(
    { kiter: { packWins: 57, games: 200, packWinRate: 0.285 } },
    { kiter: { packWins: 80, games: 200, packWinRate: 0.4 } },
  );
  assert.equal(rows.kiter.deltaWins, 23);
  assert.ok(rows.kiter.deltaRate > 0.1);
  assert.equal(rows.kiter.regressionVsB3, false);
  const down = comparePackRates(
    { turret: { packWins: 111, games: 200, packWinRate: 0.555 } },
    { turret: { packWins: 90, games: 200, packWinRate: 0.45 } },
  );
  assert.equal(down.turret.regressionVsB3, true);
});

test('curriculum b5 : seed fixe ⇒ même séquence ; kiter et elite plus fréquents que b4', () => {
  const rngA = mulberry32(5), rngB = mulberry32(5);
  const a = Array.from({ length: 400 }, (_, i) => pickB5Opp(rngA, i / 399).opp);
  const b = Array.from({ length: 400 }, (_, i) => pickB5Opp(rngB, i / 399).opp);
  assert.deepEqual(a, b);
  const counts = Object.fromEntries([...new Set(a)].map(k => [k, a.filter(x => x === k).length]));
  const b4rng = mulberry32(5);
  const b4seq = Array.from({ length: 400 }, (_, i) => pickB4Opp(b4rng, i / 399).opp);
  const b4k = b4seq.filter(x => x === 'kiter').length;
  const b4e = b4seq.filter(x => x === 'elite').length;
  assert.ok((counts.kiter ?? 0) > b4k, `kiter b5 ${counts.kiter} vs b4 ${b4k}`);
  assert.ok((counts.elite ?? 0) > b4e, `elite b5 ${counts.elite} vs b4 ${b4e}`);
  assert.ok((counts.kiter ?? 0) >= 60, `kiter trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.elite ?? 0) >= 50, `elite trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.march ?? 0) >= 5);
  assert.ok((counts.turret ?? 0) >= 5);
  for (const name of a) {
    assert.ok(POOL[name] || UNSEEN[name], `opp inconnu ${name}`);
  }
});

test('shaping b5 : dos récompense plus que l\'avant ; canalisation plus dure que b4', () => {
  const w = newWorld(13, undefined, { clawWindup: false });
  w.t.x = 20; w.t.y = 12; w.t.facing = 0;
  w.nls[0].alive = true; w.nls[0].x = 24; w.nls[0].y = 12;
  w.nls[1].alive = true; w.nls[1].x = 16; w.nls[1].y = 12;
  w.nls[2].alive = false; w.nls[3].alive = false;
  const shaped = applyB5Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  assert.ok(shaped[1] > shaped[0], `dos ${shaped[1]} vs face ${shaped[0]}`);
  w.t.channel = Math.floor(T_CFG.channel * 0.5);
  const ch5 = applyB5Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  const ch4 = applyB4Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  assert.ok(ch5[0] < ch4[0], `canal b5 ${ch5[0]} vs b4 ${ch4[0]}`);
  assert.ok(B5_SHAPE.death < -0.4);
});

test('shaping n\'appelle pas step : la sim reste la source des rewards de base', () => {
  const w = newWorld(3, undefined, { clawWindup: false });
  const t = POOL.march();
  const before = { x: w.t.x, hp: w.t.hp, tick: w.tick };
  applyB4Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  applyB5Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  assert.equal(w.t.x, before.x);
  assert.equal(w.t.hp, before.hp);
  assert.equal(w.tick, before.tick);
  const { rewards } = step(w, t(w), [0, 0, 0, 0]);
  assert.equal(rewards.length, 4);
  assert.ok(dist(w.nls[0].x, w.nls[0].y, w.t.x, w.t.y) > 0);
});
