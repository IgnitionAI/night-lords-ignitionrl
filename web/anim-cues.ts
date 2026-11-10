// Hooks d'événements d'animation (présentation). Le FX (`fx/`) et l'audio se calent ici,
// pas sur le tick de sim : frame d'anticipation, d'impact, de tir, de réception.

export type AnimCueKind = 'anticipation' | 'impact' | 'recovery' | 'fire' | 'land';
export type AnimRole = 'TERM' | 'NL-1' | 'NL-2' | 'NL-3' | 'NL-4';

export interface AnimCue {
  kind: AnimCueKind;
  role: AnimRole;
  clip: string;
  time: number;
  who: number | 'term';
}

export interface ClipMarkers {
  anticipation: number;
  impact: readonly number[];
  recovery: number;
  fire?: number;
  land?: number;
}

export const CLIP_MARKERS: Record<string, ClipMarkers> = {
  'proc-attack': { anticipation: 0.08, impact: [0.26], recovery: 0.36 },
  'proc-combo': { anticipation: 0.08, impact: [0.18, 0.38, 0.62], recovery: 0.78 },
  'proc-leap': { anticipation: 0.10, impact: [0.38], recovery: 0.58, land: 0.38 },
  'proc-shoot': { anticipation: 0.08, impact: [], recovery: 0.34, fire: 0.18 },
  'proc-punch': { anticipation: 0.12, impact: [0.66], recovery: 0.80 },
  'proc-hit': { anticipation: 0.05, impact: [0.11], recovery: 0.20 },
  'proc-hit-front': { anticipation: 0.04, impact: [0.10], recovery: 0.22 },
  'proc-hit-back': { anticipation: 0.04, impact: [0.10], recovery: 0.22 },
  'proc-hit-left': { anticipation: 0.04, impact: [0.10], recovery: 0.22 },
  'proc-hit-right': { anticipation: 0.04, impact: [0.10], recovery: 0.22 },
  'proc-stagger': { anticipation: 0.06, impact: [0.14], recovery: 0.32 },
  'proc-dodge': { anticipation: 0.06, impact: [0.14], recovery: 0.26 },
  'proc-dodge-left': { anticipation: 0.05, impact: [0.14], recovery: 0.28 },
  'proc-dodge-right': { anticipation: 0.05, impact: [0.14], recovery: 0.28 },
  'proc-death': { anticipation: 0.08, impact: [0.48], recovery: 0.80, land: 0.48 },
  'proc-death-throw': { anticipation: 0.06, impact: [0.22], recovery: 0.80, land: 0.55 },
  'proc-death-collapse': { anticipation: 0.10, impact: [0.36], recovery: 0.80, land: 0.50 },
  'proc-death-dismember': { anticipation: 0.08, impact: [0.28], recovery: 0.80, land: 0.52 },
};

const RING = 48;
const ring: AnimCue[] = [];
const listeners = new Set<(cue: AnimCue) => void>();

export function subscribeAnimCues(fn: (cue: AnimCue) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitAnimCue(cue: AnimCue): void {
  ring.push(cue);
  if (ring.length > RING) ring.shift();
  for (const fn of listeners) fn(cue);
}

export function peekAnimCues(): readonly AnimCue[] {
  return ring;
}

export function clearAnimCues(): void {
  ring.length = 0;
}

export function markersFor(clipName: string): ClipMarkers | null {
  return CLIP_MARKERS[clipName] ?? null;
}

function crossed(prev: number, now: number, mark: number): boolean {
  return prev < mark && now >= mark;
}

export function scanClipMarkers(
  clipName: string,
  prevTime: number,
  time: number,
  meta: { role: AnimRole; who: number | 'term' },
): AnimCue[] {
  const m = markersFor(clipName);
  if (!m) return [];
  const out: AnimCue[] = [];
  const push = (kind: AnimCueKind, t: number) => {
    out.push({ kind, role: meta.role, clip: clipName, time: t, who: meta.who });
  };
  if (crossed(prevTime, time, m.anticipation)) push('anticipation', m.anticipation);
  for (const t of m.impact) if (crossed(prevTime, time, t)) push('impact', t);
  if (crossed(prevTime, time, m.recovery)) push('recovery', m.recovery);
  if (m.fire !== undefined && crossed(prevTime, time, m.fire)) push('fire', m.fire);
  if (m.land !== undefined && crossed(prevTime, time, m.land)) push('land', m.land);
  return out;
}

export function roleOfIndex(i: number): AnimRole {
  switch (i) {
    case 0: return 'NL-1';
    case 1: return 'NL-2';
    case 2: return 'NL-3';
    case 3: return 'NL-4';
    default: return 'NL-1';
  }
}
