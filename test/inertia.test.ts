// Tests de l'inertie du Terminator et du pas comme événement de simulation (lots A et B).
// L'intention de game design : le joueur reste le Terminator, la tension vient de son inertie face à quatre
// prédateurs rapides — « forteresse lente ». Aucune de ces valeurs ne doit être instantanée.
// Exécution : `npm test` (ou `node --import tsx --test test/inertia.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, DT, T_CFG, angNorm, type World, type TAction } from '../src/sim.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
/** La meute tient sa position : ces tests ne parlent que du Terminator. */
const HOLD = [0, 0, 0, 0];

/**
 * Monde sans obstacle sur le trajet testé : le Terminator part à (3, 12) face à +x, la meute reste au fond
 * (x 26-38). Rien à moins de dix mètres, donc aucune griffe ne vient perturber les mesures de mouvement.
 */
function arena(seed = 20261103): World {
  return newWorld(seed, { x: 3, y: 12, facing: 0 });
}
const speedOf = (w: World) => Math.hypot(w.t.vx, w.t.vy);
const steps = (w: World) => w.events.filter(e => e.type === 'step');

test('accélération : au tick 1 la vitesse est sous le plafond, l\'avance sous l\'ancien déplacement instantané', () => {
  const w = arena();
  const x0 = w.t.x;

  step(w, { ...IDLE, fwd: 1 }, HOLD);
  const v = speedOf(w);
  assert.ok(v > 0, 'il avance quand même : la rampe part de zéro, elle ne bloque pas');
  assert.ok(v < T_CFG.fwd, `vitesse au tick 1 (${v.toFixed(2)} m/s) strictement sous T_CFG.fwd (${T_CFG.fwd})`);
  assert.ok(v <= T_CFG.accel * DT + 1e-9, `au plus une tick d'accélération (${(T_CFG.accel * DT).toFixed(2)} m/s)`);
  const advanced = Math.abs(w.t.x - x0);
  assert.ok(advanced < T_CFG.fwd * DT, `avance ${advanced.toFixed(3)} m < ancien déplacement instantané ${(T_CFG.fwd * DT).toFixed(3)} m`);

  // la rampe converge : le plafond est atteint en fwd / accel = 0,83 s, pas instantanément
  const ticksToMax = Math.ceil(T_CFG.fwd / (T_CFG.accel * DT));
  for (let i = 1; i < ticksToMax; i++) step(w, { ...IDLE, fwd: 1 }, HOLD);
  assert.ok(ticksToMax > 1, 'il faut plusieurs ticks pour atteindre la vitesse de pointe');
  assert.ok(Math.abs(speedOf(w) - T_CFG.fwd) < 1e-9, 'après la rampe, la vitesse est bien bornée par T_CFG.fwd');
  // borné aussi : une tick de plus ne dépasse pas
  step(w, { ...IDLE, fwd: 1 }, HOLD);
  assert.ok(speedOf(w) <= T_CFG.fwd + 1e-9, 'la vitesse ne dépasse jamais T_CFG.fwd');
});

test('décélération : lâcher l\'entrée fait décroître la vitesse sur plusieurs ticks jusqu\'à zéro', () => {
  const w = arena();
  for (let i = 0; i < 30; i++) step(w, { ...IDLE, fwd: 1 }, HOLD);
  assert.ok(Math.abs(speedOf(w) - T_CFG.fwd) < 1e-9, 'vitesse stabilisée avant de relâcher');

  const seen: number[] = [];
  for (let i = 0; i < 20; i++) {
    step(w, IDLE, HOLD);
    seen.push(+speedOf(w).toFixed(9));
    if (seen[seen.length - 1] === 0 && seen.length > 1) break;
  }
  assert.ok(seen.length >= 3, `la décélération dure plusieurs ticks (${seen.length} mesures)`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] < seen[i - 1], `tick ${i} : ${seen[i]} < ${seen[i - 1]}`);
  assert.equal(seen[seen.length - 1], 0, 'la vitesse finit exactement à zéro (pas de résidu)');
  assert.equal(w.t.moving, false, 'immobile : `moving` reflète la vitesse réelle');
  assert.equal(w.t.noise, T_CFG.noiseFloor, 'le bruit retombe au plancher (noiseFloor) une fois arrêté, jamais en dessous');
  assert.equal(w.t.vx, 0); assert.equal(w.t.vy, 0);
});

