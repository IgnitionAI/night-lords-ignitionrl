// Sonde de règles : rejoue une politique figée sous plusieurs variantes de T_CFG / NL_CFG (aucun entraînement).
// Usage : npx tsx src/probe-rules.ts policies/current.json 50 '[{"name":"x","T":{"hp":45}}]'
import { readFileSync } from 'node:fs';
import { T_CFG, NL_CFG } from './sim';
import { POOL, UNSEEN } from './tactics';
import { runGames } from './evallib';
const pack = JSON.parse(readFileSync(process.argv[2], 'utf8')); const n = Number(process.argv[3] ?? 50);
const variants = JSON.parse(process.argv[4]);
const T0 = { ...T_CFG }, N0 = { ...NL_CFG };
for (const v of variants) { for (const greedy of v.greedyBoth ? [false, true] : [false]) {
  Object.assign(T_CFG, T0, v.T ?? {}); Object.assign(NL_CFG, N0, v.NL ?? {});
  const out: string[] = [];
  for (const k of ['march', 'turret', 'brawler', 'backpedal', 'wallHugger', 'kiter', 'elite']) {
    const mk = POOL[k] ?? UNSEEN[k]; const s = runGames(pack, () => mk(), n, 900000, greedy);
    out.push(`${k} ${s.packWins}/${n} med=${s.medianSeconds}`);
  }
  console.log(JSON.stringify({ ...v, greedy }), '|', out.join(' | '));
}}
