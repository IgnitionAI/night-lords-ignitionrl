// Serveur LOCAL (127.0.0.1) : sert le prototype et fait le fine-tuning entre deux manches (mécanisme C).
// Un seul fine-tuning à la fois ; refuse si load ≥ 16, inodes > 88 % ou déjà 2 process d'entraînement.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { loadavg } from 'node:os';
import { inodePct, trainingProcs, localCI } from './guard';
import { summarize, type Recording } from './recorder';
import { gateDecision } from './gate';

const ROOT = process.cwd(), PORT = Number(process.env.PORT ?? 18190), FT_UPDATES = Number(process.env.FT_UPDATES ?? 30);
mkdirSync(join(ROOT, 'recordings'), { recursive: true }); mkdirSync(join(ROOT, 'policies'), { recursive: true });
let busy = false, round = 0; const session: string[] = []; // manches de la session, pour le fantôme BC
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/round') {
    let body = ''; for await (const c of req) body += c;
    const rec = JSON.parse(body) as Recording; const stamp = Date.now(); round++;
    const recPath = join(ROOT, 'recordings', `round-${stamp}.json`); writeFileSync(recPath, body);
    const summary = summarize(rec);
    const load = loadavg()[0], ino = inodePct(), procs = trainingProcs();
    if (busy || load >= 16 || ino >= 85 || procs >= 2 || localCI() || !existsSync(join(ROOT, 'policies/current-full.json'))) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, reason: `fine-tuning refusé (occupé=${busy}, load=${load.toFixed(1)}, inodes=${ino.toFixed(1)}%, process=${procs})`, summary: summary.describe }));
    }
    busy = true; const t0 = Date.now(); const out = `runs/ft-${stamp}`; session.push(recPath);
    const ghostPath = join(ROOT, `runs/ghost-${stamp}.json`);
    const b = spawnSync('node', ['dist/bc.mjs', '--out', ghostPath, ...session.slice(-3)], { cwd: ROOT, encoding: 'utf8' }); // fantôme appris sur les 3 dernières manches
    const r = b.status === 0 ? spawnSync('node', ['dist/train.mjs', '--init', 'policies/current-full.json', '--ghostBC', ghostPath, '--ghostShare', '0.5', '--updates', String(FT_UPDATES), '--envs', '16', '--out', out, '--seed', String(round)], { cwd: ROOT, encoding: 'utf8' }) : b;
    busy = false; const seconds = (Date.now() - t0) / 1000;
    let gate: ReturnType<typeof gateDecision> | null = null;
    if (r.status === 0) {
      const rd = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
      gate = gateDecision(rd('policies/current.json'), rd(`${out}/actor.json`), rd(`runs/ghost-${stamp}.json`));
      if (gate.accepted) { copyFileSync(join(ROOT, out, 'actor.json'), join(ROOT, 'policies/current.json')); copyFileSync(join(ROOT, out, 'full.json'), join(ROOT, 'policies/current-full.json')); }
    }
    writeFileSync(join(ROOT, out + '.server.json'), JSON.stringify({ seconds, status: r.status, summary: summary.describe, gate }));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: r.status === 0, seconds, updates: FT_UPDATES, roundsUsed: Math.min(3, session.length), summary: summary.describe, gate, version: gate?.accepted ? out : 'inchangée (garde-fou)', log: r.status === 0 ? undefined : r.stderr.slice(-500) }));
  }
  let p = url.pathname === '/' ? '/web/dist/index.html' : url.pathname; // page construite par vite (web/index.html est la source)
  if (p.startsWith('/policy/')) p = '/policies/' + p.slice(8);
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(f));
}).listen(PORT, '127.0.0.1', () => console.log(`proto sur http://127.0.0.1:${PORT}/`));
