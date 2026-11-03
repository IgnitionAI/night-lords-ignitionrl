// Expérience du mécanisme C (jalon 1b) : 3 manches d'un « joueur » jamais vu, fantôme BC, fine-tuning entre manches.
// Contrôle : même nombre de mises à jour de fine-tuning, sans fantôme (pool seul), pour isoler l'effet du fantôme.
// Usage : node dist/experiment-c.mjs --base runs/b1 --player elite --seeds 1,2,3 --rounds 3 --ft 30 --n 200 --out mesures/experiment-c.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { UNSEEN, POOL, bcGhost } from './tactics';
import { runGames, playRecordedRound } from './evallib';
import type { ActorJSON } from './policy';
import { checkGuard } from './guard';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]); return acc; }, []));
const base = args.base, player = args.player ?? 'elite', seeds = (args.seeds ?? '1,2,3').split(',').map(Number), R = Number(args.rounds ?? 3), F = Number(args.ft ?? 30), N = Number(args.n ?? 200);
const dir = `runs/expC-${player}`; mkdirSync(dir, { recursive: true });
const load = (p: string): ActorJSON => JSON.parse(readFileSync(p, 'utf8'));
function node(script: string, a: string[]) {
  checkGuard(`expC ${script}`, false);
  const t0 = performance.now(); const r = spawnSync('node', [script, ...a], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr.slice(-1500)); throw new Error(`${script} a échoué`); }
  return { seconds: (performance.now() - t0) / 1000, out: r.stdout };
}
const mkPlayer = () => UNSEEN[player]();
const evalOn = (actor: ActorJSON) => ({
  player: runGames(actor, mkPlayer, N),
  pool: Object.fromEntries(Object.keys(POOL).filter(k => k !== 'randomized').map(k => [k, runGames(actor, () => POOL[k](), N).packWinRate])),
});
const baseActor = load(`${base}/actor.json`); const baseEval = evalOn(baseActor);
console.log(`base vs ${player}: ${baseEval.player.packWins}/${N}`);
const perSeed: any[] = [];
for (const s of seeds) {
  let cur = `${base}/full.json`, curActor = baseActor; const recs: string[] = []; const rounds: any[] = [];
  for (let r = 1; r <= R; r++) {
    const pr = playRecordedRound(curActor, mkPlayer(), 800000 + s * 100 + r, `joueur synthétique ${player}`);
    const rp = `${dir}/s${s}-round${r}.json`; writeFileSync(rp, JSON.stringify(pr.rec)); recs.push(rp);
    const g = `${dir}/s${s}-ghost${r}.json`; const bc = node('dist/bc.mjs', ['--out', g, ...recs]);
    const bcMeta = load(g).meta;
    const o = `${dir}/s${s}-ft${r}`; const ft = node('dist/train.mjs', ['--init', cur, '--ghostBC', g, '--ghostShare', '0.7', '--updates', String(F), '--envs', '16', '--out', o, '--seed', String(s * 10 + r)]);
    cur = `${o}/full.json`; curActor = load(`${o}/actor.json`);
    rounds.push({ round: r, roundWinner: pr.winner, roundSeconds: pr.seconds, frames: pr.rec.frames.length, bc: bcMeta, bcWallSeconds: +bc.seconds.toFixed(1), ftWallSeconds: +ft.seconds.toFixed(1) });
    console.log(`seed ${s} manche ${r}: ${pr.winner} en ${pr.seconds.toFixed(0)} s, BC val move=${bcMeta.accVal.move} atk=${bcMeta.accVal.atk}, ft ${ft.seconds.toFixed(0)} s`);
  }
  // contrôle : mêmes R×F mises à jour, pool seul
  let ctl = `${base}/full.json`, ctlActor = baseActor;
  for (let r = 1; r <= R; r++) { const o = `${dir}/s${s}-ctl${r}`; node('dist/train.mjs', ['--init', ctl, '--updates', String(F), '--envs', '16', '--out', o, '--seed', String(s * 10 + r + 500)]); ctl = `${o}/full.json`; ctlActor = load(`${o}/actor.json`); }
  const lastGhost = load(`${dir}/s${s}-ghost${R}.json`);
  const res = { seed: s, rounds, afterC: evalOn(curActor), afterControl: evalOn(ctlActor), baseVsGhost: runGames(baseActor, x => bcGhost(lastGhost, x), N).packWinRate };
  perSeed.push(res);
  console.log(`seed ${s}: base ${baseEval.player.packWinRate} → C ${res.afterC.player.packWinRate} | contrôle ${res.afterControl.player.packWinRate} | base vs fantôme ${res.baseVsGhost}`);
}
const ms = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { mean: +m.toFixed(3), sd: +Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)).toFixed(3), values: xs }; };
const summary = {
  player, rounds: R, ftUpdatesPerRound: F, gamesPerEval: N, seeds,
  base: baseEval.player.packWinRate,
  afterC: ms(perSeed.map(p => p.afterC.player.packWinRate)),
  afterControl: ms(perSeed.map(p => p.afterControl.player.packWinRate)),
  gainC: ms(perSeed.map(p => p.afterC.player.packWinRate - baseEval.player.packWinRate)),
  gainCvsControl: ms(perSeed.map(p => p.afterC.player.packWinRate - p.afterControl.player.packWinRate)),
  baseVsGhost: ms(perSeed.map(p => p.baseVsGhost)),
};
writeFileSync(args.out ?? 'mesures/experiment-c.json', JSON.stringify({ summary, baseEval, perSeed }, null, 1));
console.log(JSON.stringify(summary, null, 1));
