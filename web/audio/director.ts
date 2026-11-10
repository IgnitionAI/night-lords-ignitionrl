import { engine } from './engine';
import type { MusicPhase } from './types';

export type SimEv = { type: string; [k: string]: unknown };

export interface DirectorWorld {
  t: { x: number; y: number; vx: number; vy: number; servoAlarm: number };
  nls: { alive: boolean; x: number; y: number }[];
  done: boolean;
  winner: 'pack' | 'terminator' | null;
}

const NL_RUN_STRIDE = 1.3335077670385962;
const NL_WALK_STRIDE = 1.1002657971633205;
const NL_WALK_SPEED = 6 * 0.5;

export class AudioDirector {
  private nlAcc = [0, 0, 0, 0];
  private nlPrev = [{ x: 0, y: 0, alive: true }, { x: 0, y: 0, alive: true }, { x: 0, y: 0, alive: true }, { x: 0, y: 0, alive: true }];
  private voxCd = 0;
  private dripT = 0;
  private lastKill = -1;
  private combatUntil = 0;
  private servoOn = false;
  private roundEnded = false;
  private started = false;
  private time = 0;

  reset(): void {
    this.nlAcc = [0, 0, 0, 0];
    this.voxCd = 0;
    this.dripT = 0;
    this.lastKill = -1;
    this.combatUntil = 0;
    this.servoOn = false;
    this.roundEnded = false;
    this.started = false;
    this.time = 0;
  }

  beginRound(): void {
    this.reset();
    engine.stopLoops();
    engine.startAmbience();
    engine.setMusicPhase('explore');
    this.started = true;
  }

  handleEvent(e: SimEv, w: DirectorWorld): boolean {
    const pos = (x: number, y: number) => ({ x, y, z: 1.35 });
    switch (e.type) {
      case 'step': {
        const intensity = Number(e.intensity ?? 1);
        const x = Number(e.x ?? w.t.x);
        const y = Number(e.y ?? w.t.y);
        const ok = engine.play(engine.nextTermStep(), { ...pos(x, y), intensity: 0.55 + 0.45 * (intensity || 1.15), priority: 4 });
        engine.play('term-hydraulic', { ...pos(x, y), gain: 0.35 + 0.4 * intensity, priority: 3, vary: true });
        return ok;
      }
      case 'bolt': {
        const x = Number(e.x ?? w.t.x);
        const y = Number(e.y ?? w.t.y);
        const tx = Number(e.tx ?? x);
        const ty = Number(e.ty ?? y);
        engine.play('bolter-shot', { ...pos(x, y), priority: 9, pan: 0.05 });
        engine.play('bolter-echo', { ...pos(x, y), priority: 6, gain: 0.7 });
        engine.play('bolter-casing', { ...pos(x, y), priority: 4, gain: 0.55 });
        engine.play('bolter-explode', { x: tx, y: ty, z: 1.2, priority: 8 });
        engine.duck(0.3);
        this.combatUntil = this.time + 4;
        const kill = Number(e.kill ?? -1);
        if (kill >= 0) this.onNlDeath(kill, w);
        return true;
      }
      case 'fistCharge':
        return engine.play('term-servo', { ...pos(w.t.x, w.t.y), priority: 6, gain: 0.8 });
      case 'fistReady':
        return engine.play('term-hydraulic', { ...pos(w.t.x, w.t.y), priority: 5 });
      case 'fist': {
        engine.play('fist-impact', { ...pos(w.t.x, w.t.y), priority: 10 });
        engine.duck(0.22);
        this.combatUntil = this.time + 4;
        const kill = Number(e.kill ?? -1);
        if (kill >= 0) this.onNlDeath(kill, w);
        return true;
      }
      case 'clawArm': {
        const n = w.nls[Number(e.who)];
        if (!n) return false;
        engine.play('claw-crackle', { ...pos(n.x, n.y), priority: 7 });
        return engine.play('claw-swoosh', { ...pos(n.x, n.y), priority: 6, gain: 0.7 });
      }
      case 'claw': {
        const n = w.nls[Number(e.who)];
        if (!n) return false;
        const dmg = Number(e.dmg ?? 0);
        engine.play('claw-swoosh', { ...pos(n.x, n.y), priority: 7, gain: 0.5 });
        engine.play('claw-metal', { ...pos(n.x, n.y), priority: 8 });
        if (dmg > 0) {
          engine.play('nl-scream', { ...pos(n.x, n.y), priority: 6, gain: 0.45 });
          engine.duck(0.34);
        }
        this.combatUntil = this.time + 5;
        return true;
      }
      case 'whiff': {
        const n = w.nls[Number(e.who)];
        if (!n) return false;
        return engine.play('claw-swoosh', { ...pos(n.x, n.y), priority: 5, gain: 0.55 });
      }
      case 'hit': {
        if (Number(e.servoAlarm ?? 0) > 0) this.alarm();
        return true;
      }
      case 'servoCritical':
        return this.alarm();
      default:
        return false;
    }
  }

