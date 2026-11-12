// Self-play : fige des snapshots de la meute ; tirage de partenaires figés (co-play) ou de sondes scriptées.
// Les tactiques scriptées restent une sonde d'environnement — elles ne sont jamais un checkpoint appris.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PPO, DEFAULT_PPO, type PPOCfg } from './ppo';
import { newWorld, step, observe, OBS_DIM, N_ACT, N_NL, type World } from './sim';
import { POOL, type Tactic } from './tactics';
import { forward, softmax, sample, type ActorJSON } from './policy';
import { mulberry32, type Rng } from './rng';

export const SNAPSHOT_FORMAT = 1;
export const SELFPLAY_SAMPLE = {
  histShare: 0.7,
  emptyPool: 'tactics' as const,
  tactics: ['march', 'turret', 'brawler', 'backpedal'] as const,
  description:
    'Co-play avec partenaires figés, pas un duel d\'adversaires : le snapshot ' +
    'contrôle les rôles 2–3 (Xarl, Cyrion), coéquipiers de la politique courante (rôles 0–1). ' +
    'Si le pool est vide : 100 % tactiques scriptées (environnement). ' +
    'Sinon : histShare=0,7 uniforme sur les snapshots figés (jamais mis à jour), ' +
    '1-histShare uniforme sur les tactiques. Tirage mulberry32 uniquement.',
};

export const SELFPLAY_PPO: PPOCfg = {
  ...DEFAULT_PPO,
  hidden: [32, 32],
  epochs: 2,
  minibatch: 256,
};

export const SELFPLAY_DEFAULTS = {
  seed: 171,
  updates: 50,
  envs: 4,
  steps: 32,
  snapshotGens: [1, 10, 50],
  out: 'policies/league',
};

export interface SnapshotConfig { updates?: number; envs?: number; steps?: number; hidden?: number[]; [k: string]: unknown }
export interface SnapshotMeta {
  version: number;
  generation: number;
  seed: number;
  config: SnapshotConfig;
  hash: string;
  provenance: string;
}
export interface FrozenSnapshot { actor: ActorJSON; meta: SnapshotMeta }

export type OpponentDraw =
  | { kind: 'snapshot'; generation: number; poolIndex: number; hash: string; learned: true }
  | { kind: 'tactic'; name: string; learned: false };

export function hashActor(actor: ActorJSON): string {
  const payload = JSON.stringify({ obsDim: actor.obsDim, nAct: actor.nAct, layers: actor.layers });
  return createHash('sha256').update(payload).digest('hex');
}

export function snapshotBytes(snap: FrozenSnapshot): string {
  return JSON.stringify({ actor: snap.actor, meta: snap.meta });
}

export function freezeSnapshot(
  actor: ActorJSON,
  info: { generation: number; seed: number; config: SnapshotConfig; provenance: string },
): FrozenSnapshot {
  const copy: ActorJSON = JSON.parse(JSON.stringify(actor));
  const meta: SnapshotMeta = {
    version: SNAPSHOT_FORMAT,
    generation: info.generation,
    seed: info.seed,
    config: info.config,
    hash: hashActor(copy),
    provenance: info.provenance,
  };
  copy.meta = { ...copy.meta, ...meta };
  return { actor: copy, meta };
}

export function sampleOpponent(rng: Rng, pool: readonly FrozenSnapshot[], histShare = SELFPLAY_SAMPLE.histShare): OpponentDraw {
  const tactics = SELFPLAY_SAMPLE.tactics;
  if (pool.length === 0 || rng() >= histShare) {
    const name = tactics[Math.floor(rng() * tactics.length)]!;
    return { kind: 'tactic', name, learned: false };
  }
  const poolIndex = Math.floor(rng() * pool.length);
  const snap = pool[poolIndex]!;
  return { kind: 'snapshot', generation: snap.meta.generation, poolIndex, hash: snap.meta.hash, learned: true };
}

interface Traj { obs: number[][]; act: number[]; lp: number[]; val: number[]; rew: number[]; done: boolean }
interface Env {
  w: World;
  tactic: Tactic;
  opp: OpponentDraw;
  frozen: FrozenSnapshot | null;
  traj: Traj[];
  currentRoles: number[];
}

