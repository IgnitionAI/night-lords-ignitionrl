// Gameplay de manche : conditions de fin historiques (gelées) + lisibilité d'état (horloge, objectifs,
// armes, rythme) sans changer les vitesses, l'espace d'observation ni les raisons de victoire.
// Exécution : `npm test` (ou `node --import tsx --test test/match-feel.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newWorld, step, MAX_TICKS, DT, T_CFG, NL_CFG, OBS_DIM, BEACON, ROLES, dist,
  type World, type TAction,
} from '../src/sim.ts';
import {
  formatClock, matchStatus, matchBeats, roundCard, hudMarkup, roundMarkup, HOLD_WARN_S,
} from '../src/match.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const HOLD = [0, 0, 0, 0];
const CLAW = [7, 0, 0, 0];

function rearClawWorld(opts?: { clawWindup?: boolean }): World {
  const w = newWorld(20261109, { x: 21.2, y: 12, facing: 0 }, opts);
  const n = w.nls[0];
  n.x = 20; n.y = 12; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0; n.stunTicks = 0;
  n.belief = { valid: false, x: 21.2, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  return w;
}

function frontClawWorld(): World {
  const w = newWorld(20261109, { x: 20, y: 12, facing: 0 }, { clawWindup: false });
  const n = w.nls[0];
  n.x = 21.2; n.y = 12; n.facing = Math.PI; n.alive = true; n.cd = 0; n.armTicks = 0;
  n.belief = { valid: false, x: 20, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  return w;
}

function atBeacon(): World {
  return newWorld(20261109, { x: BEACON.x, y: BEACON.y, facing: Math.PI });
}

// --- Contrats gelés : un drift ici casserait b3 / locomotion, donc on le lit, on ne le « corrige » pas.

test('contrats gelés : vitesses, horloge, armure, observation', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
  assert.equal(MAX_TICKS, 1200);
  assert.equal(T_CFG.channel, 60);
  assert.equal(T_CFG.hp, 30);
  assert.equal(OBS_DIM, 32);
  assert.equal(DT, 0.1);
});

test('victoire meute : armure à 0 → pack, « Terminator abattu »', () => {
  const w = rearClawWorld({ clawWindup: false });
  w.t.hp = 1;
  step(w, IDLE, CLAW);
  assert.equal(w.done, true);
  assert.equal(w.winner, 'pack');
  assert.equal(w.reason, 'Terminator abattu');
});

test('victoire Terminator : meute à terre → « meute anéantie »', () => {
  const w = newWorld(7);
  for (const n of w.nls) n.alive = false;
  step(w, IDLE, HOLD);
  assert.equal(w.done, true);
  assert.equal(w.winner, 'terminator');
  assert.equal(w.reason, 'meute anéantie');
});

test('victoire Terminator : 6 s à la balise sans coup qui blesse → « téléporté »', () => {
  const w = atBeacon();
  assert.ok(dist(w.t.x, w.t.y, BEACON.x, BEACON.y) <= BEACON.r);
  for (let i = 0; i < T_CFG.channel; i++) {
    assert.equal(w.done, false, `encore en cours au tick ${w.tick}`);
    step(w, IDLE, HOLD);
  }
  assert.equal(w.t.channel, T_CFG.channel);
  assert.equal(w.done, true);
  assert.equal(w.winner, 'terminator');
  assert.equal(w.reason, 'téléporté');
});

test('victoire Terminator : MAX_TICKS → « temps écoulé, il a tenu »', () => {
  const w = newWorld(11, { x: 3, y: 12, facing: 0 });
  w.tick = MAX_TICKS - 1;
  step(w, IDLE, HOLD);
  assert.equal(w.done, true);
  assert.equal(w.winner, 'terminator');
  assert.equal(w.reason, 'temps écoulé, il a tenu');
  assert.equal(w.tick, MAX_TICKS);
});

test('la canalisation se coupe si un coup blesse, pas si la griffe tape l\'avant', () => {
  const hurt = atBeacon();
  for (let i = 0; i < 10; i++) step(hurt, IDLE, HOLD);
  assert.equal(hurt.t.channel, 10);
  const n = hurt.nls[0];
  n.x = hurt.t.x - 1.2; n.y = hurt.t.y; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0;
  hurt.t.facing = 0; // Talos dans le dos
  step(hurt, IDLE, CLAW); // windup défaut : annonce, pas encore de dégât
  assert.equal(hurt.t.channel, 11, 'l\'annonce ne coupe pas');
  step(hurt, IDLE, HOLD);
  step(hurt, IDLE, HOLD);
  assert.equal(hurt.done, false);
  assert.equal(hurt.t.channel, 0, 'l\'impact qui blesse remet la canalisation à zéro');

  const w2 = frontClawWorld();
  w2.t.x = BEACON.x; w2.t.y = BEACON.y; w2.t.facing = 0;
  w2.nls[0].x = BEACON.x + 1.2; w2.nls[0].y = BEACON.y;
  for (let i = 0; i < 8; i++) step(w2, IDLE, HOLD);
  const ch = w2.t.channel;
  assert.ok(ch >= 8);
  step(w2, IDLE, CLAW);
  assert.equal(w2.t.hp, T_CFG.hp, 'l\'avant n\'enlève pas d\'armure');
  assert.equal(w2.t.channel, ch + 1, 'une griffe de face n\'interrompt pas la balise');
});

test('quitter la zone de balise remet la canalisation à zéro', () => {
  const w = atBeacon();
  for (let i = 0; i < 12; i++) step(w, IDLE, HOLD);
  assert.equal(w.t.channel, 12);
  w.t.x = 3; w.t.y = 12;
  step(w, IDLE, HOLD);
  assert.equal(w.t.channel, 0);
  assert.equal(w.done, false);
});

// --- Couche de lisibilité : dérivée de l'état, aucune règle nouvelle.

test('horloge : M:SS, pression dans les 15 dernières secondes', () => {
  assert.equal(formatClock(1200), '2:00');
  assert.equal(formatClock(1), '0:00');
  assert.equal(formatClock(150), '0:15');
  assert.equal(formatClock(0), '0:00');
  const w = newWorld(1);
  w.tick = MAX_TICKS - HOLD_WARN_S / DT;
  const s = matchStatus(w);
  assert.equal(s.clock, '0:15');
  assert.equal(s.timePressure, true);
  assert.equal(s.phase, 'hold');
  w.tick = 10;
  const hunt = matchStatus(w);
  assert.equal(hunt.clock, '1:59');
  assert.equal(hunt.timePressure, false);
  assert.equal(hunt.phase, 'hunt');
});

test('statut : canalisation, dernier frère, armes', () => {
  const w = atBeacon();
  step(w, IDLE, HOLD);
  const ch = matchStatus(w);
  assert.equal(ch.inBeacon, true);
  assert.equal(ch.channeling, true);
  assert.equal(ch.phase, 'channel');
  assert.equal(ch.packAlive, 4);
  assert.deepEqual(ch.roster.map(r => r.role), [...ROLES]);
  assert.match(ch.objectiveLine, /balise/i);

  w.nls[0].alive = false; w.nls[1].alive = false; w.nls[2].alive = false;
  w.t.x = 3; w.t.y = 12; w.t.channel = 0;
  const last = matchStatus(w);
  assert.equal(last.packAlive, 1);
  assert.equal(last.phase, 'lastStand');
  assert.match(last.objectiveLine, /dernier/i);

  w.t.ammo = 4; w.t.reloadLeft = 20; w.t.fistCharge = 8; w.t.staggerTicks = 2;
  const arms = matchStatus(w);
  assert.match(arms.weapons.bolterLabel, /recharge/);
  assert.match(arms.weapons.fistLabel, /charge/);
  assert.equal(arms.weapons.ammo, 4);
  assert.equal(arms.weapons.staggered, true);
});

test('rythme : beats canalisation, coupure, dernier frère, pression horaire', () => {
  const w = atBeacon();
  const before = matchStatus(w);
  assert.equal(before.channeling, false);
  step(w, IDLE, HOLD);
  const beats = matchBeats(before, matchStatus(w));
  assert.ok(beats.some(b => b.kind === 'channelStart'));

  const mid = matchStatus(w);
  w.t.x = 3; w.t.y = 12;
  step(w, IDLE, HOLD);
  const broke = matchBeats(mid, matchStatus(w));
  assert.ok(broke.some(b => b.kind === 'channelBreak'));

  const a = newWorld(3);
  a.nls[1].alive = false; a.nls[2].alive = false;
  const s0 = matchStatus(a);
  a.nls[3].alive = false;
  const s1 = matchStatus(a);
  assert.ok(matchBeats(s0, s1).some(b => b.kind === 'lastStand'));

  a.tick = MAX_TICKS - HOLD_WARN_S / DT;
  const s2 = matchStatus(a);
  assert.ok(matchBeats(s1, s2).some(b => b.kind === 'timePressure'));
});

test('HUD : objectifs, horloge, roster, munitions — pas seulement une barre d\'armure', () => {
  const w = newWorld(5, { x: 3, y: 12, facing: 0 });
  const html = hudMarkup(matchStatus(w), { roundNo: 1, score: { pack: 0, term: 0 } });
  assert.match(html, /2:00|1:59/);
  assert.match(html, /balise/i);
  assert.match(html, /Talos/);
  assert.match(html, /30\/30/);
  assert.match(html, /bolter/i);
  assert.match(html, /gantelet/i);
  assert.match(html, /Objectif/);
});

test('carte de fin : raison historique + durée + survivants', () => {
  const w = rearClawWorld({ clawWindup: false });
  w.t.hp = 1;
  step(w, IDLE, CLAW);
  const card = roundCard(w, { roundNo: 2 });
  assert.equal(card.winner, 'pack');
  assert.equal(card.reason, 'Terminator abattu');
  assert.match(card.title, /meute/i);
  assert.ok(card.seconds > 0);
  const html = roundMarkup(card);
  assert.match(html, /Terminator abattu/);
  assert.match(html, /manche 2/i);
  assert.match(html, /Entrée/);
});
