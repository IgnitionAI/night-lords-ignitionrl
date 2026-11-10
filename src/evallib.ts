import { newWorld, step, observe, nlFrame, dist, DT, type World } from './sim';
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
export interface Stats {
  games: number; packWins: number; packWinRate: number; meanSeconds: number; medianSeconds: number;
  p10Seconds: number; p25Seconds: number; p75Seconds: number; p90Seconds: number; share30to90: number;
  meanNightLordsKilled: number; clawArms: number; reasons: Record<string, number>;
  teleports: number; meanEngagements: number; shareTicksFar: number; shareTicksMelee: number;
}
/**
 * `opts.clawWindup` : armement des griffes. Défaut `false` ⇒ mesures comparables aux runs b3 ; `true` ⇒ règles
 * réellement jouées (le build jouable a l'armement actif). `clawArms` compte les annonces observées, ce qui rend
 * les deux régimes distinguables dans un rapport.
 */
export function runGames(pack: Pack, mk: (seed: number) => Tactic, n: number, seedBase = 900000, opts: { clawWindup?: boolean } = {}): Stats {
  const clawWindup = opts.clawWindup ?? false;
  let wins = 0, kills = 0, clawArms = 0, teleports = 0, engSum = 0, farTicks = 0, meleeTicks = 0, allTicks = 0;
  const secs: number[] = []; const reasons: Record<string, number> = {};
  const MELEE = 3.0, FAR = 8.0;
  for (let g = 0; g < n; g++) {
    // évaluation : sans armement par défaut, exactement les règles des mesures b3
    const seed = seedBase + g, t = mk(seed), w = newWorld(seed, undefined, { clawWindup }), rng = mulberry32(seed ^ 0x5bd1e995);
    let inMelee = false, engagements = 0;
    while (!w.done) {
      step(w, t(w), packActs(pack, w, rng));
      if (clawWindup) for (const e of w.events) if (e.type === 'clawArm') clawArms++; // `step` vide `w.events` : il faut compter à chaque tick
      allTicks++;
      let minD = Infinity;
      for (const n of w.nls) if (n.alive) { const d = dist(n.x, n.y, w.t.x, w.t.y); if (d < minD) minD = d; }
      if (minD > FAR) farTicks++;
      if (minD < MELEE) {
        meleeTicks++;
        if (!inMelee) { engagements++; inMelee = true; }
      } else inMelee = false;
    }
    if (w.winner === 'pack') wins++; secs.push(w.tick * DT); reasons[w.reason] = (reasons[w.reason] ?? 0) + 1; kills += w.nls.filter(x => !x.alive).length;
    if (w.reason === 'téléporté') teleports++;
    engSum += engagements;
  }
  secs.sort((a, b) => a - b); const q = (p: number) => +secs[Math.min(secs.length - 1, Math.floor(p * secs.length))].toFixed(1);
  return {
    games: n, packWins: wins, packWinRate: +(wins / n).toFixed(3),
    meanSeconds: +(secs.reduce((a, b) => a + b, 0) / n).toFixed(1), medianSeconds: q(0.5),
    p10Seconds: q(0.1), p25Seconds: q(0.25), p75Seconds: q(0.75), p90Seconds: q(0.9),
    share30to90: +(secs.filter(s => s >= 30 && s <= 90).length / n).toFixed(3),
    meanNightLordsKilled: +(kills / n).toFixed(2), clawArms, reasons,
    teleports, meanEngagements: +(engSum / n).toFixed(2),
    shareTicksFar: allTicks ? +(farTicks / allTicks).toFixed(3) : 0,
    shareTicksMelee: allTicks ? +(meleeTicks / allTicks).toFixed(3) : 0,
  };
}
/** Une manche jouée par un « joueur » (tactique) contre la meute, enregistrée comme dans le navigateur. */
export function playRecordedRound(pack: Pack, t: Tactic, seed: number, source: string): { rec: Recording; winner: string; seconds: number } {
  const w = newWorld(seed, undefined, { clawWindup: false }), r = new Recorder(source), rng = mulberry32(seed ^ 0x2545f491); // même règle que l'éval (manches enregistrées pour le fantôme)
  while (!w.done) { const a = t(w); r.record(w, a); step(w, a, packActs(pack, w, rng)); }
  return { rec: r.toJSON(`${w.winner} — ${w.reason}`), winner: w.winner!, seconds: w.tick * DT };
}
