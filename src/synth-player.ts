// Joueur synthétique (PAS un humain) : joue une tactique hors pool contre la meute et produit un
// enregistrement au même format que le navigateur. Sert à tester le mécanisme C de bout en bout.
import { readFileSync, writeFileSync } from 'node:fs';
import { newWorld, step } from './sim';
import { wallHugger } from './tactics';
import { Recorder } from './recorder';
import { forward, softmax, sample, type ActorJSON } from './policy';
import { mulberry32 } from './rng';
import { observePack, obsDimOf } from './pack-obs';
const [actorPath, out, seedS] = process.argv.slice(2);
const actor: ActorJSON = JSON.parse(readFileSync(actorPath, 'utf8'));
const seed = Number(seedS ?? 424242); const w = newWorld(seed); const t = wallHugger(); const rec = new Recorder('joueur synthétique wallHugger'); const rng = mulberry32(seed);
const dim = obsDimOf(actor);
while (!w.done) { const a = t(w); rec.record(w, a); step(w, a, w.nls.map((n, i) => n.alive ? sample(softmax(forward(actor, observePack(w, i, dim))), rng) : 0)); }
writeFileSync(out, JSON.stringify(rec.toJSON(`${w.winner} — ${w.reason}`)));
console.log(`enregistrement ${out} : ${rec.frames.length} ticks, ${w.winner} (${w.reason})`);