test('rotation : la tourelle monte en régime, un demi-tour demande plus de 3 ticks', () => {
  // 1. premier tick : la rotation est rampée, pas la vitesse de pointe
  const a = arena();
  const f0 = a.t.facing;
  step(a, { ...IDLE, turn: 1 }, HOLD);
  const first = Math.abs(angNorm(a.t.facing - f0));
  assert.ok(first > 0, 'il commence à tourner');
  assert.ok(first < T_CFG.turnMax * DT, `rotation au tick 1 (${first.toFixed(4)} rad) < turnMax·DT (${(T_CFG.turnMax * DT).toFixed(4)})`);
  assert.ok(Math.abs(a.t.turnVel) < T_CFG.turnMax, 'la vitesse de rotation n\'est pas encore au plafond');

  // 2. la rampe : sur 5 ticks, on tourne nettement moins que 5 ticks à vitesse pleine (l'ancien comportement)
  const b = arena();
  let ramp = 0;
  for (let i = 0; i < 5; i++) {
    const before = b.t.facing;
    step(b, { ...IDLE, turn: 1 }, HOLD);
    ramp += Math.abs(angNorm(b.t.facing - before));
  }
  assert.ok(ramp < 5 * T_CFG.turnMax * DT - 1e-9,
    `5 ticks de rampe = ${ramp.toFixed(3)} rad, moins que 5·turnMax·DT = ${(5 * T_CFG.turnMax * DT).toFixed(3)} rad`);

  // 3. le plafond est atteint par rampe : turnMax / turnAccel = 0,8 s, soit 8 ticks
  const c = arena();
  const ticksToMax = Math.ceil(T_CFG.turnMax / (T_CFG.turnAccel * DT));
  for (let i = 0; i < ticksToMax; i++) step(c, { ...IDLE, turn: 1 }, HOLD);
  assert.ok(Math.abs(Math.abs(c.t.turnVel) - T_CFG.turnMax) < 1e-9, 'la vitesse de rotation atteint exactement le plafond');
  assert.ok(ticksToMax > 3, `la montée en régime dure ${ticksToMax} ticks`);

  // 4. le demi-tour (π) : une « tourelle », pas un pivot instantané
  const d = arena();
  let turned = 0, ticks = 0;
  while (turned < Math.PI && ticks < 200) {
    const before = d.t.facing;
    step(d, { ...IDLE, turn: 1 }, HOLD);
    turned += Math.abs(angNorm(d.t.facing - before)); ticks++;
  }
  assert.ok(turned >= Math.PI, 'le demi-tour finit par être accompli');
  assert.ok(ticks > 3, `un demi-tour demande ${ticks} ticks (> 3) — la tourelle est lente`);
  assert.ok(ticks < 60, `le demi-tour finit quand même (${ticks} ticks), il ne tourne pas dans le vide`);

  // 5. relâcher la rotation : la tourelle décélère au lieu de s'arrêter net
  const e = arena();
  for (let i = 0; i < 8; i++) step(e, { ...IDLE, turn: 1 }, HOLD);
  assert.ok(Math.abs(e.t.turnVel) > 0);
  step(e, IDLE, HOLD);
  assert.ok(Math.abs(e.t.turnVel) > 0, 'sans entrée, la vitesse de rotation ne tombe pas à zéro en un tick');
  assert.ok(Math.abs(e.t.turnVel) < T_CFG.turnMax, 'elle décroît');
});

test('latéral : `strafe` n\'est pas une translation, le vecteur vitesse suit l\'axe du regard', () => {
  // 1. strafe seul, fwd = 0 : aucune translation du tout (et donc aucune perpendiculaire au regard)
  const a = arena();
  const p0 = { x: a.t.x, y: a.t.y };
  for (let i = 0; i < 20; i++) step(a, { ...IDLE, strafe: 1 }, HOLD);
  const ax = Math.cos(a.t.facing), ay = Math.sin(a.t.facing);
  const dx = a.t.x - p0.x, dy = a.t.y - p0.y;
  assert.equal(dx, 0, 'strafe seul ne translate pas');
  assert.equal(dy, 0, 'strafe seul ne translate pas');
  assert.equal(-dx * ay + dy * ax, 0, 'déplacement perpendiculaire au regard : nul');

  // 2. strafe + fwd : la marche reste sur l'axe du regard, aucune dérive latérale
  const b = arena();
  const q0 = { x: b.t.x, y: b.t.y };
  for (let i = 0; i < 30; i++) step(b, { ...IDLE, fwd: 1, strafe: 1 }, HOLD);
  const bx = Math.cos(b.t.facing), by = Math.sin(b.t.facing);
  const ex = b.t.x - q0.x, ey = b.t.y - q0.y;
  assert.ok(ex > 0, 'il avance bien vers l\'avant');
  assert.ok(Math.abs(-ex * by + ey * bx) < 1e-12, 'composante perpendiculaire nulle : `strafe` oriente, il ne translate pas');
  assert.ok(Math.abs(speedOf(b) - T_CFG.fwd) < 1e-9, '`strafe` ne change pas non plus la vitesse longitudinale');
});

