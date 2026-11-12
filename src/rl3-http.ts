import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRecording, RecordingSchemaError } from './recording-schema';
import { trainBehaviorCloning } from './bc-lib';
import { runDagger } from './dagger';
import type { Recording } from './recorder';

export interface Rl3State {
  root: string;
  dir: string;
  recDir: string;
  busy: boolean;
  recordings: string[];
  ghostPath: string | null;
  runPath: string | null;
}

interface Persisted {
  busy: boolean;
  recordings: string[];
  ghostPath: string | null;
  runPath: string | null;
}

function stateFile(root: string) { return join(root, 'runs/rl3/state.json'); }

function persist(st: Rl3State) {
  mkdirSync(st.dir, { recursive: true });
  const p: Persisted = { busy: st.busy, recordings: st.recordings, ghostPath: st.ghostPath, runPath: st.runPath };
  writeFileSync(stateFile(st.root), JSON.stringify(p));
}

export function createRl3State(root: string): Rl3State {
  const dir = join(root, 'runs/rl3');
  const recDir = join(root, 'recordings/rl3');
  mkdirSync(dir, { recursive: true });
  mkdirSync(recDir, { recursive: true });
  const st: Rl3State = { root, dir, recDir, busy: false, recordings: [], ghostPath: null, runPath: null };
  const f = stateFile(root);
  if (existsSync(f)) {
    const p = JSON.parse(readFileSync(f, 'utf8')) as Persisted;
    st.busy = !!p.busy;
    st.recordings = p.recordings ?? [];
    st.ghostPath = p.ghostPath ?? null;
    st.runPath = p.runPath ?? null;
  }
  return st;
}

export async function rl3Handle(method: string, path: string, body: string, st: Rl3State): Promise<{ status: number; json: unknown }> {
  try {
    if (method === 'POST' && path === '/api/rl3/record') {
      const rec = validateRecording(JSON.parse(body || 'null'));
      const file = join(st.recDir, `round-${Date.now()}.json`);
      writeFileSync(file, JSON.stringify(rec));
      st.recordings.push(file);
      persist(st);
      return { status: 200, json: { ok: true, path: file, frames: rec.frames.length, provenance: rec.provenance } };
    }
    if (method === 'POST' && path === '/api/rl3/train') {
      if (st.busy) return { status: 409, json: { error: 'entraînement déjà en cours' } };
      const args = body ? JSON.parse(body) as { seed?: number; epochs?: number; dagger?: boolean } : {};
      const recs = loadRecordings(st);
      if (!recs.length) return { status: 400, json: { error: 'données absentes : aucun recording RL3 validé' } };
      st.busy = true; persist(st);
      try {
        if (args.dagger) {
          const r = runDagger({
            recordings: recs,
            outDir: st.dir,
            seed: args.seed ?? 1,
            iters: 1,
            epochs: args.epochs ?? 2,
            patience: 2,
            hidden: 32,
            maxTicks: 30,
            maxNewFrames: 30,
            pack: 'naive',
            expert: 'wallHugger',
          });
          st.ghostPath = join(st.dir, r.checkpoint);
          st.runPath = join(st.dir, 'dagger.json');
          persist(st);
          return { status: 200, json: { ok: true, ...r } };
        }
        const ghostPath = join(st.dir, 'ghost.json');
        const runPath = join(st.dir, 'run.json');
        const r = trainBehaviorCloning({
          recordings: recs,
          out: ghostPath,
          runJson: runPath,
          epochs: args.epochs ?? 5,
          patience: 5,
          seed: args.seed ?? 1,
          hidden: 32,
        });
        st.ghostPath = ghostPath;
        st.runPath = runPath;
        persist(st);
        return { status: 200, json: { ok: true, ghost: ghostPath, run: runPath, meta: r.meta } };
      } finally {
        st.busy = false; persist(st);
      }
    }
    if (method === 'GET' && path === '/api/rl3/status') {
      if (!st.runPath || !existsSync(st.runPath)) return { status: 404, json: { error: 'run JSON absent' } };
      return { status: 200, json: JSON.parse(readFileSync(st.runPath, 'utf8')) };
    }
    if (method === 'GET' && path === '/api/rl3/ghost') {
      if (!st.ghostPath || !existsSync(st.ghostPath)) return { status: 404, json: { error: 'checkpoint absent' } };
      return { status: 200, json: JSON.parse(readFileSync(st.ghostPath, 'utf8')) };
    }
    return { status: 404, json: { error: `route inconnue ${method} ${path}` } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = e instanceof RecordingSchemaError || /observation|vide|incompatible|corrompu/.test(msg) ? 400 : 500;
    return { status, json: { error: msg } };
  }
}

function loadRecordings(st: Rl3State): Recording[] {
  return st.recordings.filter(p => existsSync(p)).map(p => JSON.parse(readFileSync(p, 'utf8')) as Recording);
}
