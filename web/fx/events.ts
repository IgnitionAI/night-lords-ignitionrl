// Couche de présentation : les événements de sim deviennent des impulsions VFX.
// Si la sim n'émet pas de « mur touché », on le déduit du rayon (clip piliers).

import { PILLARS, type Ev, type World } from '../../src/sim';
import { clipRayToAabbs } from './hits';

export type FxKind =
  | 'bolt'
  | 'boltImpact'
  | 'boltKill'
  | 'fist'
  | 'fistKill'
  | 'clawArm'
  | 'claw'
  | 'clawArmor'
  | 'whiff'
  | 'hit'
  | 'death'
  | 'servoCritical';

export type FxCueGate = 'anticipation' | 'impact' | 'fire' | 'land';

/** Cales présentation : le pulse attend le marqueur d'anim, pas le tick de sim. */
export function fxCueFor(kind: FxKind): FxCueGate | null {
  switch (kind) {
    case 'bolt':
    case 'boltImpact':
    case 'boltKill':
      return 'fire';
    case 'clawArm':
      return 'anticipation';
    case 'claw':
    case 'clawArmor':
    case 'whiff':
    case 'fist':
    case 'fistKill':
      return 'impact';
    case 'death':
      return 'land';
    case 'hit':
    case 'servoCritical':
      return null;
    default: {
      const _n: never = kind;
      return _n;
    }
  }
}

export const FX_CUE_FALLBACK: Record<FxCueGate, number> = {
  fire: 0.18,
  anticipation: 0.08,
  impact: 0.18,
  land: 0.48,
};

export interface FxPulse {
  kind: FxKind;
  x: number;
  y: number;
  tx: number;
  ty: number;
  who: number;
  zone: 'front' | 'side' | 'rear' | null;
  wall: boolean;
  nx: number;
  ny: number;
}

export interface ActorSample {
  t: { x: number; y: number; facing: number };
  nls: readonly { x: number; y: number; facing: number }[];
}

export function eventsToFxPulses(events: readonly Ev[], w: ActorSample | World): FxPulse[] {
  const out: FxPulse[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'bolt': {
        const kill = e.kill >= 0;
        const clip = kill
          ? { x: e.tx, y: e.ty, hit: false, nx: 0, ny: 0, t: 1 }
          : clipRayToAabbs(e.x, e.y, e.tx, e.ty, PILLARS);
        out.push({
          kind: 'bolt', x: e.x, y: e.y, tx: clip.x, ty: clip.y,
          who: e.kill, zone: null, wall: clip.hit, nx: clip.nx, ny: clip.ny,
        });
        out.push({
          kind: kill ? 'boltKill' : 'boltImpact',
          x: clip.x, y: clip.y, tx: clip.x, ty: clip.y,
          who: e.kill, zone: null, wall: clip.hit && !kill, nx: clip.nx, ny: clip.ny,
        });
        if (kill) {
          const n = w.nls[e.kill];
          out.push({
            kind: 'death', x: n?.x ?? clip.x, y: n?.y ?? clip.y, tx: e.x, ty: e.y,
            who: e.kill, zone: null, wall: false, nx: 0, ny: 0,
          });
        }
        break;
      }
      case 'fist': {
        const tx = w.t.x;
        const ty = w.t.y;
        const facing = w.t.facing;
        const hx = tx + Math.cos(facing) * 1.4;
        const hy = ty + Math.sin(facing) * 1.4;
        out.push({
          kind: 'fist', x: hx, y: hy, tx, ty, who: e.kill, zone: null, wall: false, nx: 0, ny: 0,
        });
        if (e.kill >= 0) {
          const n = w.nls[e.kill];
          out.push({
            kind: 'fistKill', x: n?.x ?? hx, y: n?.y ?? hy, tx, ty,
            who: e.kill, zone: null, wall: false, nx: 0, ny: 0,
          });
          out.push({
            kind: 'death', x: n?.x ?? hx, y: n?.y ?? hy, tx, ty,
            who: e.kill, zone: null, wall: false, nx: 0, ny: 0,
          });
        }
        break;
      }
      case 'clawArm': {
        const n = w.nls[e.who];
        out.push({
          kind: 'clawArm', x: n?.x ?? 0, y: n?.y ?? 0, tx: w.t.x, ty: w.t.y,
          who: e.who, zone: null, wall: false, nx: 0, ny: 0,
        });
        break;
      }
      case 'claw': {
        const n = w.nls[e.who];
        const kind: FxKind = e.dmg > 0 ? 'claw' : 'clawArmor';
        out.push({
          kind, x: w.t.x, y: w.t.y, tx: n?.x ?? w.t.x, ty: n?.y ?? w.t.y,
          who: e.who, zone: e.zone, wall: false, nx: 0, ny: 0,
        });
        break;
      }
      case 'whiff': {
        const n = w.nls[e.who];
        out.push({
          kind: 'whiff', x: n?.x ?? 0, y: n?.y ?? 0, tx: w.t.x, ty: w.t.y,
          who: e.who, zone: null, wall: false, nx: 0, ny: 0,
        });
        break;
      }
      case 'hit': {
        out.push({
          kind: 'hit', x: w.t.x, y: w.t.y, tx: w.t.x, ty: w.t.y,
          who: -1, zone: e.zone, wall: false, nx: 0, ny: 0,
        });
        break;
      }
      case 'servoCritical': {
        out.push({
          kind: 'servoCritical', x: w.t.x, y: w.t.y, tx: w.t.x, ty: w.t.y,
          who: -1, zone: null, wall: false, nx: 0, ny: 0,
        });
        break;
      }
      case 'step':
      case 'fistCharge':
      case 'fistReady':
        break;
      default: {
        const _e: never = e;
        void _e;
      }
    }
  }
  return out;
}
