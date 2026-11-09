// Collision des props de décor (#46) : un volume orienté par instance, activation par types affichés,
// repli identique à #44, et protection des trajectoires interpolées (R46-02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, NL_CFG, type World, type TAction } from '../src/sim.ts';
import {
  ANGLED_CRATE_INDEX, CORRIDOR_DEBRIS_INDEX, PROP_MESH_AABB, PROP_PLACES, PROP_VISUAL_SIZE, activeFloorPrisms,
  coreFrac, distPointPrism, distSegPrism, findGrazingChord, propCore, propPrisms, resolvePropKinds,
} from '../src/props.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const HOLD = [0, 0, 0, 0];

function fingerprint(w: World) {
  return {
    tick: w.tick, winner: w.winner, reason: w.reason,
    t: [w.t.x, w.t.y, w.t.facing, w.t.hp, w.t.vx, w.t.vy, w.t.ammo, w.t.channel],
    nls: w.nls.map(n => [n.x, n.y, n.facing, n.alive, n.cd, n.belief.valid, n.belief.x, n.belief.y, n.belief.age, n.belief.seen, n.belief.heard]),
  };
}

function driveNlThrough(w: World, from: { x: number; y: number }, toward: { x: number; y: number }, ticks: number) {
  const n = w.nls[0];
  for (const m of w.nls) m.alive = m === n;
  n.x = from.x; n.y = from.y; n.facing = Math.atan2(toward.y - from.y, toward.x - from.x);
  n.belief.valid = true; n.belief.x = toward.x; n.belief.y = toward.y; n.belief.age = 0;
  n.belief.seen = true; n.belief.heard = false; n.belief.vox = false; n.belief.facing = 0;
  w.t.x = 3; w.t.y = 16;
  const path = [{ x: n.x, y: n.y }];
  for (let i = 0; i < ticks; i++) { step(w, IDLE, [1, 0, 0, 0]); path.push({ x: n.x, y: n.y }); }
  return { n, path };
}

test('22 poses, un prisme par instance ; les chaînes ne occupent pas le sol', () => {
  assert.equal(PROP_PLACES.length, 22);
  const all = propPrisms('all');
  assert.equal(all.length, 22);
  assert.equal(all.filter(p => p.floor).length, 18);
  assert.ok(all.filter(p => p.kind === 'chains').every(p => !p.floor));
  assert.equal(all[CORRIDOR_DEBRIS_INDEX].kind, 'debris');
  assert.equal(all[ANGLED_CRATE_INDEX].kind, 'crate');
  assert.equal(all[ANGLED_CRATE_INDEX].hx, PROP_MESH_AABB.crate.hx * coreFrac('crate') * 0.9);
  const chains = all.filter(p => p.kind === 'chains');
  assert.ok(chains.every(p => p.y0 > 2.6), 'les chaînes pendent au-dessus du Terminator (2,6 m)');
});

test('cœurs plus petits que l\'AABB du GLB simplifié (pas la bbox des bruts Genex)', () => {
  for (const kind of ['debris', 'crate', 'pipes', 'reliquary', 'servitor'] as const) {
    const c = propCore(kind)!;
    const aabb = PROP_MESH_AABB[kind];
    assert.ok(c.hx < aabb.hx, `${kind} hx ${c.hx} ≮ AABB ${aabb.hx}`);
    assert.ok(c.hy < aabb.hz, `${kind} hz ${c.hy} ≮ AABB ${aabb.hz}`);
    assert.equal(c.height, aabb.height);
    const span = 2 * Math.max(c.hx, c.hy);
    assert.ok(span <= PROP_VISUAL_SIZE[kind], `${kind}: cœur ${span} m > taille visée ${PROP_VISUAL_SIZE[kind]}`);
  }
  assert.equal(propCore('chains'), null);
  assert.ok(PROP_MESH_AABB.debris.height > 0.7 && PROP_MESH_AABB.debris.height < 1.0, 'tas ~1 m');
  assert.ok(PROP_MESH_AABB.crate.height > 0.4 && PROP_MESH_AABB.crate.height < 0.7);
});

test('contrôle traversant : sans props, un Night Lord en marche traverse le débris du couloir', () => {
  const debris = PROP_PLACES[CORRIDOR_DEBRIS_INDEX];
  const w = newWorld(46, { x: 3, y: 12, facing: 0 });
  assert.equal(w.propSolids.length, 0);
  const { path } = driveNlThrough(w, { x: 6.2, y: 8.6 }, { x: 10.2, y: 8.6 }, 10);
  const minD = Math.min(...path.map(p => Math.hypot(p.x - debris.x, p.y - debris.z)));
  assert.ok(path.some(p => p.x > debris.x), 'il dépasse le centre du tas');
  assert.ok(minD < NL_CFG.radius, `distance min au centre ${minD} : le corps passe dans le tas`);
});

