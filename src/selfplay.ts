// CLI self-play borné : snapshots aux générations 1 / 10 / 50.
// Usage : bun src/selfplay.ts --updates 50 --envs 4 --steps 32 --seed 171 --out policies/league
import { runSelfPlay, SELFPLAY_DEFAULTS } from './selfplaylib';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
  return acc;
}, []));

const r = runSelfPlay({
  seed: Number(args.seed ?? SELFPLAY_DEFAULTS.seed),
  updates: Number(args.updates ?? SELFPLAY_DEFAULTS.updates),
  envs: Number(args.envs ?? SELFPLAY_DEFAULTS.envs),
  steps: Number(args.steps ?? SELFPLAY_DEFAULTS.steps),
  out: args.out ?? SELFPLAY_DEFAULTS.out,
  snapshotGens: args.snapshotGens
    ? String(args.snapshotGens).split(',').map(Number)
    : SELFPLAY_DEFAULTS.snapshotGens,
});
console.log(JSON.stringify({ ok: true, seed: r.seed, updates: r.updates, seconds: r.seconds, snapshots: r.snapshots.map(s => ({ generation: s.meta.generation, hash: s.meta.hash })) }, null, 2));
