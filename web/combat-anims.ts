// Machine d'états d'animation de combat (rendu seulement).
// Les clips Genex ne portent que idle/walk/run : attack/hit/dodge/death sont procéduraux
// si aucun clip nommé n'est présent. La sim n'est pas lue ici — seulement des drapeaux.

import type { Gait } from './locomotion';

export const COMBAT_KINDS = ['idle', 'walk', 'run', 'attack', 'hit', 'dodge', 'death'] as const;
export type CombatKind = typeof COMBAT_KINDS[number];

export type AttackStyle = 'melee' | 'shoot';

export const ONE_SHOT = {
  attack: 0.46,
  hit: 0.28,
  dodge: 0.36,
  death: 0.80,
} as const;

export const CROSSFADE = { loco: 0.15, combat: 0.10, death: 0.18 } as const;

export const HIT_FLASH_DECAY = 0.18;

export const COMBAT_CLIP_KEYS: Record<'attack' | 'shoot' | 'hit' | 'dodge' | 'death', readonly string[]> = {
  attack: ['attack', 'claw', 'slash', 'melee', 'punch', 'strike', 'fist'],
  shoot: ['shoot', 'bolt', 'fire', 'aim', 'shot', 'gun'],
  hit: ['hit', 'hurt', 'flinch', 'impact', 'react', 'stagger'],
  dodge: ['dodge', 'evade', 'roll', 'sidestep'],
  death: ['death', 'die', 'dead'],
};

