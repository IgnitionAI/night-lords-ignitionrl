// Harnais de mesure / smoke d'entraînement PPO : lit les politiques figées, n'écrit jamais sur b3.
// L'éval smoke passe par `runGames` (inférence JSON, pas tfjs). Un job d'entraînement long n'est pas lancé ici.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { POOL, UNSEEN, type Tactic } from './tactics';
import { runGames, type Pack, type Stats } from './evallib';
import type { ActorJSON } from './policy';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SMOKE_SEED_BASE = 910000; // hors 900000..900199 (éval b3) et 850000+ (garde C)
export const SMOKE_N = 3;
export const SMOKE_MAX_N = 8;
export const B3_EVAL_REL = 'mesures/eval-b3.json';
export const B3_PACK_VERSION = 'runs/b3@2000';

/** Artefacts gelés : le harnais refuse d'écrire dessus, y compris via un chemin absolu. */
export const FROZEN_ARTIFACTS: readonly string[] = [
  'policies/',
  'mesures/eval-b3.json',
  'mesures/eval-armement-off.json',
  'mesures/eval-armement-on.json',
  'mesures/experiment-c.json',
  'mesures/c-v2/',
  'mesures/sweep-noise.json',
  'mesures/LECTURE-EVAL-ARMEMENT.md',
  'jalon1/',
  'runs/b3/',
  'runs/base/',
  'runs/eval-b3-snap700-n50.json',
];

export const SMOKE_WRITE_PREFIXES: readonly string[] = [
  'mesures/nn-scratch/',
  'runs/nn-scratch/',
];

export interface FrozenFingerprint { path: string; sha256: string; bytes: number }
export interface MeasureOppRow extends Stats { unseen: boolean }
export interface MeasureReport {
  kind: 'nn-harness-measure';
  protocol: string;
  mode: 'measure';
  pack: string;
  packVersion: string | null;
  clawWindup: boolean;
  seeds: string;
  n: number;
  opps: string[];
  results: Record<string, MeasureOppRow>;
  comparableToB3: boolean;
  b3Reference: { file: string; packVersion: string; note: string };
  fullTrain: { status: 'not-started'; reason: string; command: string };
  wallSeconds: number;
}

export function posixRel(p: string, root: string): string {
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return abs.split(sep).join('/');
  return rel.split(sep).join('/');
}

