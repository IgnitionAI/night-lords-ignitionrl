// Intégration des clips de combat GLB : chemins, noms pickNamedClip, os Genex, repli procédural.
// Les fichiers Genex ne sont pas encore livrés — sans GLB nommé, resolveCombatClips rend le procédural.

import type { AnimationClip } from 'three';
import { AnimationClip as Clip, KeyframeTrack } from 'three';
import { COMBAT_CLIP_KEYS, pickNamedClip } from './combat-anims';
import type { CombatClipSet } from './proc-clips';

/** Joints du skin (identiques NL-1…NL-4 et TERM), ordre `skins[0].joints`. */
export const GENEX_SKIN_JOINTS = [
  'Hips',
  'Spine02',
  'Spine01',
  'Spine',
  'neck',
  'Head',
  'head_end',
  'headfront',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
] as const;

/** Os animés par les clips walk/run Genex (pas head_end / headfront). */
export const GENEX_CLIP_BONES = GENEX_SKIN_JOINTS.filter(
  (n) => n !== 'head_end' && n !== 'headfront',
);

export const GENEX_HELPER_NODES = ['Armature', 'char1'] as const;

/** extras.rig meshy-animation (walk/run/idle). Un hash par personnage, pas un rig NL unique. */
export const ROLE_RIG_HASH = {
  'NL-1': 'e82397855ac7275e2904f00e86d92aba08962d0b3d3ccd1e70b8c8f01b11f61a',
  'NL-2': 'cc9775dfa331d50f8da5e77f0c46e2d587d1859db2939adf1f53ee907b8a5535',
  'NL-3': '313240117126b94b7e681ad71e4833e0b198ec44d7a96bdcc102ea3e574dfaa5',
  'NL-4': '469b17eeb80811cc9d5385e77726947e46bdc45786ed194a6d352b4f03f971cf',
  TERM: '3e37e914c87e81ce473bf7dfed4a682d578dccb1e47eb70b3b477244b73e9521',
} as const;

export const NL_RIG_HASH = ROLE_RIG_HASH['NL-1'];
export const TERM_RIG_HASH = ROLE_RIG_HASH.TERM;

/** Noms lore des fichiers Genex (le chargeur reste `NL-${i+1}` selon l’ordre `ROLES`). */
export const GENEX_ROLE_LORE = {
  'NL-1': 'Talos',
  'NL-2': 'Uzas',
  'NL-3': 'Cyrion',
  'NL-4': 'Xarl',
  TERM: 'Terminator',
} as const;

export const IDLE_CLIP_KEYS = ['idle'] as const;

export function idleGlbBasename(role: string): string {
  return `${role}-idle.glb`;
}

export const COMBAT_FILE_KINDS = {
  NL: ['attack', 'hit', 'dodge', 'death'],
  TERM: ['attack', 'shoot', 'hit', 'dodge'],
} as const;

export type CombatClipKind = 'attack' | 'shoot' | 'hit' | 'dodge' | 'death';
export type ClipSource = 'named' | 'procedural';

export function combatKindSet(role: string): readonly CombatClipKind[] {
  return role.toUpperCase().startsWith('TERM') ? COMBAT_FILE_KINDS.TERM : COMBAT_FILE_KINDS.NL;
}

/** Fichiers optionnels à côté de `<role>-walk.glb`. Un GLB groupé `-combat.glb` est accepté. */
export function combatGlbBasenames(role: string): string[] {
  return [...combatKindSet(role).map((k) => `${role}-${k}.glb`), `${role}-combat.glb`];
}

/**
 * Extras réellement versionnés (évite un 404 console par fichier combat manquant).
 * Ingest : ajouter le kind ici quand le GLB est commité.
 */
export const SHIPPED_EXTRA_ANIMS: Record<string, readonly string[]> = {
  'NL-1': ['idle'],
  'NL-2': ['idle'],
  'NL-3': ['idle'],
  'NL-4': ['idle'],
  TERM: ['idle'],
};

export function extraAnimBasenames(role: string): string[] {
  return (SHIPPED_EXTRA_ANIMS[role] ?? []).map((k) => `${role}-${k}.glb`);
}

const MIXAMO_PREFIX = /^mixamorig[:._-]*/i;
const ARMATURE_PREFIX = /^Armature[:._-]/;

const NAME_ALIASES: Record<string, string> = {
  hips: 'Hips',
  spine: 'Spine',
  spine1: 'Spine01',
  spine01: 'Spine01',
  spine2: 'Spine02',
  spine02: 'Spine02',
  neck: 'neck',
  head: 'Head',
  head_end: 'head_end',
  headend: 'head_end',
  headtop_end: 'head_end',
  headtop: 'head_end',
  headfront: 'headfront',
  leftshoulder: 'LeftShoulder',
  leftarm: 'LeftArm',
  leftforearm: 'LeftForeArm',
  lefthand: 'LeftHand',
  rightshoulder: 'RightShoulder',
  rightarm: 'RightArm',
  rightforearm: 'RightForeArm',
  righthand: 'RightHand',
  leftupleg: 'LeftUpLeg',
  leftleg: 'LeftLeg',
  leftfoot: 'LeftFoot',
  lefttoebase: 'LeftToeBase',
  lefttoe_end: 'LeftToeBase',
  lefttoeend: 'LeftToeBase',
  rightupleg: 'RightUpLeg',
  rightleg: 'RightLeg',
  rightfoot: 'RightFoot',
  righttoebase: 'RightToeBase',
  righttoe_end: 'RightToeBase',
  righttoeend: 'RightToeBase',
};

