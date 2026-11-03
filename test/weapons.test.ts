// Tests des deux armes du Terminator (lot 3) : rafale de bolter lourd (munitions, dispersion, recul, rechargement) et
// gantelet énergétique (charge de 8 ticks, non annulable, impact différé, stagger de la meute).
// L'intention de game design : le choix tactique doit se payer. La rafale coûte des munitions et 2 s de rechargement
// à vitesse réduite ; le gantelet coûte 0,8 s d'engagement à vitesse réduite mais rend de l'air (stagger).
// Exécution : `npm test` (ou `node --import tsx --test test/weapons.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, T_CFG, DT, NL_CFG, type World, type TAction } from '../src/sim.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
/** La meute tient sa position : ces tests ne parlent que des armes du Terminator. */
const HOLD = [0, 0, 0, 0];
const speedOf = (w: World) => Math.hypot(w.t.vx, w.t.vy);
const bolts = (w: World) => w.events.filter((e): e is Extract<typeof e, { type: 'bolt' }> => e.type === 'bolt');
const fists = (w: World) => w.events.filter((e): e is Extract<typeof e, { type: 'fist' }> => e.type === 'fist');

/**
 * Le Terminator est à (3, 12) et regarde **à l'opposé** de la meute (facing π) : la meute spawn à x ≥ 26, donc à plus
 * de 23 m — hors de portée de bolter (16 m). Aucun tir ne peut tuer, ce qui isole le comptage des rafales.
 */
function arena(seed = 20261103): World {
  const w = newWorld(seed, { x: 3, y: 12, facing: Math.PI });
  w.t.boltCd = 0; w.t.fistCd = 0;
  return w;
}

/**
 * Arène du gantelet : `n0` à 1,2 m devant le Terminator (à portée de gantelet, c'est la cible du contact), `n1` à 5 m
 * (hors de portée du gantelet, mais il encaisse le stagger : le choc se propage à la meute debout).
 */
function fistArena(): World {
  const w = newWorld(20261103, { x: 20, y: 12, facing: 0 });
  const [n0, n1] = w.nls;
  n0.x = 21.2; n0.y = 12; n0.facing = Math.PI; n0.alive = true; n0.cd = 0; n0.armTicks = 0; n0.stunTicks = 0;
  n0.belief = { valid: false, x: 20, y: 12, age: 99, facing: null, seen: false, heard: false, vox: false };
  n1.x = 25; n1.y = 12; n1.facing = 0; n1.alive = true; n1.cd = 20; n1.armTicks = 0; n1.stunTicks = 0;
  w.t.boltCd = 0; w.t.fistCd = 0;
  return w;
}

test('rafale : 3 tirs sur 3 ticks consécutifs, 3 munitions consommées, pas de 4ᵉ', () => {
  const w = arena();
  assert.equal(w.t.ammo, T_CFG.boltAmmo, '30 munitions au départ');

  const shots: number[] = [];
  for (let i = 0; i < 20; i++) {
    step(w, { ...IDLE, bolt: true }, HOLD); // détente maintenue
    for (const e of bolts(w)) shots.push(w.tick);
  }
  // 3 tirs aux ticks 1, 2, 3 ; le cooldown global (12 ticks) part à la fin de la rafale, donc la rafale suivante
  // démarre au tick 15 (12 ticks après le 3ᵉ tir) et non avant.
  assert.deepEqual(shots, [1, 2, 3, 15, 16, 17], `tirs aux ticks ${shots.join(',')}`);
  assert.equal(w.t.ammo, T_CFG.boltAmmo - 6, 'une munition par tir, jamais plus');
  assert.equal(w.t.burstLeft, 0, 'plus aucune rafale en cours après le 3ᵉ tir');
});

test('rafale : la dispersion croît et laisse passer le 1ᵉʳ tir sous le nez', () => {
  // Cible placée à 10 m, à 0,20 rad de l'axe du regard. Le cône du 1ᵉʳ tir (0,12 + atan2(0,45;10) = 0,165 rad) ne la
  // contient pas ; celui du 3ᵉ (0,18 + 0,045 = 0,225 rad) la contient. C'est la formule de dispersion, vérifiée à
  // l'exécution : la rafale part large, elle ne tue pas les trois premiers tirs depuis le même cône.
  const w = newWorld(20261103, { x: 3, y: 12, facing: 0 });
  w.t.boltCd = 0;
  const n = w.nls[0];
  const d = 10, a = 0.2;
  n.x = w.t.x + Math.cos(a) * d; n.y = w.t.y + Math.sin(a) * d; n.facing = 0; n.alive = true; n.cd = 0; n.armTicks = 0;
  const outside = 0.12 + Math.atan2(NL_CFG.radius, d);
  const insideThird = 0.12 * 1.5 + Math.atan2(NL_CFG.radius, d);
  assert.ok(a > outside && a < insideThird, `l'angle ${a} rad encadre bien les deux cônes`);

  const kills: number[] = [];
  for (let i = 0; i < 3; i++) {
    step(w, { ...IDLE, bolt: true }, HOLD);
    for (const e of bolts(w)) kills.push(e.kill);
  }
  assert.deepEqual(kills, [-1, -1, 0], 'les deux premiers tirs passent à côté, le troisième (le plus dispersé) tue');
  assert.equal(n.alive, false);
});

