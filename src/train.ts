// Entraînement PPO multi-agents headless (Node + tfjs-node) de la meute contre des Terminators scriptés.
// Usage : node dist/train.mjs --updates 200 --out runs/base [--init runs/base/full.json] [--ghost rec.json --ghostShare 0.7]
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PPO, DEFAULT_PPO } from './ppo';
import { newWorld, step, observe, OBS_DIM, N_ACT, N_NL, type World } from './sim';
import { POOL, ghost, bcGhost, randomized, type Tactic } from './tactics';
import type { ActorJSON } from './policy';
import { summarize, type Recording } from './recorder';
import { mulberry32 } from './rng';
import { checkGuard } from './guard';

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((acc, a, i, arr) => { if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]); return acc; }, []));
const U = Number(args.updates ?? 100), E = Number(args.envs ?? 16), K = Number(args.steps ?? 128);
const out = args.out ?? 'runs/dev'; mkdirSync(out, { recursive: true });
const seed0 = Number(args.seed ?? 1); // seeds d'entraînement : 1..899 999 ; l'éval utilise 900 000+
const ghostShare = Number(args.ghostShare ?? 0.7);
checkGuard('début entraînement');

const ppo = new PPO(OBS_DIM, N_ACT, { ...DEFAULT_PPO, lr: Number(args.lr ?? DEFAULT_PPO.lr) });
if (args.init) ppo.load(args.init);
const ghostBC: ActorJSON | null = args.ghostBC ? JSON.parse(readFileSync(args.ghostBC, 'utf8')) : null;
const ghostSummary = args.ghost ? summarize(JSON.parse(readFileSync(args.ghost, 'utf8')) as Recording) : null;
const rng = mulberry32(seed0 * 7919);
let nextSeed = 1 + (seed0 * 104729) % 700000; // seeds d'entraînement < 900 000 (l'éval utilise 900 000+)

interface Traj { obs: number[][]; act: number[]; lp: number[]; val: number[]; rew: number[]; done: boolean }
interface Env { w: World; tactic: Tactic; opp: string; traj: Traj[] }
const poolNames = Object.keys(POOL);
// b4 : tirage priorisé des tactiques fixes du pool (march, turret, brawler, backpedal) selon le taux de défaite récent
// de la meute contre chacune (100 dernières parties d'entraînement). Les tactiques jamais vues restent hors entraînement.
const pfsp = args.pfsp !== 'false';
const histByOpp: Record<string, number[]> = {};
function pickFixed(fixed: string[]): string {
  if (!pfsp) return fixed[Math.floor(rng() * fixed.length)];
  const wts = fixed.map(k => { const h = histByOpp[k] ?? []; const lossRate = h.length < 20 ? 0.5 : 1 - h.reduce((a, b) => a + b, 0) / h.length; return 0.1 + lossRate; });
  let r = rng() * wts.reduce((a, b) => a + b, 0); for (let i = 0; i < fixed.length; i++) { r -= wts[i]; if (r <= 0) return fixed[i]; } return fixed[fixed.length - 1];
}
function makeEnv(): Env {
  const s = nextSeed++; let tactic: Tactic, opp: string, w: World;
  if (ghostBC && rng() < ghostShare) { opp = 'ghostBC'; tactic = bcGhost(ghostBC, s); w = newWorld(s); }
  else if (ghostSummary && rng() < ghostShare) { opp = 'ghost'; tactic = ghost(ghostSummary, s); w = newWorld(s, ghostSummary.spawn); }
  else { const fixed = poolNames.filter(k => k !== 'randomized'); opp = rng() < 0.5 ? 'randomized' : pickFixed(fixed); tactic = opp === 'randomized' ? randomized(s) : POOL[opp](); w = newWorld(s); }
  return { w, tactic, opp, traj: Array.from({ length: N_NL }, () => ({ obs: [], act: [], lp: [], val: [], rew: [], done: false })) };
}
const envs = Array.from({ length: E }, makeEnv);
const finished: Traj[] = []; const recent: { opp: string; winner: string; ticks: number }[] = [];
const t0 = performance.now(); let transitions = 0;

