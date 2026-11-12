// CLI ligue : duels appariés par graine (pas de NL vs NL). Chaque génération joue seule les 4 rôles contre `march`.
// Usage : bun src/league.ts --out policies/league --n 2 --seedBase 910000
// (ne pas passer --dir : Bun le réserve comme alias de cwd)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { freezeSnapshot, hashActor, type FrozenSnapshot } from './selfplaylib';
import { EVAL_SEED_BASE, playLeagueMatch } from './leaguelib';
import { ratingsFromMatches } from './elo';
import type { ActorJSON } from './policy';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
  return acc;
}, []));

const dir = args.out ?? args.leagueOut ?? 'policies/league';
const gens = (args.gens ?? '1,10,50').split(',').map(Number);
const n = Number(args.n ?? 2);
const seedBase = Number(args.seedBase ?? EVAL_SEED_BASE);

function loadSnap(g: number): FrozenSnapshot {
  const actor = JSON.parse(readFileSync(join(dir, `gen-${g}`, 'actor.json'), 'utf8')) as ActorJSON;
  let meta: { generation?: number; seed?: number; config?: object; provenance?: string; hash?: string } = {};
  try { meta = JSON.parse(readFileSync(join(dir, `gen-${g}`, 'meta.json'), 'utf8')); } catch { /* actor.meta */ }
  const snap = freezeSnapshot(actor, {
    generation: meta.generation ?? g,
    seed: meta.seed ?? 0,
    config: (meta.config ?? {}) as object,
    provenance: meta.provenance ?? `league:load:gen-${g}`,
  });
  if (meta.hash && meta.hash !== snap.meta.hash) {
    throw new Error(`hash incompatible gen-${g}: manifeste ${meta.hash} ≠ ${snap.meta.hash}`);
  }
  if (hashActor(actor) !== snap.meta.hash) throw new Error(`hash acteur gen-${g} incohérent`);
  return snap;
}

const snaps = gens.map(loadSnap);
const byGen = Object.fromEntries(snaps.map(s => [s.meta.generation, s]));
const t0 = performance.now();
const matches = [];
let seed = seedBase;
for (let i = 0; i < gens.length; i++) {
  for (let j = i + 1; j < gens.length; j++) {
    const a = byGen[gens[i]!]!, b = byGen[gens[j]!]!;
    for (let k = 0; k < n; k++) {
      matches.push(playLeagueMatch(a, b, seed++));
    }
  }
}
const ids = gens.map(g => `gen-${g}`);
const elo = ratingsFromMatches(matches, ids);
const report = {
  dir,
  gens,
  seedBase,
  seeds: `${seedBase}..${seed - 1}`,
  nPerPairing: n,
  wallSeconds: +((performance.now() - t0) / 1000).toFixed(1),
  matches,
  elo,
};
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'matches.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, matches: matches.length, elo, seeds: report.seeds, wallSeconds: report.wallSeconds }, null, 2));
