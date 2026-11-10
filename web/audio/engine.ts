import { buildMixer, duckMusic, setMasterMuted, type MixerGraph } from './mixer';
import { BUS_GAINS, DEFAULT_POLYPHONY, type AudioManifest, type BusName, type InitResult, type MixerStatus, type MusicPhase, type PlayOpts, type SampleName } from './types';
import { VoicePool } from './voices';

type AnyCtx = AudioContext & {
  listener: AudioListener & {
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
  };
};

interface LiveVoice {
  id: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan?: StereoPannerNode;
  panner?: PannerNode;
}

const MIN_INTERVAL_MS = 28;

export class AudioEngine {
  ctx: AnyCtx | null = null;
  graph: MixerGraph | null = null;
  pool = new VoicePool(DEFAULT_POLYPHONY);
  manifest: AudioManifest | null = null;
  buffers = new Map<string, AudioBuffer>();
  missing = new Set<string>();
  enabled = true;
  muted = false;
  unlocked = false;
  ready = false;
  musicPhase: MusicPhase = 'explore';
  masterGain = BUS_GAINS.master;
  private lastPlay = new Map<string, number>();
  private live = new Map<number, LiveVoice>();
  private loops = new Map<string, LiveVoice>();
  private armed = false;
  private lifecycle: (() => void) | null = null;
  private wasRunning = false;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private stepIndex = 0;
  private nlStepIndex = 0;
  private base = '/web/sfx/nightlords/';
  private varyRng = 1;

  queryMuted(search = typeof location !== 'undefined' ? location.search : ''): boolean {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (q.get('mute') === '1') return true;
    if (q.get('audio') === '0') return true;
    return false;
  }

  async init(opts: {
    base?: string;
    manifest?: string | AudioManifest;
    enabled?: boolean;
    autounlock?: boolean;
    master?: number;
    context?: AnyCtx;
    fetchImpl?: typeof fetch;
    polyphony?: number;
    search?: string;
  } = {}): Promise<InitResult> {
    try {
      this.base = (opts.base ?? this.base).replace(/\/$/, '') + '/';
      this.masterGain = opts.master ?? BUS_GAINS.master;
      this.muted = this.queryMuted(opts.search);
      this.enabled = opts.enabled ?? !this.muted;
      const AC = (opts.context
        ? null
        : (globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext));
      this.ctx = (opts.context ?? (AC ? new AC({ latencyHint: 'interactive' }) : null)) as AnyCtx | null;
      if (!this.ctx) throw new Error('pas d’AudioContext');
      this.graph = buildMixer(this.ctx, this.masterGain);
      if (this.muted) setMasterMuted(this.graph, this.ctx, true, this.masterGain);

      if (typeof opts.manifest === 'object' && opts.manifest) {
        this.manifest = opts.manifest;
      } else {
        const fetcher = opts.fetchImpl ?? fetch;
        const url = this.base + (typeof opts.manifest === 'string' ? opts.manifest : 'manifest.json');
        const res = await fetcher(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('manifest ' + res.status);
        this.manifest = await res.json() as AudioManifest;
      }
      this.pool = new VoicePool(opts.polyphony ?? this.manifest.polyphony ?? DEFAULT_POLYPHONY);
      this.ready = true;
      if (opts.autounlock !== false) this.installUnlock();
      const hot = ['bolter-shot', 'fist-impact', 'term-step-01', 'claw-metal', 'amb-drone', 'music-explore'];
      for (const n of hot) void this.decodeName(n, opts.fetchImpl);
      return { ok: true, samples: this.manifest.samples.length, missing: [...this.missing] };
    } catch (e) {
      this.ready = false;
      return { ok: false, reason: String((e as Error)?.message ?? e), samples: 0, missing: [] };
    }
  }

  installUnlock(): void {
    if (this.armed || typeof window === 'undefined') return;
    this.armed = true;
    const on = () => { this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, on, { passive: true });
    }
  }

