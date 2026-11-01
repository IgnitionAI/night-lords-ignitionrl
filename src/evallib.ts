import { newWorld, step, observe, nlFrame, DT, type World } from './sim';
import type { Tactic } from './tactics';
import { forward, softmax, sample, argmax, type ActorJSON } from './policy';
import { mulberry32 } from './rng';
import { Recorder, type Recording } from './recorder';

export type Pack = ActorJSON | 'naive' | 'random';
export function packActs(pack: Pack, w: World, rng: () => number, greedy = false): number[] {
  return w.nls.map((n, i) => {
    if (!n.alive) return 0;
    if (pack === 'random') return Math.floor(rng() * 8);
    if (pack === 'naive') { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; }
    const p = softmax(forward(pack, observe(w, i))); return greedy ? argmax(p) : sample(p, rng);
  });
}
export interface Stats { games: number; packWins: number; packWinRate: number; meanSeconds: number; medianSeconds: number; p10Seconds: number; p90Seconds: number; share30to90: number; meanNightLordsKilled: number; reasons: Record<string, number> }
export function runGames(pack: Pack, mk: (seed: number) => Tactic, n: number, seedBase = 900000): Stats {
  let wins = 0, kills = 0; const secs: number[] = []; const reasons: Record<string, number> = {};
  for (let g = 0; g < n; g++) {
    const seed = seedBase + g, t = mk(seed), w = newWorld(seed), rng = mulberry32(seed ^ 0x5bd1e995);
    while (!w.done) step(w, t(w), packActs(pack, w, rng));
    if (w.winner === 'pack') wins++; secs.push(w.tick * DT); reasons[w.reason] = (reasons[w.reason] ?? 0) + 1; kills += w.nls.filter(x => !x.alive).length;
  }
  secs.sort((a, b) => a - b); const q = (p: number) => +secs[Math.min(secs.length - 1, Math.floor(p * secs.length))].toFixed(1);
  return { games: n, packWins: wins, packWinRate: +(wins / n).toFixed(3), meanSeconds: +(secs.reduce((a, b) => a + b, 0) / n).toFixed(1), medianSeconds: q(0.5), p10Seconds: q(0.1), p90Seconds: q(0.9),
    share30to90: +(secs.filter(s => s >= 30 && s <= 90).length / n).toFixed(3), meanNightLordsKilled: +(kills / n).toFixed(2), reasons };
}
/** Une manche jouée par un « joueur » (tactique) contre la meute, enregistrée comme dans le navigateur. */
export function playRecordedRound(pack: Pack, t: Tactic, seed: number, source: string): { rec: Recording; winner: string; seconds: number } {
  const w = newWorld(seed), r = new Recorder(source), rng = mulberry32(seed ^ 0x2545f491);
  while (!w.done) { const a = t(w); r.record(w, a); step(w, a, packActs(pack, w, rng)); }
  return { rec: r.toJSON(`${w.winner} — ${w.reason}`), winner: w.winner!, seconds: w.tick * DT };
}
