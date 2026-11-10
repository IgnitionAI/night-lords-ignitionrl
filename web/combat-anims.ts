// Machine d'états d'animation de combat (rendu seulement).
// Les clips Genex ne portent que idle/walk/run tant que les GLB combat ne sont pas livrés.
// attack/hit/dodge/death/shoot : fichiers `<role>-<kind>.glb` via combat-clips.ts, sinon procédural.
// La sim n'est pas lue ici — seulement des drapeaux.

import type { Gait } from './locomotion';

export const COMBAT_KINDS = ['idle', 'walk', 'run', 'attack', 'hit', 'dodge', 'death'] as const;
export type CombatKind = typeof COMBAT_KINDS[number];

export type AttackStyle = 'melee' | 'shoot';

export const ONE_SHOT = {
  attack: 0.46,
  hit: 0.28,
  dodge: 0.36,
  death: 0.80,
  combo: 0.90,
  leap: 0.72,
  stagger: 0.42,
} as const;

export type MeleeVariant = 'single' | 'combo' | 'leap';
export type HitDir = 'front' | 'back' | 'left' | 'right';
export type DodgeDir = 'back' | 'left' | 'right';
export type DeathKind = 'throw' | 'collapse' | 'dismember';

export function hitDirFrom(
  facing: number,
  selfX: number,
  selfY: number,
  fromX: number,
  fromY: number,
): HitDir {
  const ang = Math.atan2(fromY - selfY, fromX - selfX);
  let rel = ang - facing;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  if (Math.abs(rel) <= Math.PI * 0.25) return 'front';
  if (Math.abs(rel) >= Math.PI * 0.75) return 'back';
  return rel > 0 ? 'left' : 'right';
}

export function dodgeDirFrom(action: number): DodgeDir {
  switch (action) {
    case 3:
    case 5:
      return 'left';
    case 4:
    case 6:
      return 'right';
    default:
      return 'back';
  }
}

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
  meleeVariant: MeleeVariant;
  hitDir: HitDir;
  dodgeDir: DodgeDir;
  deathKind: DeathKind;
  lastLoco: Gait;
}

export function freshMachine(): CombatMachine {
  return {
    state: 'idle', remaining: 0, attackStyle: 'melee', hitFlash: 0, restart: false,
    meleeVariant: 'single', hitDir: 'front', dodgeDir: 'back', deathKind: 'collapse', lastLoco: 'idle',
  };
}

