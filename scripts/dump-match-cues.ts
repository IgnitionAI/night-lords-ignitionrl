// Rejoue une manche (même sim que le jeu) et enregistre les cues audio du directeur.
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorld, step, observe, nlFrame, DT, type TAction } from '../src/sim.ts';
import { PROP_KINDS } from '../src/props.ts';
import { POOL, UNSEEN } from '../src/tactics.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';
import { policyFileFromQuery } from '../src/train-b4.ts';
import { createMockAudioContext } from '../web/audio/mock-context.ts';
import { engine } from '../web/audio/engine.ts';
import { AudioDirector } from '../web/audio/director.ts';
import type { AudioManifest } from '../web/audio/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = Number(process.env.SEED ?? 3);
const autoplay = process.env.AUTOPLAY ?? 'brawler';
const out = process.env.OUT ?? join(ROOT, 'docs/videos/match-cues.json');

const manifest = JSON.parse(readFileSync(join(ROOT, 'web/sfx/nightlords/manifest.json'), 'utf8')) as AudioManifest;
const ctx = createMockAudioContext();
await engine.init({ context: ctx as never, manifest, autounlock: false, enabled: true, search: '' });
const silent = ctx.createBuffer(1, 512, ctx.sampleRate) as unknown as AudioBuffer;
for (const s of manifest.samples) engine.putBuffer(s.name, silent);

const cues: { t: number; name: string; gain: number }[] = [];
const orig = engine.play.bind(engine);
engine.play = (name, opts = {}) => {
  cues.push({ t: 0, name, gain: opts.gain ?? opts.intensity ?? 1 });
  return orig(name, opts);
};
engine.duck = () => { /* headless : pas de rAF */ };

let actor: ActorJSON | null = null;
try {
  const sel = policyFileFromQuery(process.env.POLICY);
  actor = JSON.parse(readFileSync(join(ROOT, 'policies', sel.file), 'utf8')) as ActorJSON;
} catch { /* naïve */ }

const tactic = (POOL[autoplay] ?? UNSEEN[autoplay] ?? POOL.march)();
const propsOn = process.env.PROPS !== '0';
const w = newWorld(seed, undefined, { propKinds: propsOn ? [...PROP_KINDS] : [] });
const rng = mulberry32(seed ^ 0x9e3779b9);
const dir = new AudioDirector();
dir.beginRound();
const idle: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };

while (!w.done && w.tick < 1200) {
  const ta = tactic(w) ?? idle;
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    if (!actor) { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; }
    const p = softmax(forward(actor, observe(w, i)));
    return sample(p, rng);
  });
  step(w, ta, acts);
  const jumps: number[] = [];
  const t0 = cues.length;
  dir.tick(w, DT, w.events, { nlJump: jumps });
  for (let i = t0; i < cues.length; i++) cues[i].t = w.tick * DT;
}
dir.endRound(w.winner);

writeFileSync(out, JSON.stringify({ seed, autoplay, winner: w.winner, ticks: w.tick, duration: w.tick * DT, cues }, null, 2));
console.log(JSON.stringify({ seed, autoplay, winner: w.winner, ticks: w.tick, duration: w.tick * DT, cues: cues.length, out }));
process.exit(0);