  unlock(): boolean {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
      this.unlocked = true;
      return true;
    }
    this.unlocked = this.ctx.state === 'running';
    return this.unlocked;
  }

  setMuted(v: boolean): boolean {
    this.muted = v;
    this.enabled = !v;
    if (this.graph && this.ctx) setMasterMuted(this.graph, this.ctx, v, this.masterGain);
    if (v) this.stopLoops();
    return v;
  }

  toggleMute(): boolean {
    return this.setMuted(!this.muted);
  }

  attachLifecycle(): boolean {
    if (typeof document === 'undefined' || this.lifecycle) return false;
    this.lifecycle = () => {
      if (!this.ctx) return;
      if (document.hidden) {
        this.wasRunning = this.ctx.state === 'running';
        if (this.wasRunning) void this.ctx.suspend();
      } else if (this.wasRunning && this.enabled) {
        void this.ctx.resume();
        this.wasRunning = false;
      }
    };
    document.addEventListener('visibilitychange', this.lifecycle);
    return true;
  }

  detachLifecycle(): boolean {
    if (typeof document === 'undefined' || !this.lifecycle) return false;
    document.removeEventListener('visibilitychange', this.lifecycle);
    this.lifecycle = null;
    return true;
  }

  private entry(name: string) {
    return this.manifest?.samples.find((s) => s.name === name) ?? null;
  }

  private url(file: string): string {
    return this.base + file.replace(/^\//, '');
  }

  async decodeName(name: string, fetchImpl?: typeof fetch): Promise<AudioBuffer | null> {
    if (this.buffers.has(name) || this.missing.has(name) || !this.ctx) return this.buffers.get(name) ?? null;
    const entry = this.entry(name);
    if (!entry) { this.missing.add(name); return null; }
    const fetcher = fetchImpl ?? fetch;
    const tryFile = async (file: string) => {
      const res = await fetcher(this.url(file));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.arrayBuffer();
      return await this.ctx!.decodeAudioData(data.slice(0));
    };
    try {
      const buf = await tryFile(entry.file);
      this.buffers.set(name, buf);
      return buf;
    } catch {
      if (entry.fallback) {
        try {
          const buf = await tryFile(entry.fallback);
          this.buffers.set(name, buf);
          return buf;
        } catch { /* fall through */ }
      }
      this.missing.add(name);
      return null;
    }
  }

  private vary(): { rate: number; gain: number } {
    this.varyRng = (this.varyRng * 1103515245 + 12345) >>> 0;
    const u = (this.varyRng % 1000) / 1000;
    this.varyRng = (this.varyRng * 1103515245 + 12345) >>> 0;
    const v = (this.varyRng % 1000) / 1000;
    return { rate: 0.96 + u * 0.08, gain: 0.86 + v * 0.22 };
  }

  play(name: string, opts: PlayOpts = {}): boolean {
    if (!this.enabled || this.muted || !this.ready || !this.ctx || !this.graph) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!opts.force && this.lastPlay.has(name) && now - this.lastPlay.get(name)! < MIN_INTERVAL_MS) return false;
    const buf = this.buffers.get(name);
    if (!buf) { void this.decodeName(name); return false; }
    if (this.ctx.state === 'suspended') void this.ctx.resume();

    const entry = this.entry(name);
    const busName: BusName = opts.bus ?? entry?.bus ?? 'sfx';
    const priority = opts.priority ?? entry?.priority ?? 5;
    const { id, stolen } = this.pool.acquire({ name, priority, bus: busName, now });
    if (stolen) this.stopVoice(stolen.id);

    const vary = opts.vary !== false ? this.vary() : { rate: 1, gain: 1 };
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!(opts.loop ?? entry?.loop);
    src.playbackRate.value = (opts.rate ?? 1) * vary.rate;

    const g = this.ctx.createGain();
    const base = (opts.gain ?? 1) * (opts.intensity ?? 1) * (entry?.gain ?? 0.7) * vary.gain;
    g.gain.value = Math.max(0.0001, base);

    let tail: AudioNode = g;
    src.connect(g);
    const spatial = opts.x !== undefined || entry?.spatial;
    if (spatial && typeof opts.x === 'number') {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.maxDistance = 42;
      panner.rolloffFactor = 1.15;
      this.setPannerPos(panner, opts.x, opts.z ?? 1.4, opts.y ?? 0);
      g.connect(panner);
      tail = panner;
      const live: LiveVoice = { id, src, gain: g, panner };
      this.live.set(id, live);
      if (src.loop) this.loops.set(name, live);
    } else if (this.ctx.createStereoPanner && typeof opts.pan === 'number') {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(pan);
      tail = pan;
      const live: LiveVoice = { id, src, gain: g, pan };
      this.live.set(id, live);
      if (src.loop) this.loops.set(name, live);
    } else {
      const live: LiveVoice = { id, src, gain: g };
      this.live.set(id, live);
      if (src.loop) this.loops.set(name, live);
    }
    tail.connect(this.graph.buses[busName]);
    src.onended = () => {
      this.pool.release(id);
      this.live.delete(id);
      if (this.loops.get(name)?.id === id) this.loops.delete(name);
      try { src.disconnect(); g.disconnect(); } catch { /* */ }
    };
    try { src.start(opts.when ?? 0); } catch { return false; }
    this.lastPlay.set(name, now);
    return true;
  }

  private setPannerPos(panner: PannerNode, x: number, y: number, z: number): void {
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(x, y, z);
    }
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux = 0, uy = 1, uz = 0): void {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else {
      L.setPosition?.(x, y, z);
      L.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  }

  duck(amount = 0.28): void {
    if (!this.graph || !this.ctx) return;
    duckMusic(this.graph, this.ctx, amount);
    const duck = this.graph.duck as GainNode & { _release?: () => boolean };
    const holdMs = 220;
    if (typeof setTimeout === 'function') {
      setTimeout(() => duck._release?.(), holdMs);
    } else {
      duck._release?.();
    }
  }

  private stopVoice(id: number): void {
    const v = this.live.get(id);
    if (!v) { this.pool.release(id); return; }
    try { v.src.stop(); } catch { /* */ }
    this.live.delete(id);
    this.pool.release(id);
  }

  stopLoops(): void {
    for (const v of this.loops.values()) {
      try { v.src.stop(); } catch { /* */ }
    }
    this.loops.clear();
  }

  ensureLoop(name: SampleName, opts: PlayOpts = {}): boolean {
    if (this.loops.has(name)) return true;
    return this.play(name, { ...opts, loop: true, vary: false });
  }

  setLoopGain(name: string, value: number): boolean {
    const v = this.loops.get(name);
    if (!v || !this.ctx) return false;
    const g = v.gain.gain;
    if (g.setTargetAtTime) g.setTargetAtTime(Math.max(0.0001, value), this.ctx.currentTime, 0.25);
    else g.value = value;
    return true;
  }

  setMusicPhase(phase: MusicPhase): void {
    this.musicPhase = phase;
    if (phase === 'stinger') {
      this.setLoopGain('music-explore', 0.0001);
      this.setLoopGain('music-tension', 0.0001);
      this.setLoopGain('music-combat', 0.0001);
      return;
    }
    this.ensureLoop('music-explore', { bus: 'music', priority: 1, gain: 1 });
    this.ensureLoop('music-tension', { bus: 'music', priority: 1, gain: 0.0001 });
    this.ensureLoop('music-combat', { bus: 'music', priority: 1, gain: 0.0001 });
    const explore = phase === 'explore' ? 1 : phase === 'tension' ? 0.35 : 0.12;
    const tension = phase === 'tension' ? 1 : phase === 'combat' ? 0.45 : 0.0001;
    const combat = phase === 'combat' ? 1 : 0.0001;
    this.setLoopGain('music-explore', explore * (this.entry('music-explore')?.gain ?? 0.4));
    this.setLoopGain('music-tension', tension * (this.entry('music-tension')?.gain ?? 0.45));
    this.setLoopGain('music-combat', combat * (this.entry('music-combat')?.gain ?? 0.5));
  }

  startAmbience(): void {
    this.ensureLoop('amb-drone', { bus: 'ambience', priority: 2, vary: false });
    this.ensureLoop('amb-duct', { bus: 'ambience', priority: 2, vary: false, gain: 0.7 });
  }

  drip(): void {
    if (!this.enabled) return;
    this.varyRng = (this.varyRng * 1103515245 + 12345) >>> 0;
    if (this.varyRng % 1000 > 40) return;
    this.play('amb-drip', { bus: 'ambience', priority: 2, pan: ((this.varyRng % 200) - 100) / 100 });
  }

  nextTermStep(): SampleName {
    const names: SampleName[] = ['term-step-01', 'term-step-02', 'term-step-03'];
    return names[this.stepIndex++ % names.length];
  }

  nextNlStep(): SampleName {
    const names: SampleName[] = ['nl-step-01', 'nl-step-02', 'nl-step-03'];
    return names[this.nlStepIndex++ % names.length];
  }

  captureStream(): MediaStream | null {
    if (!this.ctx || !this.graph) return null;
    if (!this.capture) {
      if (typeof this.ctx.createMediaStreamDestination !== 'function') return null;
      this.capture = this.ctx.createMediaStreamDestination();
      this.graph.limiter.connect(this.capture);
    }
    return this.capture.stream;
  }

  status(): MixerStatus {
    return {
      ok: this.ready,
      enabled: this.enabled,
      muted: this.muted,
      unlocked: this.unlocked,
      state: this.ctx ? this.ctx.state : 'none',
      decoded: [...this.buffers.keys()],
      missing: [...this.missing],
      samples: this.manifest ? this.manifest.samples.length : 0,
      activeVoices: this.pool.size,
      polyphony: this.pool.max,
      musicPhase: this.musicPhase,
      ducked: this.graph?.ducked ?? false,
    };
  }

  /** Injecte un buffer déjà décodé (tests). */
  putBuffer(name: string, buf: AudioBuffer): void {
    this.buffers.set(name, buf);
  }
}

export const engine = new AudioEngine();
