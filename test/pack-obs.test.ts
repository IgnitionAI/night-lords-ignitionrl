// Observation versionnée : sim.ts inchangée (32), b8 ajoute 2 features ; b5/vis2 jouent identiquement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, step, observe, OBS_DIM, NL_CFG, T_CFG, BEACON, dist, type TAction } from '../src/sim.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';
import {
  BASE_OBS_DIM, B8_OBS_DIM, beaconFeatures, observePack, expandActorObs, packObsDim, obsDimOf,
} from '../src/pack-obs.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };

test('OBS_DIM sim reste 32 ; observePack(32) = observe() ; les 2 extras bougent avec T→balise', () => {
  assert.equal(OBS_DIM, 32);
  assert.equal(BASE_OBS_DIM, 32);
  assert.equal(B8_OBS_DIM, 34);
  const far = newWorld(21, undefined, { clawWindup: false });
  far.t.x = 3; far.t.y = 12; far.t.vx = 0; far.t.vy = 0;
  const near = newWorld(21, undefined, { clawWindup: false });
  near.t.x = BEACON.x; near.t.y = BEACON.y; near.t.vx = 0; near.t.vy = 0;
  const closing = newWorld(21, undefined, { clawWindup: false });
  closing.t.x = 20; closing.t.y = 12; closing.t.vx = T_CFG.fwd; closing.t.vy = 0;

  const o32 = observe(far, 0);
  const p32 = observePack(far, 0, 32);
  assert.equal(o32.length, 32);
  assert.deepEqual(p32, o32);
  const p34 = observePack(far, 0, 34);
  assert.equal(p34.length, 34);
  assert.deepEqual(p34.slice(0, 32), o32);

  const fFar = beaconFeatures(far);
  const fNear = beaconFeatures(near);
  const fClose = beaconFeatures(closing);
  assert.ok(fFar.distNorm > fNear.distNorm, `loin ${fFar.distNorm} vs balise ${fNear.distNorm}`);
  assert.ok(fNear.distNorm < 0.1);
  assert.ok(fClose.closing > 0.5, `fermeture ${fClose.closing}`);
  assert.equal(observePack(far, 0, 34)[32], fFar.distNorm);
  assert.equal(observePack(closing, 0, 34)[33], fClose.closing);
  assert.throws(() => packObsDim(33));
});

test('observePack / beaconFeatures ne font pas avancer la sim', () => {
  const w = newWorld(3, undefined, { clawWindup: false });
  const before = { x: w.t.x, hp: w.t.hp, tick: w.tick, nlx: w.nls[0].x };
  observePack(w, 0, 32);
  observePack(w, 0, 34);
  beaconFeatures(w);
  assert.equal(w.t.x, before.x);
  assert.equal(w.t.hp, before.hp);
  assert.equal(w.tick, before.tick);
  assert.equal(w.nls[0].x, before.nlx);
  step(w, IDLE, [0, 0, 0, 0]);
  assert.equal(w.tick, 1);
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

function playActs(pack: ActorJSON, seed: number, dim: 32 | 34, ticks = 80): number[][] {
  const w = newWorld(seed, undefined, { clawWindup: false });
  const rng = mulberry32(seed ^ 0x5bd1e995);
  const tactic = POOL.march();
  const out: number[][] = [];
  while (!w.done && w.tick < ticks) {
    const acts = w.nls.map((n, i) => {
      if (!n.alive) return 0;
      return sample(softmax(forward(pack, observePack(w, i, dim))), rng);
    });
    out.push(acts);
    step(w, tactic(w), acts);
  }
  return out;
}

test('non-régression : actions identiques b5 et vis2 sur 8 seeds (observe 32 vs pack.obsDim)', () => {
  const b5 = JSON.parse(readFileSync(join(ROOT, 'policies/current.json'), 'utf8')) as ActorJSON;
  const vis2 = JSON.parse(readFileSync(join(ROOT, 'policies/candidates/b6/actor.json'), 'utf8')) as ActorJSON;
  assert.equal(b5.obsDim, 32);
  assert.equal(vis2.obsDim, 32);
  assert.equal(obsDimOf(b5), 32);
  assert.equal(vis2.version.includes('b6'), true);
  const seeds = [900000, 900001, 900002, 900003, 900010, 900050, 900100, 900199];
  for (const pack of [b5, vis2]) {
    for (const seed of seeds) {
      const a = playActs(pack, seed, 32);
      const w = newWorld(seed, undefined, { clawWindup: false });
      const rng = mulberry32(seed ^ 0x5bd1e995);
      const tactic = POOL.march();
      const legacy: number[][] = [];
      while (!w.done && w.tick < 80) {
        const acts = w.nls.map((n, i) => {
          if (!n.alive) return 0;
          return sample(softmax(forward(pack, observe(w, i))), rng);
        });
        legacy.push(acts);
        step(w, tactic(w), acts);
      }
      assert.deepEqual(a, legacy, `${pack.version} seed ${seed}`);
    }
  }
});

test('chirurgie vis2 : poids à zéro sur les nouvelles entrées ⇒ logits identiques', () => {
  const vis2 = JSON.parse(readFileSync(join(ROOT, 'policies/candidates/b6/actor.json'), 'utf8')) as ActorJSON;
  const b8 = expandActorObs(vis2, 34);
  assert.equal(b8.obsDim, 34);
  assert.equal(b8.layers[0].inDim, 34);
  assert.equal(b8.layers[0].w.length, 34 * 128);
  const extra = b8.layers[0].w.slice(32 * 128);
  assert.ok(extra.every(v => v === 0));
  const seeds = [900000, 900041, 900077];
  for (const seed of seeds) {
    const w = newWorld(seed, undefined, { clawWindup: false });
    w.t.x = 32; w.t.y = 22.5; w.t.vx = T_CFG.fwd;
    for (let i = 0; i < 4; i++) {
      const z32 = forward(vis2, observe(w, i));
      const z34 = forward(b8, observePack(w, i, 34));
      assert.equal(z32.length, z34.length);
      for (let k = 0; k < z32.length; k++) {
        assert.ok(Math.abs(z32[k] - z34[k]) < 1e-9, `seed ${seed} nl ${i} logit ${k}: ${z32[k]} vs ${z34[k]}`);
      }
    }
  }
  const kiter = UNSEEN.kiter();
  const rngA = mulberry32(900000 ^ 0x5bd1e995);
  const rngB = mulberry32(900000 ^ 0x5bd1e995);
  const wa = newWorld(900000, undefined, { clawWindup: false });
  const wb = newWorld(900000, undefined, { clawWindup: false });
  for (let t = 0; t < 40; t++) {
    const aa = wa.nls.map((n, i) => n.alive ? sample(softmax(forward(vis2, observe(wa, i))), rngA) : 0);
    const ab = wb.nls.map((n, i) => n.alive ? sample(softmax(forward(b8, observePack(wb, i, 34))), rngB) : 0);
    assert.deepEqual(aa, ab, `tick ${t}`);
    step(wa, kiter(wa), aa);
    step(wb, kiter(wb), ab);
    assert.equal(wa.t.x, wb.t.x);
    assert.equal(dist(wa.t.x, wa.t.y, wb.t.x, wb.t.y), 0);
  }
});
