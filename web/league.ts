import { ARENA } from '../src/sim';
import { ratingsFromMatches } from '../src/elo';
import { artefactMessage, parseLeagueReport, replayTicks, type LeagueMatch } from '../src/leaguelib';
import type { ActorJSON } from '../src/policy';

const GENS = [1, 10, 50];
const MANIFEST = '/policies/league/manifest.json';
const MATCHES = '/policies/league/matches.json';

const errEl = document.getElementById('err')!;
const appEl = document.getElementById('app')!;
const homeSel = document.getElementById('home') as HTMLSelectElement;
const awaySel = document.getElementById('away') as HTMLSelectElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const metaEl = document.getElementById('matchMeta')!;
const canvas = document.getElementById('arena') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const eloBody = document.querySelector('#elo tbody')!;
const logBody = document.querySelector('#log tbody')!;

function showError(msg: string) {
  errEl.hidden = false;
  errEl.textContent = msg;
  appEl.hidden = true;
}

async function loadJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (res.status === 404) throw new Error(artefactMessage('missing', url));
  if (!res.ok) throw new Error(artefactMessage('incompatible', `${url} HTTP ${res.status}`));
  try { return await res.json(); }
  catch { throw new Error(artefactMessage('incompatible', url)); }
}

function drawFrame(frame: { nls: { x: number; y: number; alive: boolean }[]; t: { x: number; y: number; hp: number } }) {
  const sx = canvas.width / ARENA.w, sy = canvas.height / ARENA.h;
  ctx.fillStyle = '#0c1018';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3a2a18';
  ctx.beginPath();
  ctx.arc(37.5 * sx, 12 * sy, 1.6 * sx, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c47732';
  ctx.beginPath();
  ctx.arc(frame.t.x * sx, frame.t.y * sy, 7, 0, Math.PI * 2);
  ctx.fill();
  frame.nls.forEach((n, i) => {
    ctx.fillStyle = n.alive ? (i < 2 ? '#8fc9ff' : '#e8a0a0') : '#333';
    ctx.beginPath();
    ctx.arc(n.x * sx, n.y * sy, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

let raf = 0;
function playFrames(frames: ReturnType<typeof replayTicks>) {
  cancelAnimationFrame(raf);
  let i = 0;
  const tick = () => {
    drawFrame(frames[Math.min(i, frames.length - 1)]!);
    i++;
    if (i < frames.length) raf = requestAnimationFrame(tick);
  };
  tick();
}

try {
  const manifest = await loadJson(MANIFEST) as { snapshots?: { generation: number; hash: string }[] };
  const rawMatches = await loadJson(MATCHES);
  const { matches } = parseLeagueReport(rawMatches);
  const ids = GENS.map(g => `gen-${g}`);
  for (const id of ids) {
    if (!matches.some(m => m.home === id || m.away === id)) {
      throw new Error(artefactMessage('missing', `aucun match journalisé pour ${id}`));
    }
  }
  const elo = ratingsFromMatches(matches, ids);
  const hashById: Record<string, string> = {};
  for (const s of manifest.snapshots ?? []) hashById[`gen-${s.generation}`] = s.hash;
  for (const m of matches) {
    hashById[m.home] = m.homeHash;
    hashById[m.away] = m.awayHash;
  }

  const actors: Record<string, ActorJSON> = {};
  for (const g of GENS) {
    const url = `/policies/league/gen-${g}/actor.json`;
    const actor = await loadJson(url) as ActorJSON;
    if (!actor?.layers) throw new Error(artefactMessage('incompatible', url));
    actors[`gen-${g}`] = actor;
  }

  appEl.hidden = false;
  for (const g of GENS) {
    for (const sel of [homeSel, awaySel]) {
      const opt = document.createElement('option');
      opt.value = String(g);
      opt.textContent = `génération ${g}`;
      sel.append(opt);
    }
  }
  homeSel.value = '1';
  awaySel.value = '10';

  const ranked = ids.slice().sort((a, b) => elo[b]! - elo[a]!);
  eloBody.replaceChildren(...ranked.map(id => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${id}</td><td>${elo[id]!.toFixed(2)}</td><td class="hash">${hashById[id] ?? '—'}</td>`;
    return tr;
  }));

  logBody.replaceChildren(...matches.map(m => {
    const tr = document.createElement('tr');
    tr.className = m.winner === 'draw' ? 'draw' : 'win';
    tr.innerHTML = `<td>${m.home}</td><td>${m.away}</td><td class="winner">${m.winner}</td><td>${m.ticks}</td><td>${m.seed}</td><td>${m.homeDamage}/${m.awayDamage}</td>`;
    return tr;
  }));

  function pickMatch(): LeagueMatch {
    const h = `gen-${homeSel.value}`, a = `gen-${awaySel.value}`;
    if (h === a) throw new Error(artefactMessage('incompatible', 'home et away identiques'));
    const found = matches.find(m => m.home === h && m.away === a);
    if (!found) throw new Error(artefactMessage('missing', `match ${h} vs ${a} dans le journal`));
    return found;
  }

  async function runReplay() {
    try {
      const m = pickMatch();
      metaEl.textContent = `${m.home} vs ${m.away} · seed ${m.seed} · ${m.winner} · ${m.ticks} ticks · env ${m.envTactic} (checkpoint=${m.envIsCheckpoint})`;
      const frames = replayTicks(actors[m.home]!, actors[m.away]!, m.seed, 400);
      playFrames(frames);
    } catch (e) {
      metaEl.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  playBtn.addEventListener('click', () => { void runReplay(); });
  await runReplay();
} catch (e) {
  showError(e instanceof Error ? e.message : String(e));
}
