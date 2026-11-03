// Tests du retour du coup côté Terminator (lot 4) : encaisser doit se sentir. Le `claw` reste émis (vu de la
// meute), et un `hit` dit ce que le joueur encaisse : dégâts, zone, hp après, stagger, alarme de servo. Le stagger
// n'est pas décoratif : il **annule** un gantelet en charge ou une rafale en cours, et interdit toute action
// offensive pendant 2 ticks (déplacement à demi-vitesse). Le seuil des 25 % n'est annoncé qu'une fois par manche.
// Exécution : `npm test` (ou `node --import tsx --test test/damage-feedback.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, dist, NL_CFG, T_CFG, type World, type TAction, type Ev } from '../src/sim.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const CLAW = [7, 0, 0, 0]; // Talos choisit les griffes
const HOLD = [0, 0, 0, 0];

type Hit = Extract<Ev, { type: 'hit' }>;
const hits = (w: World) => w.events.filter((e): e is Hit => e.type === 'hit');
const claws = (w: World) => w.events.filter(e => e.type === 'claw');
const bolts = (w: World) => w.events.filter(e => e.type === 'bolt');

/**
 * Terrain reproductible : Talos à (20, 12) face à +x, le Terminator exactement `gap` mètres devant lui (donc
 * derrière le Terminator au sens de la zone : `zone === 'rear'`, `dmgRear` = 2). Le Terminator est immobile.
 */
