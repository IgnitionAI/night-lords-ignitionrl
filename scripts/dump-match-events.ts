// Rejoue une manche b6p et liste fist / claw / bolt (kill) pour horodatage vidéo.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, step, observe, DT, type TAction } from '../src/sim.ts';
import { PROP_KINDS } from '../src/props.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';
import { policyFileFromQuery } from '../src/train-b4.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = Number(process.env.SEED ?? 900000);
const autoplay = process.env.AUTOPLAY ?? 'kiter';
const play = Number(process.env.PLAY_SPEED ?? 1.75);
const out = process.env.OUT ?? join(ROOT, 'docs/captures/camera-combat', `events-${autoplay}.json`);

const sel = policyFileFromQuery(process.env.POLICY ?? 'b6p');
const actor = JSON.parse(readFileSync(join(ROOT, 'policies', sel.file), 'utf8')) as ActorJSON;
const tactic = (POOL[autoplay] ?? UNSEEN[autoplay] ?? POOL.march)();
const propsOn = process.env.PROPS !== '0';
const w = newWorld(seed, undefined, { propKinds: propsOn ? [...PROP_KINDS] : [] });
const rng = mulberry32(seed ^ 0x9e3779b9);
const idle: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };

const events: { tick: number; simT: number; videoT: number; type: string; detail: unknown }[] = [];

while (!w.done && w.tick < 1200) {
  const ta = tactic(w) ?? idle;
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    const p = softmax(forward(actor, observe(w, i)));
    return sample(p, rng);
  });
  step(w, ta, acts);
  for (const e of w.events) {
    if (e.type === 'fist' || e.type === 'claw' || e.type === 'bolt' || e.type === 'clawArm') {
      const simT = w.tick * DT;
      events.push({
        tick: w.tick, simT, videoT: simT / play, type: e.type, detail: e,
      });
    }
  }
}

const fistHit = events.find((e) => e.type === 'fist');
const clawHit = events.find((e) => e.type === 'claw' && (e.detail as { dmg?: number }).dmg);
const boltKill = events.find((e) => e.type === 'bolt' && (e.detail as { kill?: number }).kill >= 0);
const report = {
  seed, autoplay, winner: w.winner, reason: w.reason, ticks: w.tick,
  fistHit, clawHit, boltKill,
  events,
};
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  out, winner: w.winner, ticks: w.tick,
  fistHit: fistHit && { tick: fistHit.tick, videoT: fistHit.videoT },
  clawHit: clawHit && { tick: clawHit.tick, videoT: clawHit.videoT, dmg: (clawHit.detail as { dmg?: number }).dmg },
  boltKill: boltKill && { tick: boltKill.tick, videoT: boltKill.videoT, kill: (boltKill.detail as { kill?: number }).kill },
  nFist: events.filter((e) => e.type === 'fist').length,
  nClaw: events.filter((e) => e.type === 'claw').length,
  nBoltKill: events.filter((e) => e.type === 'bolt' && (e.detail as { kill?: number }).kill >= 0).length,
}));
process.exit(0);