function emptyTraj(): Traj { return { obs: [], act: [], lp: [], val: [], rew: [], done: false }; }

function packActsFromActor(actor: ActorJSON, w: World, i: number, rng: Rng): number {
  if (!w.nls[i].alive) return 0;
  return sample(softmax(forward(actor, observe(w, i))), rng);
}

export function runSelfPlay(opts: Partial<typeof SELFPLAY_DEFAULTS> = {}): {
  snapshots: FrozenSnapshot[];
  out: string;
  seconds: number;
  seed: number;
  updates: number;
} {
  const seed = opts.seed ?? SELFPLAY_DEFAULTS.seed;
  const U = opts.updates ?? SELFPLAY_DEFAULTS.updates;
  const E = opts.envs ?? SELFPLAY_DEFAULTS.envs;
  const K = opts.steps ?? SELFPLAY_DEFAULTS.steps;
  const snapshotGens = opts.snapshotGens ?? SELFPLAY_DEFAULTS.snapshotGens;
  const out = opts.out ?? SELFPLAY_DEFAULTS.out;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'metrics.jsonl'), '');

  const cfg: PPOCfg = { ...SELFPLAY_PPO };
  const ppo = new PPO(OBS_DIM, N_ACT, cfg, seed);
  const rng = mulberry32(seed * 7919);
  const actRng = mulberry32((seed * 7919) ^ 0x5bd1e995);
  let nextSeed = 1 + (seed * 104729) % 700000;
  const pool: FrozenSnapshot[] = [];
  const kept: FrozenSnapshot[] = [];
  const config = { updates: U, envs: E, steps: K, hidden: cfg.hidden, histShare: SELFPLAY_SAMPLE.histShare, ppo: cfg };

  const currentRolesFor = (opp: OpponentDraw) => opp.kind === 'snapshot' ? [0, 1] : [0, 1, 2, 3];

  function makeEnv(): Env {
    const s = nextSeed++;
    if (nextSeed > 899999) nextSeed = 1;
    const opp = sampleOpponent(rng, pool);
    const frozen = opp.kind === 'snapshot' ? pool[opp.poolIndex]! : null;
    const tacticName = opp.kind === 'tactic' ? opp.name : 'march';
    const tactic: Tactic = POOL[tacticName] ? POOL[tacticName]!() : POOL.march();
    const w = newWorld(s, undefined, { clawWindup: false });
    return { w, tactic, opp, frozen, traj: Array.from({ length: N_NL }, emptyTraj), currentRoles: currentRolesFor(opp) };
  }

  const envs = Array.from({ length: E }, makeEnv);
  const finished: Traj[] = [];
  const t0 = performance.now();
  let transitions = 0;

  for (let u = 1; u <= U; u++) {
    const tu = performance.now();
    for (let k = 0; k < K; k++) {
      const who: [number, number][] = [];
      const obs: number[] = [];
      envs.forEach((e, ei) => e.currentRoles.forEach(i => {
        if (e.w.nls[i].alive) { who.push([ei, i]); obs.push(...observe(e.w, i)); }
      }));
      const { probs, values } = who.length ? ppo.act(Float32Array.from(obs), who.length) : { probs: new Float32Array(), values: new Float32Array() };
      const acts = envs.map(e => new Array(N_NL).fill(0));
      who.forEach(([ei, i], q) => {
        let r = actRng(), c = 0, a = N_ACT - 1;
        for (let j = 0; j < N_ACT; j++) { c += probs[q * N_ACT + j]; if (r < c) { a = j; break; } }
        acts[ei][i] = a;
        const tr = envs[ei].traj[i];
        tr.obs.push(obs.slice(q * OBS_DIM, (q + 1) * OBS_DIM));
        tr.act.push(a);
        tr.lp.push(Math.log(probs[q * N_ACT + a] + 1e-8));
        tr.val.push(values[q]);
      });
      envs.forEach((e, ei) => {
        if (e.frozen) {
          for (const i of [2, 3]) acts[ei][i] = packActsFromActor(e.frozen.actor, e.w, i, actRng);
        }
        const stepped = step(e.w, e.tactic(e.w), acts[ei]);
        e.currentRoles.forEach(i => {
          const tr = e.traj[i];
          if (tr.obs.length > tr.rew.length) {
            tr.rew.push(stepped.rewards[i]);
            if (stepped.died[i]) { tr.done = true; finished.push(tr); e.traj[i] = emptyTraj(); }
          }
        });
        if (e.w.done) {
          e.currentRoles.forEach(i => { const tr = e.traj[i]; if (tr.obs.length) { tr.done = true; finished.push(tr); } });
          envs[ei] = makeEnv();
        }
      });
    }
    const cut: Traj[] = [];
    const nextObs: number[] = [];
    envs.forEach(e => e.currentRoles.forEach(i => {
      const tr = e.traj[i];
      if (tr.obs.length) { cut.push(tr); nextObs.push(...observe(e.w, i)); e.traj[i] = emptyTraj(); }
    }));
    const boot = cut.length ? ppo.act(Float32Array.from(nextObs), cut.length).values : new Float32Array();
    const all = [...finished.splice(0), ...cut];
    const N = all.reduce((s, t) => s + t.act.length, 0);
    if (N > 0) {
      const O = new Float32Array(N * OBS_DIM), A = new Int32Array(N), LP = new Float32Array(N), AD = new Float32Array(N), R = new Float32Array(N);
      let p = 0;
      const { gamma, lambda } = ppo.cfg;
      all.forEach((tr, ti) => {
        const T = tr.act.length;
        const last = tr.done ? 0 : boot[ti - (all.length - cut.length)] ?? 0;
        let gae = 0;
        const adv = new Array<number>(T);
        for (let t = T - 1; t >= 0; t--) {
          const nv = t === T - 1 ? last : tr.val[t + 1];
          const delta = tr.rew[t] + gamma * nv - tr.val[t];
          gae = delta + gamma * lambda * gae;
          adv[t] = gae;
        }
        for (let t = 0; t < T; t++) {
          O.set(tr.obs[t], p * OBS_DIM); A[p] = tr.act[t]; LP[p] = tr.lp[t]; AD[p] = adv[t]; R[p] = adv[t] + tr.val[t]; p++;
        }
      });
      transitions += N;
      ppo.update(O, A, LP, AD, R, actRng);
    }
    const line = { update: u, seconds: +((performance.now() - t0) / 1000).toFixed(1), updateSeconds: +((performance.now() - tu) / 1000).toFixed(2), transitions };
    appendFileSync(join(out, 'metrics.jsonl'), JSON.stringify(line) + '\n');
    if (u % 10 === 0 || u === U) console.log(JSON.stringify(line));

    if (snapshotGens.includes(u)) {
      const snap = freezeSnapshot(ppo.exportActor(`selfplay-gen-${u}`, { generation: u, seed, config }), {
        generation: u, seed, config, provenance: `selfplay:seed=${seed}:gen=${u}`,
      });
      pool.push(snap);
      kept.push(snap);
      const dir = join(out, `gen-${u}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'actor.json'), JSON.stringify(snap.actor));
      ppo.save(join(dir, 'full.json'), snap.meta);
      writeFileSync(join(dir, 'meta.json'), JSON.stringify(snap.meta, null, 2));
    }
  }

  ppo.actor.dispose();
  ppo.critic.dispose();
  ppo.optA.dispose();
  ppo.optC.dispose();

  const seconds = +((performance.now() - t0) / 1000).toFixed(1);
  const manifest = {
    format: SNAPSHOT_FORMAT,
    seed,
    updates: U,
    envs: E,
    steps: K,
    hidden: cfg.hidden,
    sample: SELFPLAY_SAMPLE,
    evalSeedBase: 910000,
    trainSeedMax: 899999,
    seconds,
    snapshots: kept.map(s => ({
      generation: s.meta.generation,
      hash: s.meta.hash,
      provenance: s.meta.provenance,
      path: `gen-${s.meta.generation}/actor.json`,
    })),
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`FIN self-play ${U} updates, ${transitions} transitions, ${seconds} s`);
  return { snapshots: kept, out, seconds, seed, updates: U };
}
