import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA, PILLARS, newWorld, observe, step, type TAction } from '../src/sim.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import { forward, sample, softmax, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';
import { policyFileFromQuery } from '../src/train-b4.ts';
import {
  MELEE_LOS_PAD,
  desiredCombatPose,
  inFrustum,
  losClear,
  projectWorld,
} from '../web/combat-cam.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASPECT = 16 / 9;
const idle: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const KITER_SEEDS = [900000, 900001, 900002, 900003, 900004];

test('kiter 5 seeds : ≥ 95 % des poings ont T + cible dans le cadre (LOS alcôve)', () => {
  const sel = policyFileFromQuery('b6p');
  const actor = JSON.parse(readFileSync(join(ROOT, 'policies', sel.file), 'utf8')) as ActorJSON;
  let hits = 0;
  let visible = 0;
  const misses: string[] = [];
  for (const seed of KITER_SEEDS) {
    const tactic = (POOL.kiter ?? UNSEEN.kiter)();
    const w = newWorld(seed, undefined, { propKinds: [] });
    const rng = mulberry32(seed ^ 0x9e3779b9);
    while (!w.done && w.tick < 1200) {
      const ta = tactic(w) ?? idle;
      const acts = w.nls.map((n, i) => {
        if (!n.alive) return 0;
        return sample(softmax(forward(actor, observe(w, i))), rng);
      });
      step(w, ta, acts);
      for (const e of w.events) {
        if (e.type !== 'fist' || e.kill < 0) continue;
        hits++;
        const nl = w.nls[e.kill]!;
        const pose = desiredCombatPose({
          term: { x: w.t.x, y: w.t.y, facing: w.t.facing },
          nls: w.nls.map((n, i) => ({
            x: n.x, y: n.y,
            alive: n.alive || i === e.kill,
            armTicks: i === e.kill ? 2 : n.armTicks,
          })),
          aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA,
        });
        const tNdc = projectWorld(w.t.x, 1.4, w.t.y, pose, ASPECT);
        const nNdc = projectWorld(nl.x, 1.4, nl.y, pose, ASPECT);
        const tLos = losClear(pose.camX, pose.camY, pose.camZ, w.t.x, 1.4, w.t.y, PILLARS, MELEE_LOS_PAD);
        const nLos = losClear(pose.camX, pose.camY, pose.camZ, nl.x, 1.4, nl.y, PILLARS, MELEE_LOS_PAD);
        const ok = inFrustum(tNdc, 0.92) && inFrustum(nNdc, 0.92) && tLos && nLos;
        if (ok) visible++;
        else {
          misses.push(
            `seed=${seed} t${w.tick} T(${w.t.x.toFixed(2)},${w.t.y.toFixed(2)}) `
            + `NL(${nl.x.toFixed(2)},${nl.y.toFixed(2)}) cam=(${pose.camX.toFixed(2)},${pose.camY.toFixed(2)},${pose.camZ.toFixed(2)}) `
            + `tNdc=${tNdc.x.toFixed(2)},${tNdc.y.toFixed(2)} nNdc=${nNdc.x.toFixed(2)},${nNdc.y.toFixed(2)} tLos=${tLos} nLos=${nLos}`,
          );
        }
      }
    }
  }
  assert.ok(hits >= 1, `aucun poing connecté sur ${KITER_SEEDS.join(',')}`);
  const share = visible / hits;
  assert.ok(share >= 0.95, `visibilité poing ${visible}/${hits} = ${share.toFixed(3)}\n${misses.join('\n')}`);
});