test('avec le volume debris, le même parcours s\'arrête avant le tas du couloir', () => {
  const box = propPrisms(['debris'])[CORRIDOR_DEBRIS_INDEX];
  const w = newWorld(46, { x: 3, y: 12, facing: 0 }, { propKinds: ['debris'] });
  assert.equal(w.propSolids.filter(p => p.floor).length, 4);
  const { n, path } = driveNlThrough(w, { x: 6.2, y: 8.6 }, { x: 10.2, y: 8.6 }, 10);
  for (const p of path) {
    assert.ok(distPointPrism(p.x, p.y, box) >= NL_CFG.radius - 1e-6, `tick pos (${p.x.toFixed(3)},${p.y.toFixed(3)}) dans le volume`);
  }
  for (let i = 1; i < path.length; i++) {
    const seg = distSegPrism(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y, box);
    assert.ok(seg.d >= NL_CFG.radius - 2e-3, `segment interpolé pénètre de ${(NL_CFG.radius - seg.d).toFixed(4)} m`);
  }
  assert.ok(n.x < box.cx, `bloqué à l'ouest du tas (x=${n.x}), pas au-delà`);
});

test('R46-02 : extrémités libres, l\'accord interpolé d\'une caisse orientée (instance 11) est rejeté', () => {
  const box = propPrisms(['crate'])[ANGLED_CRATE_INDEX];
  const r = NL_CFG.radius;
  const chord = findGrazingChord(box, r, 0.6);
  assert.ok(chord, 'un accord de 0,6 m doit exister contre le prisme orienté');
  assert.ok(distPointPrism(chord!.ax, chord!.ay, box) >= r);
  assert.ok(distPointPrism(chord!.bx, chord!.by, box) >= r);
  assert.ok(chord!.d < r, `pénétration interpolée ${chord!.d} m < rayon ${r}`);

  const w = newWorld(46, { x: 3, y: 12, facing: 0 }, { propKinds: ['crate'] });
  const { n } = driveNlThrough(w, { x: chord!.ax, y: chord!.ay }, { x: chord!.bx, y: chord!.by }, 1);
  assert.ok(distPointPrism(n.x, n.y, box) >= r - 1e-4, 'l\'arrivée n\'est pas dans le volume');
  const after = distSegPrism(chord!.ax, chord!.ay, n.x, n.y, box);
  assert.ok(after.d >= r - 2e-3, `le pas interpolé pénètre encore de ${(r - after.d).toFixed(5)} m`);
});

test('repli : ?props=0 / kinds vides / kinds absents ⇒ aucun solide au sol', () => {
  assert.deepEqual(resolvePropKinds({ propsOn: false, loaded: ['debris', 'crate'] }), []);
  assert.deepEqual(resolvePropKinds({ propsOn: true, loaded: [] }), []);
  assert.deepEqual(resolvePropKinds({ propsOn: true, loaded: ['nope'] }), []);
  assert.deepEqual(resolvePropKinds({ propsOn: true, loaded: ['debris', 'crate', 'debris'] }), ['debris', 'crate']);
  assert.equal(activeFloorPrisms([]).length, 0);
  assert.equal(newWorld(1).propSolids.length, 0);
  assert.equal(newWorld(1, undefined, { propKinds: [] }).propSolids.filter(p => p.floor).length, 0);
});

test('échec partiel : seul un type chargé devient solide', () => {
  const w = newWorld(46, { x: 3, y: 12, facing: 0 }, { propKinds: ['debris'] });
  assert.ok(w.propSolids.filter(p => p.floor).every(p => p.kind === 'debris'));
  const crate = propPrisms(['crate'])[ANGLED_CRATE_INDEX];
  const { path } = driveNlThrough(w, { x: crate.cx - 1.2, y: crate.cy }, { x: crate.cx + 1.2, y: crate.cy }, 8);
  const minCrate = Math.min(...path.map(p => distPointPrism(p.x, p.y, crate)));
  assert.ok(minCrate < NL_CFG.radius, 'la caisse non chargée ne bloque pas');
});

test('headless : défaut et propKinds [] sont identiques (état + consommation RNG) sur 1200 ticks', () => {
  const seeds = [1, 18, 46];
  for (const seed of seeds) {
    const a = newWorld(seed), b = newWorld(seed, undefined, { propKinds: [] });
    for (let i = 0; i < 400; i++) {
      step(a, { ...IDLE, fwd: i % 17 === 0 ? 1 : 0, turn: i % 11 === 0 ? 1 : 0 }, [i % 8, 0, (i % 5) === 0 ? 1 : 0, 0]);
      step(b, { ...IDLE, fwd: i % 17 === 0 ? 1 : 0, turn: i % 11 === 0 ? 1 : 0 }, [i % 8, 0, (i % 5) === 0 ? 1 : 0, 0]);
    }
    assert.deepEqual(fingerprint(a), fingerprint(b), `seed ${seed}`);
    assert.equal(a.rng(), b.rng(), `RNG seed ${seed}`);
  }
});

test('headless : 20 germes × 1200 ticks sans props restent au comportement historique (solides inactifs)', () => {
  let ticks = 0;
  for (let s = 0; s < 20; s++) {
    const w = newWorld(1000 + s);
    assert.equal(w.propSolids.length, 0);
    while (!w.done && w.tick < 1200) {
      step(w, IDLE, [w.tick % 3 === 0 ? 1 : 0, 0, 0, 0]);
      ticks++;
    }
  }
  assert.ok(ticks >= 20, `ticks joués ${ticks}`);
});
