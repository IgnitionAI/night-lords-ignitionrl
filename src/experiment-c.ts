// Expérience du mécanisme C : R manches d'un « joueur » jamais vu, fantôme BC, ré-entraînement entre manches.
// Trois chaînes par graine, même nombre de mises à jour :
//  - C brut   : chaque ré-entraînement contre fantôme + pool est gardé ;
//  - C garde  : la politique ré-entraînée n'est gardée que si elle bat mieux le fantôme (seeds 850000+) sans perdre plus
//               de 3 points en moyenne sur le pool ; le joueur réel n'est jamais consulté pour cette décision ;
//  - contrôle : mêmes mises à jour, pool seul, sans fantôme.
// Imitation : précision du BC sur des blocs de frames tenus à part, et écart de comportement
// |victoires(base vs fantôme) − victoires(base vs joueur)| sur 200 parties (0 = le fantôme se joue comme le joueur).
// Usage : node dist/experiment-c.mjs --base policies --player elite --seeds 1,2,3 --rounds 3 --ft 30 --n 200 --ghostShare 0.5 --out mesures/experiment-c.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { UNSEEN, POOL, bcGhost } from './tactics';
import { runGames, playRecordedRound } from './evallib';
import type { ActorJSON } from './policy';
import { checkGuard } from './guard';
import { gateDecision } from './gate';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]); return acc; }, []));
const base = args.base, player = args.player ?? 'elite', seeds = (args.seeds ?? '1,2,3').split(',').map(Number), R = Number(args.rounds ?? 3), F = Number(args.ft ?? 30), N = Number(args.n ?? 200);
const share = args.ghostShare ?? '0.5', G = Number(args.gateN ?? 100);
const baseFull = args.baseFull ?? (base === 'policies' ? 'policies/current-full.json' : `${base}/full.json`);
const baseActorPath = base === 'policies' ? 'policies/current.json' : `${base}/actor.json`;
const dir = args.dir ?? `runs/expC-${player}`; mkdirSync(dir, { recursive: true });
const load = (p: string): ActorJSON => JSON.parse(readFileSync(p, 'utf8'));
function node(script: string, a: string[]) {
  checkGuard(`expC ${script}`, false);
  const t0 = performance.now(); const r = spawnSync('node', [script, ...a], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr.slice(-1500)); throw new Error(`${script} a échoué`); }
  return { seconds: (performance.now() - t0) / 1000, out: r.stdout };
}
const mkPlayer = () => UNSEEN[player]();
const fixedPool = Object.keys(POOL).filter(k => k !== 'randomized');
const evalOn = (actor: ActorJSON) => ({
  player: runGames(actor, mkPlayer, N),
  pool: Object.fromEntries(fixedPool.map(k => [k, runGames(actor, () => POOL[k](), N).packWinRate])),
});
const ft = (init: string, ghost: string | null, out: string, seed: number) =>
  node('dist/train.mjs', ['--init', init, ...(ghost ? ['--ghostBC', ghost, '--ghostShare', share] : []), '--updates', String(F), '--envs', '16', '--out', out, '--seed', String(seed)]);

const baseActor = load(baseActorPath); const baseEval = evalOn(baseActor);
console.log(`base vs ${player}: ${baseEval.player.packWins}/${N}`);
const perSeed: any[] = [];
for (const s of seeds) {
  let raw = baseFull, rawActor = baseActor, gated = baseFull, gatedActor = baseActor; const recs: string[] = []; const rounds: any[] = [];
  for (let r = 1; r <= R; r++) {
    // la manche est jouée contre la politique déployée (chaîne avec garde-fou), comme en vrai
    const pr = playRecordedRound(gatedActor, mkPlayer(), 800000 + s * 100 + r, `joueur synthétique ${player}`);
    const rp = `${dir}/s${s}-round${r}.json`; writeFileSync(rp, JSON.stringify(pr.rec)); recs.push(rp);
    const g = `${dir}/s${s}-ghost${r}.json`; node('dist/bc.mjs', ['--out', g, ...recs]);
    const ghost = load(g); const bcMeta = ghost.meta as any;
    const fidelity = { baseVsGhost: runGames(baseActor, x => bcGhost(ghost, x), N).packWinRate, baseVsPlayer: baseEval.player.packWinRate };
    const o1 = `${dir}/s${s}-raw${r}`; ft(raw, g, o1, s * 10 + r); raw = `${o1}/full.json`; rawActor = load(`${o1}/actor.json`);
    const o2 = `${dir}/s${s}-gated${r}`; ft(gated, g, o2, s * 10 + r + 200); const cand = load(`${o2}/actor.json`);
    const gate = gateDecision(gatedActor, cand, ghost, G);
    if (gate.accepted) { gated = `${o2}/full.json`; gatedActor = cand; }
    rounds.push({ round: r, roundWinner: pr.winner, roundSeconds: pr.seconds, frames: pr.rec.frames.length, bc: bcMeta, fidelity, gate });
    console.log(`seed ${s} manche ${r}: ${pr.winner} en ${pr.seconds.toFixed(0)} s | BC val joint=${bcMeta.accVal?.joint} (majorité ${bcMeta.majorityVal?.joint}) | base vs fantôme ${fidelity.baseVsGhost} / vs joueur ${fidelity.baseVsPlayer} | garde ${gate.accepted ? 'acceptée' : 'refusée'} ${JSON.stringify(gate)}`);
  }
  let ctl = baseFull, ctlActor = baseActor;
  for (let r = 1; r <= R; r++) { const o = `${dir}/s${s}-ctl${r}`; ft(ctl, null, o, s * 10 + r + 500); ctl = `${o}/full.json`; ctlActor = load(`${o}/actor.json`); }
  const res = { seed: s, rounds, afterRaw: evalOn(rawActor), afterGated: evalOn(gatedActor), afterControl: evalOn(ctlActor) };
  perSeed.push(res);
  console.log(`seed ${s}: base ${baseEval.player.packWinRate} → C brut ${res.afterRaw.player.packWinRate} | C garde ${res.afterGated.player.packWinRate} | contrôle ${res.afterControl.player.packWinRate}`);
}
const ms = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { mean: +m.toFixed(3), sd: +Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)).toFixed(3), values: xs.map(v => +v.toFixed(3)) }; };
const P = (k: string) => perSeed.map(p => p[k].player.packWinRate);
const lastRounds = perSeed.map(p => p.rounds[p.rounds.length - 1]);
const summary = {
  player, rounds: R, ftUpdatesPerRound: F, ghostShare: Number(share), gamesPerEval: N, seeds, base: baseEval.player.packWinRate,
  afterRaw: ms(P('afterRaw')), afterGated: ms(P('afterGated')), afterControl: ms(P('afterControl')),
  gainRawVsControl: ms(perSeed.map(p => p.afterRaw.player.packWinRate - p.afterControl.player.packWinRate)),
  gainGatedVsControl: ms(perSeed.map(p => p.afterGated.player.packWinRate - p.afterControl.player.packWinRate)),
  imitationValJoint: ms(lastRounds.map(r => r.bc.accVal.joint)), majorityValJoint: ms(lastRounds.map(r => r.bc.majorityVal.joint)),
  behaviourGap: ms(lastRounds.map(r => Math.abs(r.fidelity.baseVsGhost - r.fidelity.baseVsPlayer))),
  gateAccepted: perSeed.map(p => p.rounds.map((r: any) => r.gate.accepted)),
};
writeFileSync(args.out ?? 'mesures/experiment-c.json', JSON.stringify({ summary, baseEval, perSeed }, null, 1));
console.log(JSON.stringify(summary, null, 1));
