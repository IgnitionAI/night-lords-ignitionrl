import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newWorld, step } from './sim';
import { wallHugger, bcGhost, type Tactic } from './tactics';
import { packActs, type Pack } from './evallib';
import { mulberry32 } from './rng';
import { Recorder, type Recording, type Frame } from './recorder';
import { framesFromRecordings, mergeDaggerFrames, trainBehaviorCloning } from './bc-lib';
import type { Provenance } from './recording-schema';
import type { ActorJSON } from './policy';

export interface DaggerOpts {
  recordings: unknown[];
  outDir: string;
  seed?: number;
  iters?: number;
  epochs?: number;
  patience?: number;
  hidden?: number;
  maxTicks?: number;
  maxNewFrames?: number;
  pack?: Pack;
  expert?: 'wallHugger';
}

export interface DaggerResult {
  provenance: Provenance;
  disclaimer: string;
  initialFrames: number;
  aggregatedFrames: number;
  framesSeenByCheckpoint: number;
  valIndexMax: number;
  itersUsed: number;
  newFrames: number;
  checkpoint: string;
}

function expertOf(name: DaggerOpts['expert']): Tactic {
  switch (name) {
    case 'wallHugger':
    case undefined:
      return wallHugger();
    default: {
      const _e: never = name;
      throw new Error(String(_e));
    }
  }
}

function collectPolicyStates(actor: ActorJSON, expert: Tactic, pack: Pack, seed: number, maxTicks: number, maxNew: number): Frame[] {
  const w = newWorld(seed, undefined, { clawWindup: false });
  const rng = mulberry32(seed ^ 0x0d06_6e1);
  const rec = new Recorder('oracle synthétique DAgger (pas un humain)', {
    kind: 'synthetic', label: 'oracle synthétique DAgger', oracle: 'wallHugger',
  });
  const policy = bcGhost(actor, seed, 0);
  let added = 0;
  while (!w.done && w.tick < maxTicks && added < maxNew) {
    rec.record(w, expert(w));
    added++;
    step(w, policy(w), packActs(pack, w, rng));
  }
  return rec.toJSON('synthétique — états visités par la politique, labels oracle').frames;
}

export function runDagger(opts: DaggerOpts): DaggerResult {
  const seed = opts.seed ?? 1, iters = opts.iters ?? 2, epochs = opts.epochs ?? 2;
  const patience = opts.patience ?? 2, hidden = opts.hidden ?? 32;
  const maxTicks = opts.maxTicks ?? 40, maxNewFrames = opts.maxNewFrames ?? 40;
  const pack = opts.pack ?? 'naive';
  const expert = expertOf(opts.expert);
  mkdirSync(opts.outDir, { recursive: true });

  const { recs, X } = framesFromRecordings(opts.recordings);
  const initialFrames = X.length;
  const dataset: Recording[] = recs.map(r => ({ ...r }));
  let extraCount = 0;
  let lastActor: ActorJSON | null = null;
  let checkpoint = 'ghost-iter-0.json';
  let itersUsed = 0;
  let newFrames = 0;

  const fit = (iter: number) => {
    const extraIdx = Array.from({ length: extraCount }, (_, k) => initialFrames + k);
    const { train, val } = mergeDaggerFrames(initialFrames, extraIdx);
    const out = join(opts.outDir, `ghost-iter-${iter}.json`);
    const runJson = join(opts.outDir, `run-iter-${iter}.json`);
    const trained = trainBehaviorCloning({
      recordings: dataset,
      out,
      runJson,
      epochs,
      patience,
      hidden,
      seed: seed + iter,
      trainIdx: train,
      valIdx: val,
      versionPrefix: `dagger-iter${iter}`,
      extraMeta: {
        initialFrames,
        daggerIter: iter,
        extraFrames: extraCount,
        framesSeenByCheckpoint: initialFrames + extraCount,
      },
    });
    lastActor = trained.actor;
    checkpoint = `ghost-iter-${iter}.json`;
    itersUsed = iter;
  };

  fit(0);
  for (let i = 1; i <= iters; i++) {
    const room = maxNewFrames * iters - extraCount;
    if (room <= 0 || !lastActor) break;
    const take = Math.min(maxNewFrames, room);
    const more = collectPolicyStates(lastActor, expert, pack, seed + 1000 + i, maxTicks, take);
    if (!more.length) break;
    dataset.push({
      createdAt: new Date().toISOString(),
      source: 'oracle synthétique DAgger (pas un humain)',
      provenance: { kind: 'synthetic', label: 'oracle synthétique DAgger', oracle: 'wallHugger' },
      frames: more,
      result: 'synthétique — agrégation DAgger',
    });
    extraCount += more.length;
    newFrames += more.length;
    fit(i);
  }

  const aggregatedFrames = initialFrames + extraCount;
  const result: DaggerResult = {
    provenance: (lastActor?.meta?.provenance as Provenance) ?? { kind: 'synthetic', label: 'oracle synthétique DAgger', oracle: 'wallHugger' },
    disclaimer: String(lastActor?.meta?.disclaimer ?? 'oracle synthétique : aucune métrique de style humain'),
    initialFrames,
    aggregatedFrames,
    framesSeenByCheckpoint: aggregatedFrames,
    valIndexMax: initialFrames - 1,
    itersUsed,
    newFrames,
    checkpoint,
  };
  writeFileSync(join(opts.outDir, 'dagger.json'), JSON.stringify(result, null, 1));
  return result;
}