test('pas : à vitesse stabilisée, un `step` toutes les 0,9 s et les pieds alternent', () => {
  const w = arena();
  const emitted: { tick: number; foot: 0 | 1; intensity: number }[] = [];
  for (let i = 0; i < 120; i++) {
    step(w, { ...IDLE, fwd: 1 }, HOLD);
    for (const e of steps(w)) emitted.push({ tick: w.tick, foot: e.foot, intensity: e.intensity });
  }
  assert.ok(emitted.length >= 8, `des pas sont émis (${emitted.length})`);
  const steady = emitted.filter(e => e.tick > 30); // laisse passer la rampe d'accélération
  assert.ok(steady.length >= 6, 'assez de pas à vitesse stabilisée pour mesurer une cadence');
  const expected = Math.round(T_CFG.strideTime / DT); // 0,9 s / 0,1 s = 9 ticks
  for (let i = 1; i < steady.length; i++) {
    const gap = steady[i].tick - steady[i - 1].tick;
    assert.ok(Math.abs(gap - expected) <= 1, `écart de ${gap} ticks entre deux pas (attendu ${expected} ±1)`);
    assert.notEqual(steady[i].foot, steady[i - 1].foot, 'le pied alterne');
  }
  assert.ok(Math.abs(steady[0].intensity - 1) < 1e-9, 'à pleine vitesse, intensité 1');
});

test('pas d\'arrêt : un seul `step` d\'intensité 0 quand la vitesse retombe, puis silence', () => {
  const w = arena();
  for (let i = 0; i < 30; i++) step(w, { ...IDLE, fwd: 1 }, HOLD);
  assert.ok(speedOf(w) > 0);

  const stops: { tick: number; foot: 0 | 1 }[] = [];
  const moving: number[] = [];
  for (let i = 0; i < 20; i++) {
    step(w, IDLE, HOLD);
    for (const e of steps(w)) {
      if (e.intensity === 0) stops.push({ tick: w.tick, foot: e.foot });
      else moving.push(w.tick);
    }
  }
  assert.equal(stops.length, 1, `un seul pas d'arrêt (${stops.length} émis) : pas de rafale`);
  assert.equal(w.t.moving, false);
  assert.equal(speedOf(w), 0);
  assert.ok(stops[0].foot === 0 || stops[0].foot === 1, 'le pas d\'arrêt porte un pied valide');
  assert.ok(stops[0].tick > 30, 'il tombe après le relâchement de l\'entrée');
});

test('conséquence de design : une griffe télégraphiée attrape un Terminator à l\'arrêt', () => {
  // La griffe s'arme 2 ticks (0,2 s) à l'avance. Avant l'inertie, reculer à 2,5 m/s suffisait à sortir de
  // portée depuis 1,5 m. Désormais, depuis l'arrêt, ces 2 ticks ne couvrent que 0,09 m : la griffe tombe.
  // C'est la « forteresse lente » — esquiver demande d'avoir déjà de la vitesse, pas de réagir au dernier tick.
  const w = newWorld(20261103);
  w.t.x = 20 + 1.5; w.t.y = 12; w.t.facing = 0;
  const n = w.nls[0]; n.x = 20; n.y = 12; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0;
  n.belief = { valid: false, x: 20, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  const AWAY: TAction = { ...IDLE, fwd: 1 };
  step(w, IDLE, [7, 0, 0, 0]); // annonce
  step(w, AWAY, HOLD); // 1,53 m
  step(w, AWAY, HOLD); // 1,59 m : toujours à portée de griffe (1,75 m)
  assert.ok(Math.hypot(w.t.x - 20, w.t.y - 12) < 1.75, 'deux ticks de rampe ne suffisent pas à sortir de portée');
  assert.ok(w.events.some(e => e.type === 'claw' && e.dmg > 0), 'la griffe télégraphiée touche : l\'inertie se paie');
  assert.ok(w.t.hp < T_CFG.hp);
});

test('reproductibilité : même graine + mêmes entrées ⇒ mêmes trajectoires, mêmes pas', () => {
  const trace = (seed: number) => {
    const w = newWorld(seed, { x: 3, y: 12, facing: 0 }), out: unknown[] = [];
    for (let i = 0; i < 80; i++) {
      const a: TAction = { fwd: i < 50 ? 1 : 0, strafe: i < 20 ? 1 : 0, turn: i % 7 === 0 ? 1 : 0, bolt: i % 23 === 0, fist: false };
      step(w, a, w.nls.map(n => (n.alive && i % 13 === 0 ? 1 : 0)));
      out.push({ x: +w.t.x.toFixed(12), y: +w.t.y.toFixed(12), f: +w.t.facing.toFixed(12), vx: +w.t.vx.toFixed(12), vy: +w.t.vy.toFixed(12),
        nls: w.nls.map(n => [+n.x.toFixed(9), +n.y.toFixed(9)]), ev: w.events.map(e => JSON.stringify(e)) });
    }
    return out;
  };
  assert.deepEqual(trace(7), trace(7), 'l\'inertie ne dépend que de la graine et du temps, pas d\'un aléa caché');
  assert.notDeepEqual(trace(7), trace(8), 'une graine différente change bien la partie (le test ne passe pas pour rien)');
});