test('munitions épuisées : rechargement de 20 ticks, bolt sans effet, vitesse réduite, chargeur plein', () => {
  const w = arena();
  w.t.ammo = 1; // dernier chargeur : la rafale s'arrête au premier tir, faute de munitions
  step(w, { ...IDLE, bolt: true }, HOLD);
  assert.equal(w.t.ammo, 0, 'dernière munition consommée');
  assert.equal(w.t.reloadLeft, T_CFG.boltReload, 'rechargement automatique de 20 ticks');
  assert.equal(bolts(w).length, 1, 'un seul tir : le chargeur est vide, la rafale s\'arrête');
  assert.equal(w.t.burstLeft, 0, 'aucun tir en attente');

  // Pendant tout le rechargement on insiste sur la détente, et on avance pour lire la vitesse.
  let shotsDuringReload = 0;
  for (let i = 0; i < T_CFG.boltReload; i++) {
    step(w, { ...IDLE, fwd: 1, bolt: true }, HOLD);
    shotsDuringReload += bolts(w).length;
    if (i > 10) assert.ok(Math.abs(speedOf(w) - T_CFG.fwd * T_CFG.slowScale) < 1e-9,
      `tick ${i + 1} : vitesse ${speedOf(w).toFixed(3)} m/s = la moitié de ${T_CFG.fwd} (rechargement, on ne court pas)`);
  }
  assert.equal(shotsDuringReload, 0, 'bolt est sans effet pendant les 20 ticks de rechargement');
  assert.equal(w.t.reloadLeft, 0);
  assert.equal(w.t.ammo, T_CFG.boltAmmo, 'chargeur plein à la fin du rechargement');

  step(w, { ...IDLE, fwd: 1, bolt: true }, HOLD); // chargeur plein et cooldown écoulé : la détente repart
  assert.equal(bolts(w).length, 1, 'le bolter repart une fois le chargeur plein');
  assert.ok(speedOf(w) > T_CFG.fwd * T_CFG.slowScale, 'la vitesse n\'est plus bridée à la moitié');
});

test('gantelet : charge de 8 ticks, aucun impact avant, impact au 8ᵉ tick', () => {
  const w = fistArena();
  const [n0] = w.nls;

  step(w, { ...IDLE, fist: true }, HOLD); // tick d'entrée
  assert.equal(w.t.fistCharge, T_CFG.fistChargeTicks, 'la charge vaut 8 ticks (0,8 s)');
  assert.equal(w.t.fistCd, 0, 'le cooldown de gantelet ne part pas à l\'entrée en charge');
  assert.equal(n0.alive, true, 'aucun dégât au tick d\'entrée');
  assert.equal(fists(w).length, 0, 'aucun événement fist au tick d\'entrée');
  assert.equal(w.events.filter(e => e.type === 'fistCharge').length, 1, 'un fistCharge à l\'entrée (audio)');

  // Les 7 ticks suivants : la charge décompte, rien ne tombe.
  for (let i = 1; i <= 7; i++) {
    step(w, { ...IDLE, fist: true }, HOLD);
    assert.equal(n0.alive, true, `tick ${i} : la charge ne blesse pas`);
    assert.equal(fists(w).length, 0, `tick ${i} : aucun impact`);
    assert.equal(w.t.fistCharge, T_CFG.fistChargeTicks - i);
  }
  assert.equal(w.t.fistCharge, 1, 'il reste un tick de charge');

  step(w, { ...IDLE, fist: true }, HOLD); // 8ᵉ tick après l'entrée : l'impact tombe ici
  assert.equal(w.t.fistCharge, 0);
  assert.equal(n0.alive, false, 'le contact tue au 8ᵉ tick, pas avant');
  const [hit] = fists(w);
  assert.ok(hit, 'un événement fist');
  assert.equal(hit.kill, 0, 'la cible du contact est tuée');
  assert.equal(hit.staggered, true, 'le choc étourdit la meute encore debout');
  assert.equal(w.t.fistCd, T_CFG.fistCd, 'le cooldown de 12 ticks part à l\'impact');
  assert.equal(w.events.filter(e => e.type === 'fistReady').length, 1, 'un fistReady à la fin de la charge (audio)');
  assert.equal(w.nls[1].stunTicks, T_CFG.fistStunTicks, 'stunTicks posé sur la meute survivante');
});