/** Mixamo : Spine (hanche→) = Genex Spine02 ; Spine2 (épaules) = Genex Spine. */
const MIXAMO_SPINE: Record<string, string> = {
  Spine: 'Spine02',
  Spine1: 'Spine01',
  Spine01: 'Spine01',
  Spine2: 'Spine',
  Spine02: 'Spine',
};

export function canonicalBoneName(raw: string): string {
  let s = raw.trim();
  const mixamo = MIXAMO_PREFIX.test(s);
  s = s.replace(MIXAMO_PREFIX, '').replace(ARMATURE_PREFIX, '');
  if ((GENEX_SKIN_JOINTS as readonly string[]).includes(s) && !mixamo) return s;
  if (mixamo && MIXAMO_SPINE[s]) return MIXAMO_SPINE[s];
  const aliased = NAME_ALIASES[s.toLowerCase()];
  if (aliased) {
    if (mixamo && (s.toLowerCase() === 'spine' || s.toLowerCase() === 'spine2' || s.toLowerCase() === 'spine02')) {
      return MIXAMO_SPINE[s] ?? aliased;
    }
    return aliased;
  }
  if ((GENEX_SKIN_JOINTS as readonly string[]).includes(s)) return s;
  return s;
}

export interface BoneReport {
  joints: string[];
  helpers: string[];
  unknown: string[];
  missing: string[];
}

export function classifyBones(names: readonly string[]): BoneReport {
  const helperSet = new Set<string>(GENEX_HELPER_NODES);
  const jointSet = new Set<string>(GENEX_SKIN_JOINTS);
  const joints: string[] = [];
  const helpers: string[] = [];
  const unknown: string[] = [];
  for (const raw of names) {
    if (helperSet.has(raw) || helperSet.has(canonicalBoneName(raw))) {
      if (!helpers.includes(raw)) helpers.push(raw);
      continue;
    }
    const c = canonicalBoneName(raw);
    if (jointSet.has(c)) {
      if (!joints.includes(c)) joints.push(c);
    } else if (!unknown.includes(c)) {
      unknown.push(c);
    }
  }
  // head_end / headfront sont dans le skin mais absents des clips walk/run Genex : optionnels.
  const missing = GENEX_CLIP_BONES.filter((j) => !joints.includes(j));
  return { joints, helpers, unknown, missing };
}

function splitTrack(name: string): { bone: string; prop: string } {
  const m = name.match(/^(.*)[./[](quaternion|position|scale)\]?$/);
  if (m) return { bone: m[1], prop: m[2] };
  return { bone: name, prop: '' };
}

export function remapClip(clip: AnimationClip, forceName?: string): AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const { bone, prop } = splitTrack(t.name);
    const next = prop ? `${canonicalBoneName(bone)}.${prop}` : canonicalBoneName(bone);
    if (next === t.name) return t;
    const copy = t.clone() as KeyframeTrack;
    copy.name = next;
    return copy;
  });
  return new Clip(forceName ?? clip.name, clip.duration, tracks);
}

export type ResolvedCombatClips = CombatClipSet & {
  source: Record<CombatClipKind, ClipSource>;
};

export function resolveCombatClips(
  clips: readonly AnimationClip[],
  proc: CombatClipSet,
): ResolvedCombatClips {
  const named = {
    attack: pickNamedClip(clips, COMBAT_CLIP_KEYS.attack),
    shoot: pickNamedClip(clips, COMBAT_CLIP_KEYS.shoot),
    hit: pickNamedClip(clips, COMBAT_CLIP_KEYS.hit),
    dodge: pickNamedClip(clips, COMBAT_CLIP_KEYS.dodge),
    death: pickNamedClip(clips, COMBAT_CLIP_KEYS.death),
  };
  const source: Record<CombatClipKind, ClipSource> = {
    attack: named.attack ? 'named' : 'procedural',
    shoot: named.shoot ? 'named' : 'procedural',
    hit: named.hit ? 'named' : 'procedural',
    dodge: named.dodge ? 'named' : 'procedural',
    death: named.death ? 'named' : 'procedural',
  };
  const procedural = (Object.keys(source) as CombatClipKind[]).every((k) => source[k] === 'procedural');
  return {
    ...proc,
    attack: named.attack ?? proc.attack,
    shoot: named.shoot ?? proc.shoot,
    hit: named.hit ?? proc.hit,
    dodge: named.dodge ?? proc.dodge,
    death: named.death ?? proc.death,
    procedural,
    source,
  };
}

export function oneShotDurations(set: CombatClipSet): Record<CombatClipKind, number> & {
  combo: number; leap: number; stagger: number;
} {
  return {
    attack: set.attack.duration,
    shoot: set.shoot.duration,
    hit: set.hit.duration,
    dodge: set.dodge.duration,
    death: set.death.duration,
    combo: set.combo.duration,
    leap: set.leap.duration,
    stagger: set.stagger.duration,
  };
}
