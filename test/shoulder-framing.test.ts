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
  desiredCombatPose,
  inFrustum,
  projectWorld,
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
  const claws: { tick: number; who: number; tIn: boolean; nlIn: boolean }[] = [];
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
      ? { x: whip.x, y: whip.y, k: 0.16 * Math.max(0, (whip.until - now) / 0.42) }
      : undefined;
    if (whip && now >= whip.until) whip = null;
    const pose = desiredCombatPose({
      term: { x: w.t.x, y: w.t.y, facing: w.t.facing },
      nls: w.nls.map((n) => ({ x: n.x, y: n.y, alive: n.alive, armTicks: n.armTicks })),
      aspect: ASPECT, portrait: false, pillars: PILLARS, arena: ARENA, lookBias,
    });
    const tNdc = projectWorld(w.t.x, 1.4, w.t.y, pose, ASPECT);
    const tIn = inFrustum(tNdc, 0.999);
    frames++;
    if (tIn) termInFov++;
    for (const e of w.events) {
      if (e.type !== 'claw') continue;
      const n = w.nls[e.who];
      const nIn = !!(n && inFrustum(projectWorld(n.x, 1.4, n.y, pose, ASPECT), 0.999));
      claws.push({ tick: w.tick, who: e.who, tIn, nlIn: nIn });
    }
  }
  const clawHits = claws.length;
  const clawNlIn = claws.filter((c) => c.nlIn).length;
  return {
    seed, winner: w.winner, tick: w.tick,
    frames, termInFov, termShare: frames ? termInFov / frames : 0,
    clawHits, clawNlIn, clawNlShare: clawHits ? clawNlIn / clawHits : 0,
    claws,
  };
}

test('5 graines kiter : T au cadre ≥ 98 %, NL attaquant ≥ 80 % des griffes', () => {
  const perSeed = SEEDS.map(runSeed);
  const frames = perSeed.reduce((a, s) => a + s.frames, 0);
  const termInFov = perSeed.reduce((a, s) => a + s.termInFov, 0);
  const clawHits = perSeed.reduce((a, s) => a + s.clawHits, 0);
  const clawNlIn = perSeed.reduce((a, s) => a + s.clawNlIn, 0);
  const termShare = frames ? termInFov / frames : 0;
  const clawNlShare = clawHits ? clawNlIn / clawHits : 0;
  const out = {
    autoplay: 'kiter',
    policy: 'policies/current.json',
    seeds: SEEDS,
    frames, termInFov, termShare, termTarget: 0.98,
    clawHits, clawNlIn, clawNlShare, clawTarget: 0.8,
    ok: termShare >= 0.98 && clawNlShare >= 0.8,
    perSeed: perSeed.map((s) => ({
      seed: s.seed, winner: s.winner, tick: s.tick,
      frames: s.frames, termShare: s.termShare,
      clawHits: s.clawHits, clawNlShare: s.clawNlShare,
    })),
  };
  const dest = join(ROOT, 'docs/captures/shoulder/framing.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  assert.ok(termShare >= 0.98, `T au cadre ${termShare} (${termInFov}/${frames})`);
  assert.ok(clawNlShare >= 0.8, `NL griffe ${clawNlShare} (${clawNlIn}/${clawHits})`);
});
