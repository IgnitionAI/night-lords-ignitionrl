export type BusName = 'sfx' | 'ambience' | 'music' | 'ui' | 'master';

export type MusicPhase = 'explore' | 'tension' | 'combat' | 'stinger';

export type SampleName =
  | 'bolter-shot'
  | 'bolter-echo'
  | 'bolter-casing'
  | 'bolter-explode'
  | 'claw-crackle'
  | 'claw-swoosh'
  | 'claw-metal'
  | 'fist-impact'
  | 'term-step-01'
  | 'term-step-02'
  | 'term-step-03'
  | 'term-servo'
  | 'term-hydraulic'
  | 'nl-step-01'
  | 'nl-step-02'
  | 'nl-step-03'
  | 'nl-jump'
  | 'nl-vox-come-for-you'
  | 'nl-scream'
  | 'nl-death'
  | 'alarm-klaxon'
  | 'amb-drone'
  | 'amb-drip'
  | 'amb-duct'
  | 'music-explore'
  | 'music-tension'
  | 'music-combat'
  | 'stinger-victory'
  | 'stinger-defeat';

export interface ManifestSample {
  name: SampleName;
  file: string;
  fallback?: string;
  bus: BusName;
  gain: number;
  loop?: boolean;
  spatial?: boolean;
  priority: number;
  license: string;
  source: string;
}

export interface AudioManifest {
  version: number;
  base?: string;
  polyphony: number;
  samples: ManifestSample[];
}

export interface PlayOpts {
  pan?: number;
  gain?: number;
  intensity?: number;
  x?: number;
  y?: number;
  z?: number;
  rate?: number;
  loop?: boolean;
  bus?: BusName;
  priority?: number;
  when?: number;
  vary?: boolean;
  force?: boolean;
}

export interface InitResult {
  ok: boolean;
  samples: number;
  missing: string[];
  reason?: string;
}

export interface MixerStatus {
  ok: boolean;
  enabled: boolean;
  muted: boolean;
  unlocked: boolean;
  state: string;
  decoded: string[];
  missing: string[];
  samples: number;
  activeVoices: number;
  polyphony: number;
  musicPhase: MusicPhase;
  ducked: boolean;
}

export interface VoiceRecord {
  id: number;
  name: string;
  priority: number;
  bus: BusName;
  startedAt: number;
  playing: boolean;
}

export const DEFAULT_POLYPHONY = 18;

export const BUS_GAINS: Record<BusName, number> = {
  sfx: 0.95,
  ambience: 0.42,
  music: 0.32,
  ui: 0.55,
  master: 0.85,
};
