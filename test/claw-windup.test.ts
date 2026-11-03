// Test de la règle d'armement (2 ticks) des griffes : l'annonce `clawArm` ne fait aucun dégât, l'impact tombe au
// tick T+2 après re-vérification de la portée, et le drapeau `clawWindup: false` restitue exactement l'ancien
// comportement (dégâts dans le tick, aucun `clawArm`) — c'est la garantie de comparabilité avec les mesures b3.
// Exécution : `npm test` (ou `node --import tsx --test test/claw-windup.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, dist, NL_CFG, T_CFG, REWARD, type World, type TAction } from '../src/sim.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const AWAY: TAction = { ...IDLE, fwd: 1 }; // le Terminator recule (facing 0, donc vers +x, à l'opposé de la meute)
/** Talos (NL 0) choisit les griffes, les trois autres tiennent leur position. */
const CLAW = [7, 0, 0, 0];
const HOLD = [0, 0, 0, 0];

/**
 * Monde reproductible : Talos posé à (20, 12), sa croyance pointant vers la balise (+x), et le Terminator
 * exactement à `gap` mètres devant lui, immobile. `gap <= NL_CFG.clawRange` ⇒ à portée.
 */
function arena(opts?: { clawWindup?: boolean }, gap = 1.2): World {
  const w = newWorld(20261103, undefined, opts);
  w.t.x = 20 + gap; w.t.y = 12; w.t.facing = 0; w.t.hp = T_CFG.hp; w.t.boltCd = 0; w.t.fistCd = 0;
  const n = w.nls[0];
  n.x = 20; n.y = 12; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0;
  n.belief = { valid: false, x: 20, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  return w;
}
const claws = (w: World) => w.events.filter(e => e.type === 'claw');
const arms = (w: World) => w.events.filter(e => e.type === 'clawArm');
const whiffs = (w: World) => w.events.filter(e => e.type === 'whiff');

test('défaut : les griffes s\'arment (clawWindup activé par défaut)', () => {
  assert.equal(newWorld(1).opts.clawWindup, true, 'le build jouable garde l\'armement par défaut');
  assert.equal(newWorld(1, undefined, { clawWindup: false }).opts.clawWindup, false);
});

test('armement : aucun dégât au tick T, annonce clawArm, dégâts au tick T+2', () => {
  const w = arena();
  const T = w.tick;

  step(w, IDLE, CLAW); // tick T : Talos déclenche
  assert.equal(w.t.hp, T_CFG.hp, 'T : l\'annonce ne blesse pas');
  assert.equal(claws(w).length, 0, 'T : aucun événement claw');
  assert.deepEqual(arms(w), [{ type: 'clawArm', who: 0 }], 'T : une annonce clawArm pour Talos');
  assert.equal(w.nls[0].armTicks, 2, 'T : deux ticks d\'armement');
  assert.equal(w.nls[0].cd, NL_CFG.clawCd, 'T : le cooldown part au déclenchement, comme avant');

  step(w, IDLE, HOLD); // le tick T+1 s'exécute, on est ensuite au tick T+2
  assert.equal(w.tick, T + 2);
  assert.equal(w.nls[0].armTicks, 1);
  assert.equal(w.t.hp, T_CFG.hp, 'T+1 : toujours aucun dégât');
  assert.equal(claws(w).length, 0);

  step(w, IDLE, HOLD); // le tick T+2 s'exécute : l'impact tombe ici
  assert.equal(w.tick, T + 3);
  const [hit] = claws(w);
  assert.ok(hit && hit.type === 'claw', 'T+2 : l\'impact est émis');
  assert.equal(hit.who, 0);
  assert.equal(hit.zone, 'rear', 'Talos frappe dans le dos (cible devant lui, zone arrière au sens du code)');
  assert.equal(hit.dmg, NL_CFG.dmgRear);
  assert.equal(w.t.hp, T_CFG.hp - NL_CFG.dmgRear, 'T+2 : les dégâts tombent enfin');
  assert.equal(arms(w).length, 0, 'T+2 : pas de nouvelle annonce');
  assert.equal(w.nls[0].armTicks, 0, 'T+2 : plus rien en cours');
});

test('armement : la cible qui s\'éloigne ⇒ whiff et zéro dégât', () => {
  const w = arena(undefined, 1.5); // à portée au moment de l'annonce
  const T = w.tick;

  step(w, IDLE, CLAW); // tick T : armement à 1,5 m
  assert.equal(w.t.hp, T_CFG.hp);
  assert.equal(arms(w).length, 1, 'T : le coup est annoncé');
  assert.equal(claws(w).length, 0);

  step(w, AWAY, HOLD); // tick T+1 : le Terminator recule (1,5 → 2,0 m)
  step(w, AWAY, HOLD); // tick T+2 : l'impact est re-vérifié à 2,25 m
  assert.equal(w.tick, T + 3, 'les ticks T, T+1 et T+2 ont été simulés');
  assert.ok(dist(w.nls[0].x, w.nls[0].y, w.t.x, w.t.y) > NL_CFG.clawRange, 'la cible est sortie de portée');
  assert.deepEqual(whiffs(w), [{ type: 'whiff', who: 0 }], 'T+2 : le coup est esquivé');
  assert.equal(claws(w).length, 0, 'aucun dégât : pas d\'événement claw');
  assert.equal(w.t.hp, T_CFG.hp, 'aucune blessure');
  assert.equal(w.t.lastHitTick, -999, 'aucun coup au contact enregistré');
});

test('drapeau false : dégâts au tick T, aucun clawArm (comportement d\'avant)', () => {
  const w = arena({ clawWindup: false });
  const T = w.tick;

  step(w, IDLE, CLAW); // tick T : dégâts immédiats, comme avant l'armement
  const [hit] = claws(w);
  assert.ok(hit && hit.type === 'claw', 'T : l\'impact tombe dans le tick');
  assert.equal(hit.who, 0);
  assert.equal(hit.dmg, NL_CFG.dmgRear);
  assert.equal(w.t.hp, T_CFG.hp - NL_CFG.dmgRear, 'T : les dégâts tombent dans le tick');
  assert.equal(arms(w).length, 0, 'T : aucune annonce quand l\'armement est désactivé');
  assert.equal(w.nls[0].armTicks, 0, 'T : aucun armement en cours');
  assert.equal(w.nls[0].cd, NL_CFG.clawCd);

  // et rien ne tombe plus tard : la manche est strictement celle des mesures b3
  step(w, IDLE, HOLD);
  step(w, IDLE, HOLD);
  assert.equal(w.tick, T + 3, 'les ticks T, T+1 et T+2 ont été simulés');
  assert.equal(w.t.hp, T_CFG.hp - NL_CFG.dmgRear, 'T+1/T+2 : aucun coup différé');
  assert.equal(claws(w).length, 0);
  assert.equal(whiffs(w).length, 0);
});

test('récompenses attachées à l\'impact effectif, pas à l\'armement', () => {
  const w = arena();
  const rArm = step(w, IDLE, CLAW).rewards[0]; // tick T
  assert.ok(rArm < REWARD.dmgSelf * NL_CFG.dmgRear, 'T : aucune récompense de dégât à l\'annonce');
  step(w, IDLE, HOLD); // T+1
  const rHit = step(w, IDLE, HOLD).rewards[0]; // T+2 : impact
  assert.ok(rHit >= REWARD.dmgSelf * NL_CFG.dmgRear, 'T+2 : la récompense de dégât arrive avec l\'impact');
});
