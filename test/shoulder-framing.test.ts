import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA, DT, PILLARS, newWorld, observe, step } from '../src/sim.ts';
import { UNSEEN } from '../src/tactics.ts';
import { mulberry32 } from '../src/rng.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import {
  COMBAT_CAM,
  desiredCombatPose,
  inFrustum,
  nlOccludedByTerm,
  projectWorld,
  termHeadShoulderInFrame,
  termScreenAreaFrac,
} from '../web/combat-cam.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = [900002, 900004, 900007, 900010, 900017];
const ASPECT = 16 / 9;
const actor = JSON.parse(readFileSync(join(ROOT, 'policies/current.json'), 'utf8')) as ActorJSON;

function runSeed(seed: number) {
  const w = newWorld(seed, undefined, { clawWindup: true, propKinds: [] });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const tactic = UNSEEN.kiter!();
  let frames = 0;
  let termInFov = 0;
  let areaOk = 0;
  let headShoulderOk = 0;
  const claws: { tick: number; who: number; tIn: boolean; nlIn: boolean; nlClear: boolean }[] = [];
  let whip: { x: number; y: number; until: number } | null = null;
  while (!w.done && w.tick < 1800) {
    const ta = tactic(w);
    const acts = w.nls.map((n, i) => {
      if (!n.alive) return 0;
      return sample(softmax(forward(actor, observe(w, i))), rng);
    });
    step(w, ta, acts);
    const now = w.tick * DT;
    for (const e of w.events) {
      if (e.type === 'claw' || e.type === 'clawArm' || e.type === 'whiff') {
        const n = w.nls[e.who];
        if (n) whip = { x: n.x, y: n.y, until: now + (e.type === 'claw' ? 0.42 : 0.28) };
      }
    }
    const lookBias = whip && now < whip.until
      ? { x: whip.x, y: whip.y, k: 0.48 * Math.max(0, (whip.until - now) / 0.42) }
      : undefined;
    if (whip && now >= whip.until) whip = null;
    const term = { x: w.t.x, y: w.t.y, facing: w.t.facing };
    const pose = desiredCombatPose({
      term,
      nls: w.nls.map((n) => ({ x: n.x, y: n.y, alive: n.alive, armTicks: n.armTicks })),
      aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA, lookBias,
    });
    const tNdc = projectWorld(w.t.x, 1.4, w.t.y, pose, ASPECT);
    const tIn = inFrustum(tNdc, 0.999);
    const area = termScreenAreaFrac(term, pose, ASPECT);
    const hs = termHeadShoulderInFrame(term, pose, ASPECT);
    frames++;
    if (tIn) termInFov++;
    if (area <= COMBAT_CAM.termMaxArea) areaOk++;
    if (hs.head && hs.shoulder) headShoulderOk++;
    for (const e of w.events) {
      if (e.type !== 'claw') continue;
      const n = w.nls[e.who];
      const nIn = !!(n && inFrustum(projectWorld(n.x, 1.4, n.y, pose, ASPECT), 0.999));
      const nlClear = !!(n && nIn && !nlOccludedByTerm(pose, term, n));
      claws.push({ tick: w.tick, who: e.who, tIn, nlIn: nIn, nlClear });
    }
  }
  const clawHits = claws.length;
  const clawNlIn = claws.filter((c) => c.nlIn).length;
  const clawNlClear = claws.filter((c) => c.nlClear).length;
  return {
    seed, winner: w.winner, tick: w.tick,
    frames, termInFov, termShare: frames ? termInFov / frames : 0,
    areaOk, areaShare: frames ? areaOk / frames : 0,
    headShoulderOk, headShoulderShare: frames ? headShoulderOk / frames : 0,
    clawHits, clawNlIn, clawNlShare: clawHits ? clawNlIn / clawHits : 0,
    clawNlClear, clawClearShare: clawHits ? clawNlClear / clawHits : 0,
    claws,
  };
}

test('5 graines kiter : cadre, surface T, tête/épaule, NL griffe non masqué', () => {
  const perSeed = SEEDS.map(runSeed);
  const frames = perSeed.reduce((a, s) => a + s.frames, 0);
  const termInFov = perSeed.reduce((a, s) => a + s.termInFov, 0);
  const areaOk = perSeed.reduce((a, s) => a + s.areaOk, 0);
  const headShoulderOk = perSeed.reduce((a, s) => a + s.headShoulderOk, 0);
  const clawHits = perSeed.reduce((a, s) => a + s.clawHits, 0);
  const clawNlIn = perSeed.reduce((a, s) => a + s.clawNlIn, 0);
  const clawNlClear = perSeed.reduce((a, s) => a + s.clawNlClear, 0);
  const termShare = frames ? termInFov / frames : 0;
  const areaShare = frames ? areaOk / frames : 0;
  const headShoulderShare = frames ? headShoulderOk / frames : 0;
  const clawNlShare = clawHits ? clawNlIn / clawHits : 0;
  const clawClearShare = clawHits ? clawNlClear / clawHits : 0;
  const out = {
    autoplay: 'kiter',
    policy: 'policies/current.json',
    seeds: SEEDS,
    frames, termInFov, termShare, termTarget: 0.98,
    areaOk, areaShare, areaTarget: 0.90, termMaxArea: COMBAT_CAM.termMaxArea,
    headShoulderOk, headShoulderShare, headShoulderTarget: 0.90,
    clawHits, clawNlIn, clawNlShare, clawTarget: 0.8,
    clawNlClear, clawClearShare, clawClearTarget: 0.8,
    ok: termShare >= 0.98 && clawNlShare >= 0.8 && clawClearShare >= 0.8
      && areaShare >= 0.9 && headShoulderShare >= 0.9,
    perSeed: perSeed.map((s) => ({
      seed: s.seed, winner: s.winner, tick: s.tick,
      frames: s.frames, termShare: s.termShare,
      areaShare: s.areaShare, headShoulderShare: s.headShoulderShare,
      clawHits: s.clawHits, clawNlShare: s.clawNlShare, clawClearShare: s.clawClearShare,
    })),
  };
  const dest = join(ROOT, 'docs/captures/shoulder/framing.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  assert.ok(termShare >= 0.98, `T au cadre ${termShare} (${termInFov}/${frames})`);
  assert.ok(clawNlShare >= 0.8, `NL griffe ${clawNlShare} (${clawNlIn}/${clawHits})`);
  assert.ok(clawClearShare >= 0.8, `NL non masqué ${clawClearShare} (${clawNlClear}/${clawHits})`);
  assert.ok(areaShare >= 0.9, `surface T ≤ 40 % : ${areaShare} (${areaOk}/${frames})`);
  assert.ok(headShoulderShare >= 0.9, `tête/épaule ${headShoulderShare} (${headShoulderOk}/${frames})`);
});
