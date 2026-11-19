// Glissement au contact d'un prisme orienté : le disque longe la face et contourne le coin au lieu de
// rester collé (Terminator figé contre le débris du couloir), sans rouvrir le trou anti-tunnel R46-02.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, nlFrame, T_CFG, NL_CFG } from '../src/sim.ts';
import { march } from '../src/tactics.ts';
import {
  ANGLED_CRATE_INDEX, CORRIDOR_DEBRIS_INDEX, PROP_PLACES, distPointPrism, distSegPrism, fromLocal, propPrisms,
  resolvePrisms, toLocal,
} from '../src/props.ts';

const debris = propPrisms(['debris'])[CORRIDOR_DEBRIS_INDEX];
const crate = propPrisms(['crate'])[ANGLED_CRATE_INDEX];

/** Déplacement exprimé dans le repère local du prisme, appliqué en monde. */
function localMove(o: typeof debris, lx: number, ly: number, dlx: number, dly: number) {
  const [fx, fy] = fromLocal(lx, ly, o);
  const [gx, gy] = fromLocal(lx + dlx, ly + dly, o);
  const from = { x: fx, y: fy }, p = { x: gx, y: gy };
  resolvePrisms(from, p, T_CFG.radius, [o]);
  return { from, p, local: toLocal(p.x, p.y, o) };
}

test('contact sur la face d\'un prisme tourné : le disque glisse le long de la face sans pénétrer', () => {
  const r = T_CFG.radius;
  const { from, p, local } = localMove(debris, debris.hx + r, -0.2, -0.3, 0.4);
  assert.ok(local[1] > -0.2 + 0.35, `progression tangentielle ${(local[1] + 0.2).toFixed(3)} m`);
  assert.ok(distPointPrism(p.x, p.y, debris) >= r - 1e-6, 'arrivée hors du volume');
  assert.ok(distSegPrism(from.x, from.y, p.x, p.y, debris).d >= r - 2e-3, 'pas interpolé hors du volume');
});

test('contact près du coin arrondi : le disque contourne le coin au lieu de rester collé', () => {
  const r = T_CFG.radius;
  // Départ sur la face +x, juste avant le coin ; le pas (0,5 m, vitesse 5 m/s × DT) rentre dans la face.
  const { from, p, local } = localMove(debris, debris.hx + r, debris.hy - 0.05, -0.1, 0.49);
  assert.ok(Math.hypot(p.x - from.x, p.y - from.y) > 0.3, `déplacement ${Math.hypot(p.x - from.x, p.y - from.y).toFixed(3)} m`);
  assert.ok(local[1] > debris.hy, 'le centre a passé le coin');
  assert.ok(distPointPrism(p.x, p.y, debris) >= r - 1e-6, 'arrivée hors du volume');
});

test('anti-tunnel : un pas rapide perpendiculaire à travers une caisse fine reste bloqué avant elle', () => {
  const r = NL_CFG.radius;
  for (const dly of [0, 0.3, -0.3]) {
    const L = crate.hx + r + 0.02;
    const [fx, fy] = fromLocal(-L, 0, crate), [gx, gy] = fromLocal(L, dly, crate);
    assert.ok(distPointPrism(gx, gy, crate) >= r, 'extrémité libre de l\'autre côté');
    const from = { x: fx, y: fy }, p = { x: gx, y: gy };
    resolvePrisms(from, p, r, [crate]);
    const [lx] = toLocal(p.x, p.y, crate);
    assert.ok(lx < 0, `traversée (lx=${lx.toFixed(3)}, dérive ${dly})`);
    assert.ok(distPointPrism(p.x, p.y, crate) >= r - 1e-6, 'arrivée hors du volume');
  }
});

test('régression : graines 7 et 8, débris actifs, le Terminator `march` n\'est plus figé contre le débris du couloir', () => {
  const place = PROP_PLACES[CORRIDOR_DEBRIS_INDEX];
  for (const seed of [7, 8]) {
    const w = newWorld(seed, undefined, { propKinds: ['debris'] });
    const tactic = march();
    let at100: { x: number; y: number } | null = null;
    while (!w.done) {
      const acts = w.nls.map(n => (!n.alive ? 0 : nlFrame(n).d < 1.6 ? 7 : 1));
      step(w, tactic(w), acts);
      if (w.tick === 100) at100 = { x: w.t.x, y: w.t.y };
    }
    // Avant la correction : figé à ~1,7 m du centre du tas jusqu'au tick 1200 (temps écoulé).
    assert.ok(at100, `seed ${seed} : manche finie avant le tick 100`);
    const d = Math.hypot(at100!.x - place.x, at100!.y - place.z);
    assert.ok(d > 3, `seed ${seed} : au tick 100 le Terminator est encore à ${d.toFixed(2)} m du débris`);
    assert.notEqual(w.reason, 'temps écoulé, il a tenu', `seed ${seed} : manche finie au temps`);
  }
});