export function isFrozenArtifact(target: string, root = REPO_ROOT): boolean {
  const rel = posixRel(target, root);
  if (rel.startsWith('/') || /^[a-zA-Z]:\//.test(rel)) return false;
  return FROZEN_ARTIFACTS.some(f => {
    if (f.endsWith('/')) return rel === f.slice(0, -1) || rel.startsWith(f);
    return rel === f;
  });
}

export function isSmokeWritePath(target: string, root = REPO_ROOT): boolean {
  const abs = resolve(root, target);
  const tmp = resolve('/tmp');
  if (abs === tmp || abs.startsWith(tmp + sep)) return true;
  const rel = posixRel(target, root);
  return SMOKE_WRITE_PREFIXES.some(p => rel === p.slice(0, -1) || rel.startsWith(p));
}

export function assertSafeWritePath(target: string, root = REPO_ROOT): void {
  if (isFrozenArtifact(target, root)) {
    throw new Error(`chemin gelé (b3 / politiques) : ${posixRel(target, root)} — le harnais refuse d'écrire`);
  }
  if (!isSmokeWritePath(target, root)) {
    throw new Error(`écriture hors bac à sable nn-scratch/tmp : ${posixRel(target, root)}`);
  }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFrozenFiles(root: string): string[] {
  const out: string[] = [];
  for (const f of FROZEN_ARTIFACTS) {
    const abs = join(root, f.endsWith('/') ? f.slice(0, -1) : f);
    try {
      const st = statSync(abs);
      if (st.isFile()) out.push(f.endsWith('/') ? f.slice(0, -1) : f);
      else if (st.isDirectory()) {
        // empreinte des fichiers connus sous le dossier gelé, sans glob récursif large
        const known = f === 'policies/' ? ['policies/current.json', 'policies/current-full.json']
          : f === 'runs/b3/' ? ['runs/b3/metrics.jsonl']
            : f === 'runs/base/' ? ['runs/base/metrics.jsonl']
              : [];
        for (const k of known) {
          try { if (statSync(join(root, k)).isFile()) out.push(k); } catch { /* absent */ }
        }
      }
    } catch { /* artefact absent de ce checkout : on ne le crée pas */ }
  }
  return [...new Set(out)];
}

export function fingerprintFrozen(root = REPO_ROOT): FrozenFingerprint[] {
  return listFrozenFiles(root).map(p => {
    const abs = join(root, p);
    const st = statSync(abs);
    return { path: p, sha256: sha256File(abs), bytes: st.size };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function loadPack(packArg: string, root: string): { pack: Pack; version: string | null } {
  if (packArg === 'naive' || packArg === 'random') return { pack: packArg, version: null };
  const abs = resolve(root, packArg);
  const j = JSON.parse(readFileSync(abs, 'utf8')) as ActorJSON;
  return { pack: j, version: j.version ?? null };
}

function mkTactic(name: string): { unseen: boolean; mk: (s: number) => Tactic } {
  if (POOL[name]) return { unseen: false, mk: () => POOL[name]() };
  if (UNSEEN[name]) return { unseen: true, mk: () => UNSEEN[name]() };
  throw new Error(`adversaire inconnu ${name}`);
}

export function runMeasure(opts: {
  pack: string;
  n: number;
  seedBase: number;
  opps: string[];
  clawWindup?: boolean;
  root?: string;
}): MeasureReport {
  const root = opts.root ?? REPO_ROOT;
  const clawWindup = opts.clawWindup ?? false;
  const { pack, version } = loadPack(opts.pack, root);
  const t0 = performance.now();
  const results: Record<string, MeasureOppRow> = {};
  for (const name of opts.opps) {
    const { unseen, mk } = mkTactic(name);
    results[name] = { unseen, ...runGames(pack, mk, opts.n, opts.seedBase, { clawWindup }) };
  }
  const comparableToB3 = opts.n === 200 && opts.seedBase === 900000 && clawWindup === false;
  return {
    kind: 'nn-harness-measure',
    protocol: 'docs/PROTOCOLE-MESURE-NN.md',
    mode: 'measure',
    pack: opts.pack,
    packVersion: version,
    clawWindup,
    seeds: `${opts.seedBase}..${opts.seedBase + opts.n - 1}`,
    n: opts.n,
    opps: opts.opps,
    results,
    comparableToB3,
    b3Reference: {
      file: B3_EVAL_REL,
      packVersion: B3_PACK_VERSION,
      note: comparableToB3
        ? 'même protocole que b3 (200 parties, seeds 900000+, clawWindup false) — comparer sans écraser eval-b3.json'
        : 'smoke : n et graines différents de b3 ; ne pas citer comme régression. Relancer n=200 seedBase=900000 pour comparer.',
    },
    fullTrain: {
      status: 'not-started',
      reason: 'le harnais smoke refuse les jobs PPO longs ; voir docs/PROTOCOLE-MESURE-NN.md',
      command: 'node dist/train.mjs --updates 2000 --envs 32 --out runs/NEW_RUN_ID --seed TRAIN_SEED',
    },
    wallSeconds: +((performance.now() - t0) / 1000).toFixed(3),
  };
}

export function comparableMetrics(report: MeasureReport): unknown {
  const { wallSeconds: _w, ...rest } = report;
  return rest;
}

export function writeHarnessReport(target: string, report: unknown, root = REPO_ROOT): void {
  assertSafeWritePath(target, root);
  const abs = resolve(root, target);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(report, null, 1) + '\n');
}

export type HarnessMode = 'measure';

function parseMode(modeRaw: string): HarnessMode {
  switch (modeRaw) {
    case 'measure': return 'measure';
    default: throw new Error(`mode inconnu ${modeRaw} — seuls les smokes de mesure sont autorisés (pas d'entraînement long)`);
  }
}

export function parseHarnessArgs(argv: string[]): {
  mode: HarnessMode;
  pack: string;
  n: number;
  seedBase: number;
  opps: string[];
  clawWindup: boolean;
  out: string;
} {
  const args = Object.fromEntries(argv.reduce<[string, string][]>((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? 'true' : arr[i + 1]]);
    return acc;
  }, []));
  const modeRaw = args.mode ?? 'measure';
  const mode = parseMode(modeRaw);
  const n = Number(args.n ?? SMOKE_N);
  if (!Number.isFinite(n) || n < 1 || n > SMOKE_MAX_N) {
    throw new Error(`n=${n} hors smoke (1..${SMOKE_MAX_N}) ; une éval complète passe par node dist/eval.mjs, pas par ce harnais`);
  }
  if (args.updates !== undefined || args.train === 'true') {
    throw new Error('entraînement refusé : ce harnais ne lance pas PPO (voir protocole, node dist/train.mjs hors chemins gelés)');
  }
  return {
    mode,
    pack: args.pack ?? 'policies/current.json',
    n,
    seedBase: Number(args.seedBase ?? SMOKE_SEED_BASE),
    opps: (args.opps ?? 'march').split(',').filter(Boolean),
    clawWindup: args['claw-windup'] !== undefined && args['claw-windup'] !== 'false',
    out: args.out ?? 'mesures/nn-scratch/smoke.json',
  };
}

export function runCli(argv: string[], root = REPO_ROOT): MeasureReport {
  const cfg = parseHarnessArgs(argv);
  switch (cfg.mode) {
    case 'measure': {
      assertSafeWritePath(cfg.out, root);
      const report = runMeasure({ ...cfg, root });
      writeHarnessReport(cfg.out, { ...report, frozen: fingerprintFrozen(root), wrote: posixRel(cfg.out, root), overwroteFrozen: false }, root);
      return report;
    }
    default: {
      const _never: never = cfg.mode;
      throw new Error(`mode non géré ${String(_never)}`);
    }
  }
}