for (let u = 1; u <= U; u++) {
  if (u % 10 === 0) checkGuard(`update ${u}`);
  const tu = performance.now();
  for (let k = 0; k < K; k++) {
    const who: [number, number][] = []; const obs: number[] = [];
    envs.forEach((e, ei) => e.w.nls.forEach((n, i) => { if (n.alive) { who.push([ei, i]); obs.push(...observe(e.w, i)); } }));
    const { probs, values } = ppo.act(Float32Array.from(obs), who.length);
    const acts = envs.map(() => new Array(N_NL).fill(0));
    who.forEach(([ei, i], q) => {
      let r = Math.random(), c = 0, a = N_ACT - 1;
      for (let j = 0; j < N_ACT; j++) { c += probs[q * N_ACT + j]; if (r < c) { a = j; break; } }
      acts[ei][i] = a; const tr = envs[ei].traj[i];
      tr.obs.push(obs.slice(q * OBS_DIM, (q + 1) * OBS_DIM)); tr.act.push(a); tr.lp.push(Math.log(probs[q * N_ACT + a] + 1e-8)); tr.val.push(values[q]);
    });
    envs.forEach((e, ei) => {
      const { rewards, died } = step(e.w, e.tactic(e.w), acts[ei]);
      e.traj.forEach((tr, i) => { if (tr.obs.length > tr.rew.length) { tr.rew.push(rewards[i]); if (died[i]) { tr.done = true; finished.push(tr); e.traj[i] = { obs: [], act: [], lp: [], val: [], rew: [], done: false }; } } });
      if (e.w.done) {
        e.traj.forEach(tr => { if (tr.obs.length) { tr.done = true; finished.push(tr); } });
        recent.push({ opp: e.opp, winner: e.w.winner!, ticks: e.w.tick });
        (histByOpp[e.opp] ??= []).push(e.w.winner === 'pack' ? 1 : 0); if (histByOpp[e.opp].length > 100) histByOpp[e.opp].shift();
        envs[ei] = makeEnv();
      }
    });
  }
  // bootstrap des trajectoires coupées par la fin du rollout
  const cut: Traj[] = []; const nextObs: number[] = [];
  envs.forEach(e => e.traj.forEach((tr, i) => { if (tr.obs.length) { cut.push(tr); nextObs.push(...observe(e.w, i)); e.traj[i] = { obs: [], act: [], lp: [], val: [], rew: [], done: false }; } }));
  const boot = cut.length ? ppo.act(Float32Array.from(nextObs), cut.length).values : new Float32Array();
  const all = [...finished.splice(0), ...cut];
  const N = all.reduce((s, t) => s + t.act.length, 0);
  const O = new Float32Array(N * OBS_DIM), A = new Int32Array(N), LP = new Float32Array(N), AD = new Float32Array(N), R = new Float32Array(N);
  let p = 0; const { gamma, lambda } = ppo.cfg;
  all.forEach((tr, ti) => {
    const T = tr.act.length; const last = tr.done ? 0 : boot[ti - (all.length - cut.length)] ?? 0;
    let gae = 0; const adv = new Array(T);
    for (let t = T - 1; t >= 0; t--) {
      const nv = t === T - 1 ? last : tr.val[t + 1];
      const delta = tr.rew[t] + gamma * nv - tr.val[t]; gae = delta + gamma * lambda * gae; adv[t] = gae;
    }
    for (let t = 0; t < T; t++) { O.set(tr.obs[t], p * OBS_DIM); A[p] = tr.act[t]; LP[p] = tr.lp[t]; AD[p] = adv[t]; R[p] = adv[t] + tr.val[t]; p++; }
  });
  transitions += N;
  const st = ppo.update(O, A, LP, AD, R);
  const win = recent.slice(-200); const wr = win.length ? win.filter(x => x.winner === 'pack').length / win.length : NaN;
  const line = { update: u, seconds: +((performance.now() - t0) / 1000).toFixed(1), updateSeconds: +((performance.now() - tu) / 1000).toFixed(2), transitions, episodes: recent.length, packWinRateLast200Train: +wr.toFixed(3), trainWinByOpp: Object.fromEntries(Object.entries(histByOpp).map(([k, h]) => [k, +(h.reduce((a, b) => a + b, 0) / Math.max(1, h.length)).toFixed(2)])), ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +v.toFixed(4)])) };
  appendFileSync(`${out}/metrics.jsonl`, JSON.stringify(line) + '\n');
  if (u % 5 === 0 || u === U) console.log(JSON.stringify(line));
  if (u % 25 === 0 || u === U) {
    const meta = { updates: u, transitions, seconds: line.seconds, ghost: !!ghostSummary, ghostBC: args.ghostBC ?? null, init: args.init ?? null };
    ppo.save(`${out}/full.json`, meta); writeFileSync(`${out}/actor.json`, JSON.stringify(ppo.exportActor(`${out}@${u}`, meta)));
  }
}
console.log(`FIN ${U} updates, ${transitions} transitions, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
