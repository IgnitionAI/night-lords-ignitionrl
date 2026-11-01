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
function procs(): string[] { return execSync('ps -eo args=', { timeout: 20e3 }).toString().split('\n'); }
/** Tests (vitest ou bun test) en cours sur la machine. */
export function otherTests(): boolean { return procs().some(l => /(vitest|bun(\S*)? test)/.test(l)); }
export function trainingProcs(): number { return procs().filter(l => /(^|\/)node\s.*dist\/(train|bc)\.mjs/.test(l)).length; }
export function localCI(): boolean { return procs().some(l => /ci-local\/(run|q)[-\w]*\.sh|ci-local\/run-ci/.test(l)); }
function sleepSync(ms: number) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
/** Autre stack de test : docker compose en cours, ou conteneur publié sur un port 18092-18099.
 *  Sans accès au socket Docker, on lit les docker-proxy. Les ports 18095-18096 (services permanents de la machine de dev) sont exclus. */
export function otherStack(): boolean {
  const ps = procs();
  if (ps.some(l => /docker[- ]compose/.test(l))) return true;
  return ps.some(l => { const m = /docker-proxy.*-host-port (\d+)/.exec(l); const port = m ? Number(m[1]) : 0; return port >= 18092 && port <= 18099 && port !== 18095 && port !== 18096; });
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
