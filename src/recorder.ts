// Enregistreur des tactiques du joueur (mécanisme C) : on ne garde que ce que fait le Terminator.
import { type World, type TAction, terminatorPerceives, dist, BEACON } from './sim';
import { tObserve, encodeAction } from './tobs';

export interface Frame { tick: number; x: number; y: number; facing: number; a: TAction; contact: number; nearest: number; o?: number[]; move?: number; atk?: number }
export interface Recording { createdAt: string; source: string; frames: Frame[]; result?: string }
export interface TacticSummary {
  spawn: { x: number; y: number; facing: number }; path: [number, number][];
  boltPerContactTick: number; fistShare: number; engageDist: number; backwardRatio: number; idleRatio: number;
  meanY: number; ticks: number; describe: string;
}

export class Recorder {
  frames: Frame[] = [];
  constructor(public source = 'joueur') {}
  record(w: World, a: TAction) {
    const p = terminatorPerceives(w); let nd = 99;
    for (const i of p) nd = Math.min(nd, dist(w.nls[i].x, w.nls[i].y, w.t.x, w.t.y));
    this.frames.push({ tick: w.tick, x: +w.t.x.toFixed(2), y: +w.t.y.toFixed(2), facing: +w.t.facing.toFixed(3), a: { ...a }, contact: p.length, nearest: +nd.toFixed(2), o: tObserve(w).map(v => +v.toFixed(4)), ...encodeAction(a) });
  }
  toJSON(result?: string): Recording { return { createdAt: new Date().toISOString(), source: this.source, frames: this.frames, result }; }
}

export function summarize(r: Recording): TacticSummary {
  const f = r.frames; if (!f.length) throw new Error('enregistrement vide');
  const path: [number, number][] = [];
  for (let i = 0; i < f.length; i += 10) path.push([f[i].x, f[i].y]);
  path.push([BEACON.x, BEACON.y]);
  const contact = f.filter(x => x.contact > 0);
  const bolts = f.filter(x => x.a.bolt).length, fists = f.filter(x => x.a.fist).length;
  const engageSamples = f.filter(x => (x.a.bolt || x.a.fist) && x.nearest < 99).map(x => x.nearest).sort((a, b) => a - b);
  const moving = f.filter(x => x.a.fwd !== 0 || x.a.strafe !== 0);
  const s: TacticSummary = {
    spawn: { x: f[0].x, y: f[0].y, facing: f[0].facing }, path,
    boltPerContactTick: contact.length ? bolts / contact.length : 0,
    fistShare: bolts + fists ? fists / (bolts + fists) : 0,
    engageDist: engageSamples.length ? engageSamples[Math.floor(engageSamples.length / 2)] : 8,
    backwardRatio: moving.length ? moving.filter(x => x.a.fwd < 0).length / moving.length : 0,
    idleRatio: f.filter(x => x.a.fwd === 0 && x.a.strafe === 0 && x.a.turn === 0).length / f.length,
    meanY: f.reduce((s, x) => s + x.y, 0) / f.length, ticks: f.length, describe: '',
  };
  const side = s.meanY > 15 ? 'tu passes plutôt par le nord' : s.meanY < 9 ? 'tu passes plutôt par le sud' : 'tu passes par le centre';
  const arme = s.fistShare > 0.5 ? 'tu préfères le gantelet' : 'tu préfères le storm bolter';
  s.describe = `${side}, ${arme}, tu engages vers ${s.engageDist.toFixed(1)} m` + (s.backwardRatio > 0.3 ? ', tu recules souvent' : '') + (s.idleRatio > 0.4 ? ', tu restes souvent immobile' : '');
  return s;
}
