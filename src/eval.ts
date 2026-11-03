// Éval : taux de victoire et durées sur N parties par adversaire, seeds tenues à part (900 000+), politiques figées.
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { POOL, UNSEEN, bcGhost, randomized, type Tactic } from './tactics';
import { runGames, type Pack } from './evallib';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]); return acc; }, []));
const N = Number(args.n ?? 200), seedBase = Number(args.seedBase ?? 900000);
// `--claw-windup` : présence = armement actif (règles réellement jouées) ; absence ou `--claw-windup false` = règles b3.
const clawWindup = args['claw-windup'] !== undefined && args['claw-windup'] !== 'false';
const packArg = args.pack ?? 'naive';
const pack: Pack = packArg.endsWith('.json') ? JSON.parse(readFileSync(packArg, 'utf8')) : (packArg as 'naive' | 'random');
const opps: Record<string, (s: number) => Tactic> = {};
for (const k of (args.opps ?? 'march,turret,brawler,backpedal,wallHugger,kiter,elite').split(',')) {
  if (k.startsWith('ghostBC=')) { const m = JSON.parse(readFileSync(k.slice(8), 'utf8')); opps['ghostBC'] = s => bcGhost(m, s); }
  else if (k === 'randomized') opps[k] = s => randomized(s);
  else if (POOL[k]) opps[k] = () => POOL[k](); else if (UNSEEN[k]) opps[k] = () => UNSEEN[k]();
  else throw new Error(`adversaire inconnu ${k}`);
}
const t0 = performance.now(); const results: Record<string, unknown> = {};
for (const [name, mk] of Object.entries(opps)) results[name] = { unseen: !!UNSEEN[name], ...runGames(pack, mk, N, seedBase, { clawWindup }) };
const report = { pack: packArg, clawWindup, seeds: `${seedBase}..${seedBase + N - 1}`, wallSeconds: +((performance.now() - t0) / 1000).toFixed(1), results };
console.log(JSON.stringify(report, null, 1));
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 1));
