// Mesure présentation-only : part des coups de griffe où l'assaillant est dans le champ FPS autoplay.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, step, observe } from '../src/sim.ts';
import { UNSEEN } from '../src/tactics.ts';
import { mulberry32 } from '../src/rng.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import {
  freshLook, pickAutoplayFocus, steerFpsLook, nlInLook, wrapPi,
} from '../web/camera/fps.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = [900007, 900002, 900004, 900010, 900017];
const actor = JSON.parse(readFileSync(join(ROOT, 'policies/current.json'), 'utf8')) as ActorJSON;

function runSeed(seed: number) {
  const w = newWorld(seed, undefined, { clawWindup: true, propKinds: [] });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const tactic = UNSEEN.kiter!();
  const look = freshLook(w.t.facing);
  let lock: ReturnType<typeof pickAutoplayFocus>['lock'] = null;
  const claws: {
    tick: number; t: number; who: number; zone: string; d: number; inFov: boolean; yaw: number;
  }[] = [];
  while (!w.done && w.tick < 1800) {
    const ta = tactic(w);
    const acts = w.nls.map((n, i) => {
      if (!n.alive) return 0;
      return sample(softmax(forward(actor, observe(w, i))), rng);
    });
    step(w, ta, acts);
    const aim = pickAutoplayFocus(w.t, w.nls, w.events, lock, w.tick);
    lock = aim.lock;
    if (aim.focus) steerFpsLook(look, aim.focus, aim.snap);
    else look.yaw += wrapPi(w.t.facing - look.yaw) * 0.22;
    for (const e of w.events) {
      if (e.type !== 'claw') continue;
      const n = w.nls[e.who];
      const d = n ? Math.hypot(n.x - w.t.x, n.y - w.t.y) : 0;
      const inFov = !!(n && nlInLook(look.yaw, w.t, n));
      claws.push({ tick: w.tick, t: +(w.tick * 0.1).toFixed(2), who: e.who, zone: e.zone, d: +d.toFixed(3), inFov, yaw: +look.yaw.toFixed(3) });
    }
  }
  const hits = claws.length;
  const inFov = claws.filter((c) => c.inFov).length;
  return { seed, hits, inFov, share: hits ? inFov / hits : 0, claws, winner: w.winner, tick: w.tick };
}

const perSeed = SEEDS.map(runSeed);
const hits = perSeed.reduce((a, s) => a + s.hits, 0);
const inFov = perSeed.reduce((a, s) => a + s.inFov, 0);
const share = hits ? inFov / hits : 0;
const out = {
  autoplay: 'kiter',
  policy: 'policies/current.json',
  meleeAimM: 3,
  seeds: SEEDS,
  hits,
  inFov,
  share,
  target: 0.8,
  ok: share >= 0.8,
  perSeed: perSeed.map((s) => ({ seed: s.seed, hits: s.hits, inFov: s.inFov, share: s.share, winner: s.winner, tick: s.tick, claws: s.claws })),
};
const dest = join(ROOT, 'docs/captures/fps/claw-view.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ share, hits, inFov, ok: out.ok, perSeed: perSeed.map((s) => ({ seed: s.seed, hits: s.hits, inFov: s.inFov, share: +s.share.toFixed(3) })) }, null, 2));
if (!out.ok) process.exit(1);