export interface CombatIntent {
  death: boolean;
  hit: boolean;
  attack: boolean;
  dodge: boolean;
  gait: Gait;
  attackStyle: AttackStyle;
  meleeVariant?: MeleeVariant;
  hitDir?: HitDir;
  dodgeDir?: DodgeDir;
  deathKind?: DeathKind;
  stagger?: boolean;
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

export type ShotDurations = Partial<Record<
  'attack' | 'shoot' | 'hit' | 'dodge' | 'death' | 'combo' | 'leap' | 'stagger',
  number
>>;

export function shotDuration(
  kind: CombatKind,
  style: AttackStyle,
  durs?: ShotDurations,
  extras?: { meleeVariant?: MeleeVariant; stagger?: boolean },
): number {
  if (!isOneShot(kind)) return 0;
  if (kind === 'attack' && style === 'shoot') return durs?.shoot ?? durs?.attack ?? ONE_SHOT.attack;
  if (kind === 'attack' && extras?.meleeVariant === 'combo') return durs?.combo ?? ONE_SHOT.combo;
  if (kind === 'attack' && extras?.meleeVariant === 'leap') return durs?.leap ?? ONE_SHOT.leap;
  if (kind === 'hit' && extras?.stagger) return durs?.stagger ?? ONE_SHOT.stagger;
  return durs?.[kind] ?? ONE_SHOT[kind];
}

function extrasOf(intent: CombatIntent, m: CombatMachine): {
  meleeVariant: MeleeVariant;
  hitDir: HitDir;
  dodgeDir: DodgeDir;
  deathKind: DeathKind;
  lastLoco: Gait;
  stagger: boolean;
} {
  return {
    meleeVariant: intent.meleeVariant ?? m.meleeVariant,
    hitDir: intent.hitDir ?? m.hitDir,
    dodgeDir: intent.dodgeDir ?? m.dodgeDir,
    deathKind: intent.deathKind ?? m.deathKind,
    lastLoco: isLoco(m.state) ? m.state : m.lastLoco,
    stagger: intent.stagger ?? false,
  };
}

export function tickMachine(
  m: CombatMachine,
  intent: CombatIntent,
  dt: number,
  durs?: ShotDurations,
): CombatMachine {
  const next = resolveKind(m.state, m.remaining, intent);
  const flashDecay = dt > 0 ? dt / HIT_FLASH_DECAY : 0;
  let hitFlash = Math.max(0, m.hitFlash - flashDecay);
  if (intent.hit || intent.death) hitFlash = 1;
  const style = next === 'attack' ? intent.attackStyle : m.attackStyle;
  const extras = extrasOf(intent, m);
  const lastLoco = isLoco(next) ? next : extras.lastLoco;
  const pack = {
    attackStyle: style,
    hitFlash,
    meleeVariant: next === 'attack' ? extras.meleeVariant : m.meleeVariant,
    hitDir: next === 'hit' ? extras.hitDir : m.hitDir,
    dodgeDir: next === 'dodge' ? extras.dodgeDir : m.dodgeDir,
    deathKind: next === 'death' ? extras.deathKind : m.deathKind,
    lastLoco,
  };
  const durOpts = { meleeVariant: extras.meleeVariant, stagger: extras.stagger };

  if (next !== m.state) {
    const remaining = shotDuration(next, style, durs, durOpts);
    return { state: next, remaining, restart: true, ...pack };
  }
  // Une fois mort : ne plus changer de clip (throw → collapse au tick suivant
  // relançait un fondu et laissait la walk en poids).
  if (m.state === 'death') {
    return {
      ...m,
      state: 'death',
      remaining: Math.max(0, m.remaining - dt),
      restart: false,
      hitFlash,
      deathKind: m.deathKind,
      lastLoco: m.lastLoco,
    };
  }
  if (next === 'hit' && intent.hit) {
    return { state: 'hit', remaining: shotDuration('hit', style, durs, durOpts), restart: true, ...pack };
  }
  if (next === 'dodge' && intent.dodge && m.remaining < shotDuration('dodge', style, durs) * 0.5) {
    return { state: 'dodge', remaining: shotDuration('dodge', style, durs), restart: true, ...pack };
  }
  if (isOneShot(next)) {
    let remaining = m.remaining - dt;
    if (next === 'attack' && intent.attack) remaining = Math.max(remaining, dt > 0 ? dt : 0.01);
    if (remaining <= 0) {
      return { state: intent.gait, remaining: 0, restart: true, ...pack, lastLoco: intent.gait };
    }
    return { ...m, ...pack, state: next, remaining, restart: false };
  }
  return { state: next, remaining: 0, restart: false, ...pack };
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
  facing?: number;
  x?: number;
  y?: number;
  termX?: number;
  termY?: number;
}): CombatIntent {
  const killed = opts.flags.boltKill === opts.index || opts.flags.fistKill === opts.index;
  const death = !opts.alive || killed;
  const swinging = opts.flags.clawArm.includes(opts.index)
    || opts.flags.claw.includes(opts.index)
    || opts.flags.whiff.includes(opts.index)
    || opts.armTicks > 0;
  const hit = !death && opts.stunTicks > opts.prevStun;
  const sideStart = (opts.lastAction === 3 || opts.lastAction === 4) && opts.prevAction !== opts.lastAction;
  const dodge = !death && !swinging && !hit
    && ((opts.lastAction === 2 && opts.prevAction !== 2) || sideStart);
  const meleeVariant: MeleeVariant = opts.gait === 'run' ? 'leap' : 'combo';
  let deathKind: DeathKind = 'collapse';
  if (opts.flags.boltKill === opts.index) deathKind = 'throw';
  else if (opts.flags.fistKill === opts.index) deathKind = opts.index % 2 === 0 ? 'collapse' : 'dismember';
  else if (death) deathKind = opts.index === 2 ? 'dismember' : 'collapse';
  const hitDir = (opts.facing !== undefined && opts.x !== undefined && opts.y !== undefined
    && opts.termX !== undefined && opts.termY !== undefined)
    ? hitDirFrom(opts.facing, opts.x, opts.y, opts.termX, opts.termY)
    : 'front';
  return {
    death,
    hit,
    attack: !death && swinging,
    dodge,
    gait: death ? 'idle' : opts.gait,
    attackStyle: 'melee',
    meleeVariant,
    hitDir,
    dodgeDir: dodgeDirFrom(opts.lastAction),
    deathKind,
    stagger: opts.flags.boltKill === opts.index,
  };
}

export function termIntent(opts: {
  gait: Gait;
  fistCharge: number;
  burstLeft: number;
  flags: SimAnimEvents;
  facing?: number;
  x?: number;
  y?: number;
  hitFromX?: number;
  hitFromY?: number;
}): CombatIntent {
  const attack = opts.flags.termBolt || opts.flags.termFist || opts.fistCharge > 0 || opts.burstLeft > 0;
  const hit = opts.flags.termHit;
  const dodge = !hit && opts.flags.whiff.length > 0;
  const hitDir = (hit && opts.facing !== undefined && opts.x !== undefined && opts.y !== undefined
    && opts.hitFromX !== undefined && opts.hitFromY !== undefined)
    ? hitDirFrom(opts.facing, opts.x, opts.y, opts.hitFromX, opts.hitFromY)
    : 'front';
  return {
    death: false,
    hit,
    attack: !hit && attack,
    dodge,
    gait: opts.gait,
    attackStyle: (opts.flags.termBolt || (opts.burstLeft > 0 && opts.fistCharge === 0 && !opts.flags.termFist))
      ? 'shoot' : 'melee',
    meleeVariant: 'single',
    hitDir,
    dodgeDir: 'back',
    deathKind: 'collapse',
  };
}
