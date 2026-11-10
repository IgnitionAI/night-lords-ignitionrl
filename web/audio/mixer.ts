import { BUS_GAINS, type BusName } from './types';

export interface GainLike {
  gain: {
    value: number;
    setTargetAtTime?: (v: number, t: number, c: number) => void;
    setValueAtTime?: (v: number, t: number) => void;
    linearRampToValueAtTime?: (v: number, t: number) => void;
  };
  connect(dest: unknown): unknown;
  disconnect(): void;
}

export interface CompressorLike {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  connect(dest: unknown): unknown;
}

export interface MixerContext {
  currentTime: number;
  destination: unknown;
  createGain(): GainLike;
  createDynamicsCompressor(): CompressorLike;
}

export interface MixerGraph {
  buses: Record<BusName, GainLike>;
  duck: GainLike;
  compressor: CompressorLike;
  limiter: CompressorLike;
  master: GainLike;
  ducked: boolean;
}

function setGain(node: GainLike, value: number, ctx: MixerContext, tc = 0.03): void {
  const g = node.gain;
  if (typeof g.setTargetAtTime === 'function') g.setTargetAtTime(value, ctx.currentTime, tc);
  else g.value = value;
}

/** Compresseur + limiteur sur le master, bus SFX / ambiance / musique / UI. */
export function buildMixer(ctx: MixerContext, masterGain = BUS_GAINS.master): MixerGraph {
  const sfx = ctx.createGain();
  const ambience = ctx.createGain();
  const music = ctx.createGain();
  const ui = ctx.createGain();
  const duck = ctx.createGain();
  const master = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();
  const limiter = ctx.createDynamicsCompressor();

  sfx.gain.value = BUS_GAINS.sfx;
  ambience.gain.value = BUS_GAINS.ambience;
  music.gain.value = BUS_GAINS.music;
  ui.gain.value = BUS_GAINS.ui;
  duck.gain.value = 1;
  master.gain.value = masterGain;

  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;

  limiter.threshold.value = -1.5;
  limiter.knee.value = 0.5;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  music.connect(duck);
  duck.connect(master);
  sfx.connect(master);
  ambience.connect(master);
  ui.connect(master);
  master.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(ctx.destination);

  return {
    buses: { sfx, ambience, music, ui, master },
    duck,
    compressor,
    limiter,
    master,
    ducked: false,
  };
}

export function duckMusic(graph: MixerGraph, ctx: MixerContext, amount = 0.28, holdMs = 220): void {
  graph.ducked = true;
  setGain(graph.duck, amount, ctx, 0.018);
  const started = ctx.currentTime;
  const hold = holdMs / 1000;
  const later = () => {
    if (ctx.currentTime + 0.001 < started + hold) return false;
    setGain(graph.duck, 1, ctx, 0.22);
    graph.ducked = false;
    return true;
  };
  // Tests can call later(); browsers schedule via the engine.
  (graph.duck as GainLike & { _release?: () => boolean })._release = later;
}

export function setBusGain(graph: MixerGraph, ctx: MixerContext, bus: BusName, value: number, tc = 0.08): void {
  setGain(graph.buses[bus], value, ctx, tc);
}

export function setMasterMuted(graph: MixerGraph, ctx: MixerContext, muted: boolean, live = BUS_GAINS.master): void {
  setGain(graph.master, muted ? 0 : live, ctx, 0.04);
}