test('gantelet : le stagger gèle le cd de griffe et ralentit la course', () => {
  const w = fistArena();
  const [, n1] = w.nls;
  for (let i = 0; i < T_CFG.fistChargeTicks + 1; i++) step(w, { ...IDLE, fist: true }, HOLD);
  assert.equal(w.nls[0].alive, false, 'impact au 8ᵉ tick');
  assert.equal(n1.stunTicks, T_CFG.fistStunTicks);
  const cdAfterImpact = n1.cd;
  assert.ok(cdAfterImpact > 0, `le cd de griffe était encore en cours (${cdAfterImpact} ticks)`);
  const x0 = n1.x;

  // Pendant 6 ticks, n1 approche (action 1) : il se traîne à la moitié de sa vitesse et son cd est gelé.
  for (let i = 0; i < T_CFG.fistStunTicks; i++) step(w, IDLE, [0, 1, 0, 0]);
  assert.equal(n1.cd, cdAfterImpact, 'le cd de griffe est repoussé d\'autant : il ne décompte pas pendant le stagger');
  const moved = Math.abs(n1.x - x0);
  const expected = T_CFG.fistStunTicks * NL_CFG.speed * T_CFG.stunSpeed * DT;
  assert.ok(Math.abs(moved - expected) < 1e-9, `déplacement ${moved.toFixed(3)} m = ${expected.toFixed(3)} m (vitesse réduite de moitié)`);
  assert.equal(n1.stunTicks, 0, 'le stagger est écoulé');

  step(w, IDLE, [0, 1, 0, 0]); // un tick de plus : le cd repart
  assert.equal(n1.cd, cdAfterImpact - 1, 'le cd repart après le stagger');
  assert.ok(n1.cd < cdAfterImpact);
});

test('gantelet : une nouvelle entrée pendant la charge est ignorée (charge non annulable)', () => {
  const w = fistArena();
  step(w, { ...IDLE, fist: true }, HOLD); // entrée : charge = 8
  step(w, { ...IDLE, fist: true }, HOLD); // 7
  step(w, { ...IDLE, fist: true }, HOLD); // 6
  assert.equal(w.t.fistCharge, 6, 'la charge continue son décompte : elle n\'est pas relancée à 8');
  assert.equal(w.events.filter(e => e.type === 'fistCharge').length, 0, 'aucune nouvelle entrée en charge');
  for (let i = 0; i < 5; i++) step(w, { ...IDLE, fist: true }, HOLD);
  assert.equal(w.t.fistCharge, 1);
  assert.equal(w.nls[0].alive, true, 'l\'impact n\'est pas avancé par les appuis répétés');
  step(w, { ...IDLE, fist: true }, HOLD);
  assert.equal(w.nls[0].alive, false, 'l\'impact tombe au 8ᵉ tick, comme prévu');
  assert.equal(w.t.fistCharge, 0);
  assert.equal(w.t.fistCd, T_CFG.fistCd);
});

test('recul : croît dans la rafale (0 < r1 < r2 < r3)', () => {
  const w = arena();
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    step(w, { ...IDLE, bolt: true }, HOLD);
    for (const e of bolts(w)) r.push(e.recoil);
  }
  assert.equal(r.length, 3);
  assert.ok(r[0] > 0 && r[0] < r[1] && r[1] < r[2], `reculs ${r.map(v => v.toFixed(3)).join(' < ')}`);
  assert.equal(r[2], 1, 'le dernier tir de la rafale sature le recul à 1');
});

test('reproductibilité : la trace des armes ne dépend que de la graine et du temps', () => {
  const trace = (seed: number) => {
    const w = newWorld(seed, { x: 4, y: 12, facing: 0 }), out: unknown[] = [];
    for (let i = 0; i < 160; i++) {
      // rafales serrées + charges répétées : on traverse munitions, rechargement et stagger
      const a: TAction = { fwd: i % 5 < 3 ? 1 : 0, strafe: 0, turn: i % 11 === 0 ? 1 : 0, bolt: i % 4 === 0, fist: i % 37 === 0 };
      step(w, a, w.nls.map(n => (n.alive && i % 9 === 0 ? 1 : 0)));
      out.push({
        x: +w.t.x.toFixed(12), y: +w.t.y.toFixed(12), f: +w.t.facing.toFixed(12),
        ammo: w.t.ammo, burstLeft: w.t.burstLeft, burstCd: w.t.burstCd, reloadLeft: w.t.reloadLeft, fistCharge: w.t.fistCharge,
        nls: w.nls.map(n => [+n.x.toFixed(9), +n.y.toFixed(9), n.alive ? 1 : 0, n.stunTicks, n.cd]),
        ev: w.events.map(e => JSON.stringify(e)),
      });
    }
    return out;
  };
  assert.deepEqual(trace(11), trace(11), 'aucun aléa caché dans les armes : même graine, même trace');
  assert.notDeepEqual(trace(11), trace(12), 'une graine différente change bien la partie');
});
