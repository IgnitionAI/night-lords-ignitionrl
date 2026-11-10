// Curriculum / shaping b4 et sélection de politique : hors sim.ts, reproductibles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, dist, T_CFG, BEACON, type World } from '../src/sim.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import {
  applyB4Shaping,
  applyB5Shaping,
  applyB6Shaping,
  pickB4Opp,
  pickB5Opp,
  pickB6Opp,
  parseTrainPreset,
  wilsonInterval,
  comparePackRates,
  policyFileFromQuery,
  B4_TRAIN,
  B5_TRAIN,
  B6_TRAIN,
  B5_SHAPE,
  B6_SHAPE,
} from '../src/train-b4.ts';
import { mulberry32 } from '../src/rng.ts';

test('sans ?policy le jeu charge current (b5) ; ?policy=b6 lit le candidat ; archives b4/b3', () => {
  assert.deepEqual(policyFileFromQuery(null), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery(''), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('current'), { id: 'current', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('b5'), { id: 'b5', file: 'current.json' });
  assert.deepEqual(policyFileFromQuery('b6'), { id: 'b6', file: 'candidates/b6/actor.json' });
  assert.deepEqual(policyFileFromQuery('b6p'), { id: 'b6p', file: 'candidates/b6p/actor.json' });
  assert.deepEqual(policyFileFromQuery('b4'), { id: 'b4', file: 'b4/current.json' });
  assert.deepEqual(policyFileFromQuery('b3'), { id: 'b3', file: 'b3/current.json' });
  assert.deepEqual(policyFileFromQuery('inconnu'), { id: 'current', file: 'current.json' });
});

test('parseTrainPreset : sans drapeau, hyperparams b3 inchangés', () => {
  const d = parseTrainPreset({});
  assert.equal(d.preset, '');
  assert.equal(d.shapeB4, false);
  assert.equal(d.curriculumB4, false);
  assert.equal(d.shapeB5, false);
  assert.equal(d.curriculumB5, false);
  assert.equal(d.shapeB6, false);
  assert.equal(d.curriculumB6, false);
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
  const b6 = parseTrainPreset({ preset: 'b6' });
  assert.equal(b6.preset, 'b6');
  assert.equal(b6.shapeB6, true);
  assert.equal(b6.curriculumB6, true);
  assert.equal(b6.shapeB5, false);
  assert.equal(b6.shapeB4, false);
  assert.equal(b6.lr, B6_TRAIN.lr);
  assert.equal(b6.entCoef, B6_TRAIN.entCoef);
  assert.equal(b6.seed, B6_TRAIN.seed);
  assert.equal(B6_TRAIN.init, 'policies/candidates/b5/full.json');
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

test('curriculum b6 : seed fixe ⇒ même séquence ; mix vu encore présent', () => {
  const rngA = mulberry32(6), rngB = mulberry32(6);
  const a = Array.from({ length: 400 }, (_, i) => pickB6Opp(rngA, i / 399).opp);
  const b = Array.from({ length: 400 }, (_, i) => pickB6Opp(rngB, i / 399).opp);
  assert.deepEqual(a, b);
  const counts = Object.fromEntries([...new Set(a)].map(k => [k, a.filter(x => x === k).length]));
  assert.ok((counts.kiter ?? 0) >= 40, `kiter trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.elite ?? 0) >= 30, `elite trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.march ?? 0) >= 8, `march trop rare: ${JSON.stringify(counts)}`);
  assert.ok((counts.turret ?? 0) >= 8);
  for (const name of a) {
    assert.ok(POOL[name] || UNSEEN[name], `opp inconnu ${name}`);
  }
});

test('shaping b6 : harcèlement / encerclement > fuite ; melee tôt pénalisée ; kill trop rapide < tempo', () => {
  const w = newWorld(17, undefined, { clawWindup: false });
  w.t.x = 20; w.t.y = 12; w.t.facing = 0; w.tick = 50;
  w.nls[0].alive = true; w.nls[0].x = 28; w.nls[0].y = 12;
  w.nls[1].alive = true; w.nls[1].x = 12; w.nls[1].y = 12;
  w.nls[2].alive = true; w.nls[2].x = 20; w.nls[2].y = 20;
  w.nls[3].alive = true; w.nls[3].x = 20; w.nls[3].y = 4;
  const encircle = applyB6Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  const flee = (() => {
    const w2 = newWorld(17, undefined, { clawWindup: false });
    w2.t.x = 20; w2.t.y = 12; w2.t.facing = 0; w2.tick = 50;
    for (const n of w2.nls) { n.alive = true; n.x = 38; n.y = 22; }
    return applyB6Shaping(w2, [0, 0, 0, 0], [false, false, false, false]);
  })();
  const encSum = encircle.reduce((s, r) => s + r, 0);
  const fleeSum = flee.reduce((s, r) => s + r, 0);
  assert.ok(encSum > fleeSum, `encerclement ${encSum} vs fuite ${fleeSum}`);

  const earlyMelee = (() => {
    const w3 = newWorld(17, undefined, { clawWindup: false });
    w3.t.x = 20; w3.t.y = 12; w3.t.facing = 0; w3.tick = 40;
    w3.nls[0].alive = true; w3.nls[0].x = 21.2; w3.nls[0].y = 12;
    w3.nls[1].alive = w3.nls[2].alive = w3.nls[3].alive = false;
    return applyB6Shaping(w3, [0, 0, 0, 0], [false, false, false, false])[0];
  })();
  const lateMelee = (() => {
    const w3 = newWorld(17, undefined, { clawWindup: false });
    w3.t.x = 20; w3.t.y = 12; w3.t.facing = Math.PI; w3.tick = 400;
    w3.nls[0].alive = true; w3.nls[0].x = 21.2; w3.nls[0].y = 12;
    w3.nls[1].alive = w3.nls[2].alive = w3.nls[3].alive = false;
    return applyB6Shaping(w3, [0, 0, 0, 0], [false, false, false, false])[0];
  })();
  assert.ok(lateMelee > earlyMelee, `commit tardif ${lateMelee} vs rush ${earlyMelee}`);

  const earlyWin = (() => {
    const w4 = newWorld(17, undefined, { clawWindup: false });
    w4.done = true; w4.winner = 'pack'; w4.tick = 160;
    for (const n of w4.nls) n.alive = true;
    return applyB6Shaping(w4, [0, 0, 0, 0], [false, false, false, false])[0];
  })();
  const tempoWin = (() => {
    const w4 = newWorld(17, undefined, { clawWindup: false });
    w4.done = true; w4.winner = 'pack'; w4.tick = 450;
    for (const n of w4.nls) n.alive = true;
    return applyB6Shaping(w4, [0, 0, 0, 0], [false, false, false, false])[0];
  })();
  assert.ok(tempoWin > earlyWin, `victoire 45 s ${tempoWin} vs 16 s ${earlyWin}`);
  assert.ok(B6_SHAPE.earlyHit <= -5);
  assert.ok(B6_SHAPE.stallFar < 0);
  assert.ok(B6_SHAPE.hpHold > 0);
  assert.ok(B6_SHAPE.visible > 0);
  assert.ok(B6_SHAPE.unseenPack < 0);
  assert.ok(B6_SHAPE.outOfCone < 0);
  assert.ok(B6_SHAPE.boltLane < 0);
  assert.ok(B6_SHAPE.escape < 0);
});

test('shaping b6 : cône de vision du T récompensé ; camp hors champ / spawn pénalisés', () => {
  const vis = newWorld(17, undefined, { clawWindup: false });
  vis.t.x = 20; vis.t.y = 12; vis.t.facing = 0; vis.tick = 80;
  vis.nls[0].alive = true; vis.nls[0].x = 28; vis.nls[0].y = 16;
  vis.nls[1].alive = vis.nls[2].alive = vis.nls[3].alive = false;
  const visR = applyB6Shaping(vis, [0, 0, 0, 0], [false, false, false, false])[0];

  const rearFar = newWorld(17, undefined, { clawWindup: false });
  rearFar.t.x = 20; rearFar.t.y = 12; rearFar.t.facing = 0; rearFar.tick = 80;
  rearFar.nls[0].alive = true; rearFar.nls[0].x = 12; rearFar.nls[0].y = 12;
  rearFar.nls[1].alive = rearFar.nls[2].alive = rearFar.nls[3].alive = false;
  const rearR = applyB6Shaping(rearFar, [0, 0, 0, 0], [false, false, false, false])[0];

  const spawnCamp = newWorld(17, undefined, { clawWindup: false });
  spawnCamp.t.x = 3; spawnCamp.t.y = 6.6; spawnCamp.t.facing = 0; spawnCamp.tick = 80;
  spawnCamp.nls[0].alive = true; spawnCamp.nls[0].x = 33; spawnCamp.nls[0].y = 12;
  spawnCamp.nls[1].alive = spawnCamp.nls[2].alive = spawnCamp.nls[3].alive = false;
  const campR = applyB6Shaping(spawnCamp, [0, 0, 0, 0], [false, false, false, false])[0];

  assert.ok(visR > rearR, `cône ${visR} vs dos hors champ ${rearR}`);
  assert.ok(visR > campR, `cône ${visR} vs spawn ${campR}`);
});

test('shaping n\'appelle pas step : la sim reste la source des rewards de base', () => {
  const w = newWorld(3, undefined, { clawWindup: false });
  const t = POOL.march();
  const before = { x: w.t.x, hp: w.t.hp, tick: w.tick };
  applyB4Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  applyB5Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  applyB6Shaping(w, [0, 0, 0, 0], [false, false, false, false]);
  assert.equal(w.t.x, before.x);
  assert.equal(w.t.hp, before.hp);
  assert.equal(w.tick, before.tick);
  const { rewards } = step(w, t(w), [0, 0, 0, 0]);
  assert.equal(rewards.length, 4);
  assert.ok(dist(w.nls[0].x, w.nls[0].y, w.t.x, w.t.y) > 0);
});