  private onNlDeath(who: number, w: DirectorWorld): void {
    if (who === this.lastKill) return;
    this.lastKill = who;
    const n = w.nls[who];
    if (!n) return;
    engine.play('nl-death', { x: n.x, y: n.y, z: 1.2, priority: 9 });
  }

  alarm(): boolean {
    return engine.play('alarm-klaxon', { bus: 'ui', priority: 8, vary: false, pan: 0 });
  }

  private musicFor(w: DirectorWorld): MusicPhase {
    if (this.combatUntil > this.time) return 'combat';
    let min = Infinity;
    for (const n of w.nls) {
      if (!n.alive) continue;
      min = Math.min(min, Math.hypot(n.x - w.t.x, n.y - w.t.y));
    }
    if (min < 6) return 'combat';
    if (min < 14) return 'tension';
    return 'explore';
  }

  tick(w: DirectorWorld, dt: number, events: SimEv[], extras?: { nlJump?: number[] }): void {
    if (!this.started) this.beginRound();
    this.time += dt;
    for (const e of events) this.handleEvent(e, w);

    const sp = Math.hypot(w.t.vx, w.t.vy);
    if (sp > 0.08) {
      if (!this.servoOn) {
        engine.play('term-servo', { x: w.t.x, y: w.t.y, z: 1.4, priority: 3, gain: 0.45 });
        this.servoOn = true;
      }
    } else {
      this.servoOn = false;
    }

    for (let i = 0; i < w.nls.length; i++) {
      const n = w.nls[i];
      const prev = this.nlPrev[i] ?? n;
      if (n.alive) {
        const d = Math.hypot(n.x - prev.x, n.y - prev.y);
        const speed = dt > 0 ? d / dt : 0;
        const stride = speed > NL_WALK_SPEED * 1.15 ? NL_RUN_STRIDE : NL_WALK_STRIDE;
        this.nlAcc[i] += d;
        if (this.nlAcc[i] >= stride * 0.92 && speed > 0.4) {
          this.nlAcc[i] = 0;
          engine.play(engine.nextNlStep(), { x: n.x, y: n.y, z: 0.2, priority: 3, intensity: Math.min(1, speed / 6) });
        }
        if (prev.alive && extras?.nlJump?.includes(i)) {
          engine.play('nl-jump', { x: n.x, y: n.y, z: 1.2, priority: 6 });
        }
      } else if (prev.alive) {
        this.onNlDeath(i, w);
      }
      this.nlPrev[i] = { x: n.x, y: n.y, alive: n.alive };
    }

    this.voxCd -= dt;
    const close = w.nls.filter((n) => n.alive && Math.hypot(n.x - w.t.x, n.y - w.t.y) < 8);
    if (this.voxCd <= 0 && close.length >= 2) {
      const n = close[0];
      engine.play('nl-vox-come-for-you', { x: n.x, y: n.y, z: 1.6, priority: 7, vary: true });
      this.voxCd = 11;
    }

    const phase = this.musicFor(w);
    if (phase !== engine.musicPhase) engine.setMusicPhase(phase);

    this.dripT += dt;
    if (this.dripT > 1.4) {
      this.dripT = 0;
      engine.drip();
    }

    if (w.done && !this.roundEnded) {
      this.roundEnded = true;
      engine.setMusicPhase('stinger');
      const name = w.winner === 'pack' ? 'stinger-defeat' : 'stinger-victory';
      engine.play(name, { bus: 'music', priority: 11, vary: false, pan: 0 });
    }
  }

  endRound(winner: 'pack' | 'terminator' | null): void {
    if (this.roundEnded) return;
    this.roundEnded = true;
    engine.setMusicPhase('stinger');
    engine.play(winner === 'pack' ? 'stinger-defeat' : 'stinger-victory', { bus: 'music', priority: 11, vary: false });
  }
}

export const director = new AudioDirector();