function arena(gap = 1.2, opts?: { clawWindup?: boolean }): World {
  const w = newWorld(20261103, undefined, opts);
  w.t.x = 20 + gap; w.t.y = 12; w.t.facing = 0;
  const n = w.nls[0];
  n.x = 20; n.y = 12; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0;
  n.belief = { valid: false, x: 20, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  return w;
}

/** Annonce au tick T (Talos arme), impact au tick T+2 ; renvoie le monde et l'événement `hit` du coup. */
function landClaw(w: World): Hit {
  step(w, IDLE, CLAW); // T : armement
  step(w, IDLE, HOLD); // T+1
  step(w, IDLE, HOLD); // T+2 : impact
  const [hit] = hits(w);
  assert.ok(hit, 'le coup doit émettre un `hit`');
  return hit;
}

/** Prépare un gantelet en charge, puis fait tomber une griffe dessus (Talos arme au même tick que l'appui `fist`). */
function chargingFistWorld(): World {
  const w = arena();
  step(w, { ...IDLE, fist: true }, CLAW); // T : fistCharge = 8, clawArm
  assert.equal(w.t.fistCharge, T_CFG.fistChargeTicks, 'T : la charge est engagée');
  step(w, IDLE, HOLD); // T+1
  return w;
}

test('1. un coup qui blesse émet `hit` (dmg, zone, hpAfter) en plus du `claw`', () => {
  const w = arena();
  const hp0 = w.t.hp;

  step(w, IDLE, CLAW); // T : annonce
  assert.equal(hits(w).length, 0, 'T : l\'annonce ne blesse pas, aucun `hit`');

  step(w, IDLE, HOLD); // T+1
  step(w, IDLE, HOLD); // T+2 : impact

  const [h] = hits(w);
  assert.ok(h, 'T+2 : un `hit` est émis');
  assert.equal(h.dmg, NL_CFG.dmgRear, 'les dégâts sont ceux de la zone arrière, inchangés');
  assert.equal(h.zone, 'rear', 'Talos frappe dans le dos du Terminator');
  assert.equal(h.hpAfter, hp0 - NL_CFG.dmgRear, '`hpAfter` est la valeur après application');
  assert.equal(w.t.hp, h.hpAfter, 'l\'état et l\'événement disent la même chose');
  assert.equal(h.stagger, false, 'aucune action en cours : le coup n\'interrompt rien');

  // le `claw` correspondant existe toujours : `hit` s'ajoute, il ne remplace pas le point de vue de la meute
  const [c] = claws(w);
  assert.ok(c && c.type === 'claw', 'le `claw` existant est toujours émis');
  assert.equal(c.who, 0);
  assert.equal(c.dmg, h.dmg);
  assert.equal(c.zone, h.zone);
});

test('2. un gantelet en charge qui prend un coup est perdu, sans munition ni impact', () => {
  const w = chargingFistWorld();
  const ammo0 = w.t.ammo;
  assert.equal(w.t.fistCharge, T_CFG.fistChargeTicks - 1, 'T+1 : la charge suit son cours');

  step(w, IDLE, HOLD); // T+2 : la griffe tombe pendant la charge
  const [h] = hits(w);
  assert.ok(h, 'la griffe blesse');
  assert.equal(h.stagger, true, 'le coup a interrompu une action en cours');
  assert.equal(w.t.fistCharge, 0, 'la charge est perdue : `fistCharge = 0`');
  assert.equal(w.t.ammo, ammo0, 'aucune munition n\'est consommée par la charge');

  // et l'impact ne tombe jamais, même en laissant la charge « finir »
  for (let i = 0; i < 12; i++) step(w, IDLE, HOLD);
  assert.equal(w.events.filter(e => e.type === 'fist').length, 0, 'aucun événement `fist` n\'est émis ensuite');
  assert.equal(w.events.filter(e => e.type === 'fistReady').length, 0, 'aucun `fistReady` : la charge n\'a pas abouti');
  assert.equal(w.t.fistCharge, 0, 'la charge reste à zéro');
});

test('3. une rafale en cours qui prend un coup s\'arrête net (burstLeft = 0, plus de tir)', () => {
  const w = arena();
  step(w, IDLE, CLAW); // T : Talos arme (impact en T+2)
  step(w, { ...IDLE, bolt: true }, HOLD); // T+1 : la rafale démarre, 1ᵉʳ tir
  assert.equal(w.t.burstLeft, T_CFG.boltBurst - 1, 'T+1 : une rafale est en cours');

  step(w, { ...IDLE, bolt: true }, HOLD); // T+2 : 2ᵉ tir puis la griffe tombe
  const [h] = hits(w);
  assert.ok(h && h.stagger === true, 'la griffe interrompt une rafale en cours');
  const shotsAtHit = bolts(w).length;
  assert.ok(shotsAtHit >= 1, 'des munitions sont déjà parties avant le coup');
  assert.equal(w.t.burstLeft, 0, 'la rafale est coupée : `burstLeft = 0`');

  for (let i = 0; i < 8; i++) step(w, { ...IDLE, bolt: true }, HOLD);
  assert.equal(bolts(w).length, 0, 'plus aucun tir après le coup : la 3ᵉ balle de la rafale est perdue');
  assert.equal(w.t.burstLeft, 0, 'aucune rafale n\'a repris');
});

test('4. pendant le stagger, un appui `bolt` ou `fist` ne déclenche rien', () => {
  const w = arena(1.2, { clawWindup: false }); // impact dans le tick, plus simple à cadrer
  step(w, IDLE, CLAW); // T : la griffe tombe, staggerTicks = 2
  const [h] = hits(w);
  assert.ok(h && h.stagger === false, 'aucune action en cours à interrompre');
  assert.equal(w.t.staggerTicks, T_CFG.hitStaggerTicks, 'stagger posé à 2 ticks');

  // T+1 et T+2 : les deux ticks de stagger, appuis ignorés
  for (let i = 0; i < 2; i++) {
    step(w, { ...IDLE, bolt: true, fist: true }, HOLD);
    assert.equal(w.events.filter(e => e.type === 'bolt').length, 0, 'aucun tir pendant le stagger');
    assert.equal(w.events.filter(e => e.type === 'fistCharge').length, 0, 'aucune charge pendant le stagger');
    assert.equal(w.events.filter(e => e.type === 'fist').length, 0, 'aucun impact de gantelet pendant le stagger');
    assert.equal(w.t.burstLeft, 0, 'aucune rafale n\'a pu démarrer');
    assert.equal(w.t.fistCharge, 0, 'aucune charge n\'a pu démarrer');
  }
  assert.equal(w.t.staggerTicks, 0, 'le stagger est écoulé');

  // T+3 : l'action offensive est de nouveau acceptée (la preuve que le blocage n'était pas un bug d'état)
  step(w, { ...IDLE, bolt: true }, HOLD);
  assert.ok(w.events.some(e => e.type === 'bolt'), 'après le stagger, le bolter repart');
  assert.equal(w.t.staggerTicks, 0);
  assert.ok(dist(w.nls[0].x, w.nls[0].y, w.t.x, w.t.y) < NL_CFG.clawRange, 'la meute est restée au contact');
});

test('5. l\'alarme de servo est posée à 10, portée par `hit`, et décroît d\'un tick par pas', () => {
  const w = arena();
  const hit = landClaw(w);
  assert.equal(hit.servoAlarm, T_CFG.servoAlarmTicks, 'l\'événement porte la valeur après application (≥ 10)');
  assert.ok(hit.servoAlarm >= 10);
  assert.equal(w.t.servoAlarm, T_CFG.servoAlarmTicks, 'l\'état juste après le coup vaut 10');

  let prev = w.t.servoAlarm;
  for (let i = 0; i < T_CFG.servoAlarmTicks; i++) {
    step(w, IDLE, HOLD);
    assert.ok(w.t.servoAlarm <= prev, 'l\'alarme ne remonte jamais sans nouveau coup');
    assert.equal(w.t.servoAlarm, prev - 1, 'elle décroît exactement d\'un tick par pas');
    prev = w.t.servoAlarm;
  }
  assert.equal(w.t.servoAlarm, 0, 'l\'alarme s\'éteint après 10 ticks');
});

test('6. `servoCritical` n\'est émis qu\'une fois, au premier passage sous 25 %', () => {
  const w = arena();
  w.t.hp = 8; // 25 % de 30 = 7,5 : un coup arrière (2) fait passer à 6
  // `step` vide `w.events` à chaque tick : on compte les annonces à chaque pas, pas dans le dernier tick seulement.
  let criticals = 0;
  const land = (world: World): Hit => {
    const seen: Hit[] = [];
    for (let i = 0; i < 3; i++) { // T : annonce, T+1, T+2 : impact
      step(world, IDLE, i === 0 ? CLAW : HOLD);
      criticals += world.events.filter(e => e.type === 'servoCritical').length;
      for (const e of hits(world)) seen.push(e);
    }
    assert.equal(seen.length, 1, 'un seul `hit` pour une griffe');
    return seen[0];
  };

  const first = land(w);
  assert.equal(first.hpAfter, 6, 'le coup fait bien passer sous le seuil');
  assert.equal(criticals, 1, 'le seuil est annoncé');

  // deux coups de plus, tous sous le seuil : toujours une seule annonce
  for (let k = 0; k < 2; k++) {
    w.nls[0].cd = 0; w.nls[0].armTicks = 0;
    land(w);
    assert.equal(criticals, 1, `aucun doublon après le coup ${k + 2}`);
    assert.ok(w.t.hp < T_CFG.hp * T_CFG.servoCriticalFrac, 'on est toujours sous le seuil');
  }
  assert.equal(w.t.servoCriticalSent, true, 'le drapeau garde la porte fermée');
});
