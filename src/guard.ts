// Garde-fous de la machine (jalon 1b) : load < 6, inodes < 85 %, au plus 1 entraînement, et les autres tâches de la machine passent avant :
// si une CI locale, des tests (vitest / bun test) ou une stack docker tournent, l'entraînement se met en pause.
// En cas de dépassement, on se met en PAUSE (aucun calcul) et on revérifie toutes les 60 s ; abandon après GUARD_MAX_WAIT_H heures.
import { execSync } from 'node:child_process';
import { loadavg } from 'node:os';
export const INODE_STOP = 85;
export function inodePct(): number {
  const l = execSync(`df -i ${process.env.GUARD_FS ?? '.'}`, { timeout: 20e3 }).toString().trim().split('\n').pop()!.split(/\s+/);
  return Number(l[2]) / Number(l[1]) * 100;
}
// ps peut bloquer si un process est en état D : on borne à 20 s ; un échec compte comme « pas ok » (on attend).
function procs(): { pid: number; args: string }[] {
  return execSync('ps -eo pid=,args=', { timeout: 20e3 }).toString().split('\n').flatMap(line => {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    return m ? [{ pid: Number(m[1]), args: m[2]! }] : [];
  });
}
/**
 * Vrai seulement si le process *est* un runner de tests (bun test / vitest), pas un shell
 * dont la ligne de commande cite « bun test » (ex. `bash -c 'bun test && node dist/bc.mjs'`).
 */
export function isTestRunnerArgs(args: string): boolean {
  const tokens = args.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  const wrappers = new Set(['env', 'nice', 'timeout', 'stdbuf', 'ionice']);
  let i = 0;
  while (i < tokens.length) {
    const base = tokens[i]!.replace(/^.*\//, '');
    if (!wrappers.has(base)) break;
    i++;
    while (i < tokens.length && (/^[A-Z_][\w]*=/.test(tokens[i]!) || (tokens[i]!.startsWith('-') && tokens[i] !== '--'))) {
      const flag = tokens[i]!;
      if (/^[A-Z_][\w]*=/.test(flag)) { i++; continue; }
      if (flag === '--cwd' || flag === '--preload' || flag === '--config' || flag === '--filter' || flag === '-e') {
        i += 2;
        continue;
      }
      i++;
    }
    if (tokens[i] === '--') i++;
  }
  const cmd = (tokens[i] ?? '').replace(/^.*\//, '');
  if (cmd === 'vitest') return true;
  if (cmd === 'node' || cmd === 'nodejs') {
    return tokens.slice(i + 1).some(t => /(^|\/)vitest$/.test(t.replace(/\\/g, '/')));
  }
  if (cmd === 'bun' || cmd === 'bunx') {
    const rest = tokens.slice(i + 1);
    let j = 0;
    while (j < rest.length) {
      const t = rest[j]!;
      if (t === '--') { j++; break; }
      if (t.startsWith('-')) {
        if (t === '--cwd' || t === '--preload' || t === '--config' || t === '--filter') { j += 2; continue; }
        j++;
        continue;
      }
      break;
    }
    return rest[j] === 'test';
  }
  return false;
}
/** Tests (vitest ou bun test) en cours sur la machine, hors ce process. */
export function otherTests(): boolean {
  const self = process.pid;
  return procs().some(p => p.pid !== self && isTestRunnerArgs(p.args));
}
export function trainingProcs(): number { return procs().filter(p => /(^|\/)node\s.*dist\/(train|bc)\.mjs/.test(p.args)).length; }
export function localCI(): boolean { return procs().some(p => /ci-local\/(run|q)[-\w]*\.sh|ci-local\/run-ci/.test(p.args)); }
function sleepSync(ms: number) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
/** Autre stack de test : docker compose en cours, ou conteneur publié sur un port 18092-18099.
 *  Sans accès au socket Docker, on lit les docker-proxy. Les ports 18095-18096 (services permanents de la machine de dev) sont exclus. */
export function otherStack(): boolean {
  const ps = procs();
  if (ps.some(p => /docker[- ]compose/.test(p.args))) return true;
  return ps.some(p => { const m = /docker-proxy.*-host-port (\d+)/.exec(p.args); const port = m ? Number(m[1]) : 0; return port >= 18092 && port <= 18099 && port !== 18095 && port !== 18096; });
}
export function guardState(_selfCounts = true) {
  // Pause tant qu'un test ou une autre stack tourne ; reprise à 1 seul process et load < 6.
  try {
    const load = loadavg()[0], ino = inodePct(), n = trainingProcs(), ci = localCI(), tests = otherTests(), stack = otherStack();
    return { load, ino, procs: n, ci, tests, stack, ok: !ci && !tests && !stack && load < 6 && ino < INODE_STOP && n <= 1 };
  } catch { return { load: NaN, ino: NaN, procs: NaN, ci: true, tests: true, stack: true, ok: false }; }
}
export function checkGuard(label: string, selfCounts = true) {
  const maxWait = Number(process.env.GUARD_MAX_WAIT_H ?? 8) * 3600e3; const t0 = Date.now(); let st = guardState(selfCounts), warned = false;
  while (!st.ok) {
    if (!warned) { console.error(`[garde ${label}] PAUSE ${new Date().toISOString()} load=${st.load.toFixed(2)} inodes=${st.ino.toFixed(1)}% entraînements=${st.procs} CI-locale=${st.ci} tests=${st.tests} stack=${st.stack}`); warned = true; }
    if (Date.now() - t0 > maxWait) { console.error(`[garde ${label}] abandon après attente`); process.exit(3); }
    sleepSync(60e3); st = guardState(selfCounts);
  }
  if (warned || /début|update (100|500|1000|2000)$/.test(label)) console.log(`[garde ${label}] ok load=${st.load.toFixed(2)} inodes=${st.ino.toFixed(1)}% entraînements=${st.procs} attente=${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return st;
}