export function isOneShot(kind: CombatKind): kind is 'attack' | 'hit' | 'dodge' | 'death' {
  switch (kind) {
    case 'attack':
    case 'hit':
    case 'dodge':
    case 'death':
      return true;
    case 'idle':
    case 'walk':
    case 'run':
      return false;
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

export function isLoco(kind: CombatKind): kind is Gait {
  switch (kind) {
    case 'idle':
    case 'walk':
    case 'run':
      return true;
    case 'attack':
    case 'hit':
    case 'dodge':
    case 'death':
      return false;
    default: {
      const _e: never = kind;
      return _e;
    }
  }
}

export function crossFadeFor(from: CombatKind, to: CombatKind): number {
  if (to === 'death' || from === 'death') return CROSSFADE.death;
  if (isOneShot(to) || isOneShot(from)) return CROSSFADE.combat;
  return CROSSFADE.loco;
}

export function pickNamedClip<T extends { name: string }>(
  clips: readonly T[],
  keys: readonly string[],
): T | null {
  const lower = keys.map((k) => k.toLowerCase());
  const hit = clips.find((c) => {
    const n = c.name.toLowerCase();
    return lower.some((k) => n.includes(k));
  });
  return hit ?? null;
}

export interface CombatMachine {
  state: CombatKind;
  remaining: number;
  attackStyle: AttackStyle;
  hitFlash: number;
  restart: boolean;
}

export function freshMachine(): CombatMachine {
  return { state: 'idle', remaining: 0, attackStyle: 'melee', hitFlash: 0, restart: false };
}

export interface CombatIntent {
  death: boolean;
  hit: boolean;
  attack: boolean;
  dodge: boolean;
  gait: Gait;
  attackStyle: AttackStyle;
}

/** Priorité : mort > coup > attaque/tir > esquive > locomotion. La mort ne quitte jamais. */
export function resolveKind(current: CombatKind, remaining: number, intent: CombatIntent): CombatKind {
  if (current === 'death' || intent.death) return 'death';
  if (intent.hit) return 'hit';
  if (current === 'hit' && remaining > 0) return 'hit';
  if (intent.attack) return 'attack';
  if (current === 'attack' && remaining > 0) return 'attack';
  if (intent.dodge) return 'dodge';
  if (current === 'dodge' && remaining > 0) return 'dodge';
  return intent.gait;
}

export function tickMachine(m: CombatMachine, intent: CombatIntent, dt: number): CombatMachine {
  const next = resolveKind(m.state, m.remaining, intent);
  const flashDecay = dt > 0 ? dt / HIT_FLASH_DECAY : 0;
  let hitFlash = Math.max(0, m.hitFlash - flashDecay);
  if (intent.hit || intent.death) hitFlash = 1;
  const style = next === 'attack' ? intent.attackStyle : m.attackStyle;

  if (next !== m.state) {
    const remaining = isOneShot(next) ? ONE_SHOT[next] : 0;
    return { state: next, remaining, attackStyle: style, hitFlash, restart: true };
  }
  if (next === 'hit' && intent.hit) {
    return { state: 'hit', remaining: ONE_SHOT.hit, attackStyle: style, hitFlash, restart: true };
  }
  if (next === 'dodge' && intent.dodge && m.remaining < ONE_SHOT.dodge * 0.5) {
    return { state: 'dodge', remaining: ONE_SHOT.dodge, attackStyle: style, hitFlash, restart: true };
  }
  if (next === 'death') {
    return { ...m, state: 'death', remaining: Math.max(0, m.remaining - dt), hitFlash, restart: false };
  }
  if (isOneShot(next)) {
    let remaining = m.remaining - dt;
    if (next === 'attack' && intent.attack) remaining = Math.max(remaining, dt > 0 ? dt : 0.01);
    if (remaining <= 0) {
      return { state: intent.gait, remaining: 0, attackStyle: style, hitFlash, restart: true };
    }
    return { ...m, state: next, remaining, attackStyle: style, hitFlash, restart: false };
  }
  return { state: next, remaining: 0, attackStyle: style, hitFlash, restart: false };
}

export interface SimAnimEvents {
  boltKill: number | null;
  fistKill: number | null;
  clawArm: number[];
  claw: number[];
  whiff: number[];
  termHit: boolean;
  termBolt: boolean;
  termFist: boolean;
}

export function eventsToFlags(events: readonly { type: string; who?: number; kill?: number }[]): SimAnimEvents {
  const clawArm: number[] = [];
  const claw: number[] = [];
  const whiff: number[] = [];
  let boltKill: number | null = null;
  let fistKill: number | null = null;
  let termHit = false;
  let termBolt = false;
  let termFist = false;
  for (const e of events) {
    switch (e.type) {
      case 'bolt':
        termBolt = true;
        if (typeof e.kill === 'number' && e.kill >= 0) boltKill = e.kill;
        break;
      case 'fist':
      case 'fistCharge':
      case 'fistReady':
        termFist = true;
        if (e.type === 'fist' && typeof e.kill === 'number' && e.kill >= 0) fistKill = e.kill;
        break;
      case 'clawArm':
        if (typeof e.who === 'number') clawArm.push(e.who);
        break;
      case 'claw':
        if (typeof e.who === 'number') claw.push(e.who);
        break;
      case 'whiff':
        if (typeof e.who === 'number') whiff.push(e.who);
        break;
      case 'hit':
        termHit = true;
        break;
      default:
        break;
    }
  }
  return { boltKill, fistKill, clawArm, claw, whiff, termHit, termBolt, termFist };
}

export function nlIntent(opts: {
  alive: boolean;
  armTicks: number;
  stunTicks: number;
  prevStun: number;
  lastAction: number;
  prevAction: number;
  gait: Gait;
  flags: SimAnimEvents;
  index: number;
}): CombatIntent {
  const killed = opts.flags.boltKill === opts.index || opts.flags.fistKill === opts.index;
  const death = !opts.alive || killed;
  const swinging = opts.flags.clawArm.includes(opts.index)
    || opts.flags.claw.includes(opts.index)
    || opts.flags.whiff.includes(opts.index)
    || opts.armTicks > 0;
  const hit = !death && opts.stunTicks > opts.prevStun;
  const dodge = !death && !swinging && !hit && opts.lastAction === 2 && opts.prevAction !== 2;
  return {
    death,
    hit,
    attack: !death && swinging,
    dodge,
    gait: death ? 'idle' : opts.gait,
    attackStyle: 'melee',
  };
}

export function termIntent(opts: {
  gait: Gait;
  fistCharge: number;
  burstLeft: number;
  flags: SimAnimEvents;
}): CombatIntent {
  const attack = opts.flags.termBolt || opts.flags.termFist || opts.fistCharge > 0 || opts.burstLeft > 0;
  const hit = opts.flags.termHit;
  const dodge = !hit && opts.flags.whiff.length > 0;
  return {
    death: false,
    hit,
    attack: !hit && attack,
    dodge,
    gait: opts.gait,
    attackStyle: (opts.flags.termBolt || (opts.burstLeft > 0 && opts.fistCharge === 0 && !opts.flags.termFist))
      ? 'shoot' : 'melee',
  };
}
