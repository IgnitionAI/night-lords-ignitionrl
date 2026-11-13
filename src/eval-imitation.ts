// Éval courte du fantôme BC contre la meute naïve. Les chiffres ne mesurent PAS un style humain.
// node dist/eval-imitation.mjs --ghost ghost.json --n 5 --seedBase 900000 --out run.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { bcGhost } from './tactics';
import { runGames } from './evallib';
import type { ActorJSON } from './policy';

const argv = process.argv.slice(2);
const str = (k: string) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : undefined);
const opt = (k: string, d: number) => (argv.includes(`--${k}`) ? Number(argv[argv.indexOf(`--${k}`) + 1]) : d);
const ghostPath = str('ghost');
if (!ghostPath) throw new Error('usage: node dist/eval-imitation.mjs --ghost ghost.json [--n 5] [--seedBase 900000] [--out out.json]');
const n = opt('n', 5), seedBase = opt('seedBase', 900000);
const ghost = JSON.parse(readFileSync(ghostPath, 'utf8')) as ActorJSON;
const t0 = performance.now();
const stats = runGames('naive', s => bcGhost(ghost, s, 0), n, seedBase, { clawWindup: false });
const report = {
  ghost: ghostPath,
  pack: 'naive',
  n,
  seedBase,
  seeds: `${seedBase}..${seedBase + n - 1}`,
  provenance: ghost.meta?.provenance ?? { kind: 'synthetic' },
  disclaimer: 'éval mécanique sur oracle/politique BC ; aucune métrique de style humain',
  wallSeconds: +((performance.now() - t0) / 1000).toFixed(1),
  stats,
};
console.log(JSON.stringify(report, null, 1));
const out = str('out');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 1)); }
