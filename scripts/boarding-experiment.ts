import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { getView, resolve, shareReports, type View, type World } from '../src/strategy/engine';
import { boardingPlan } from '../src/strategy/boarding-agents';
import type { ActorJSON, DenseJSON } from '../src/policy';
import type { MissionId } from '../src/strategy/tactics';

export const runRoot = 'runs/boarding/autonomie';
export const evidence = 'docs/boarding/autonomie';
export const seeds = [4101, 4102, 4103];
export const missions: MissionId[] = ['breach', 'blackout', 'recovery'];
export const trainResidues = [0, 1, 2, 3, 4, 6];
export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const readJSON = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
export const actorPath = (seed: number, branch: string, update: number) =>
  runRoot + '/' + seed + '/' + branch + '-' + update + '.json';
export const initial = JSON.parse(gunzipSync(readFileSync(evidence + '/depart.json.gz')).toString());
export function initialActor(): ActorJSON {
  const layers: DenseJSON[] = [];
  for (let i = 0; i < initial.actor.length; i += 2) {
    const kernel = initial.actor[i], bias = initial.actor[i + 1];
    const round = (x: number) => +x.toFixed(5);
    layers.push({ inDim: kernel.shape[0], outDim: kernel.shape[1], w: kernel.data.map(round),
      b: bias.data.map(round), act: i + 2 < initial.actor.length ? 'tanh' : 'linear' });
  }
  const actor = { version: 'boarding-v2', obsDim: initial.obsDim, nAct: initial.nAct, layers, meta: initial.meta };
  if (digest(JSON.stringify(actor)) !== '8572445acd591c9a2c398375dd1eedf2580c2a7a76be6c2e4ddf2a75cf66f3bf') {
    throw Error('Starting policy differs from the shipped policy');
  }
  return actor;
}
export function commanderViews(w: World) {
  const raw = [getView(w, 0), getView(w, 1)];
  return raw.map((v, i) => shareReports(v, raw[1 - i]));
}
export function advance(w: World, views: View[], choices: number[], player: ReturnType<typeof boardingPlan>) {
  const plans = views.map((v, i) => boardingPlan(v, choices[i]));
  resolve(w, [...player.orders, ...plans.flatMap(p => p.orders)], [], {
    '-1': { card: player.card }, '0': { card: plans[0].card }, '1': { card: plans[1].card },
  });
}
export function trainingCase(index: number) {
  const offset = index % 108;
  return { seed: 24000 + trainResidues[offset % 6] + 12 * Math.floor(index / 108),
    mission: missions[Math.floor(offset / 6) % 3], style: Math.floor(offset / 18) };
}
