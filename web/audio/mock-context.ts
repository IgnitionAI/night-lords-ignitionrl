/** AudioContext de test : graphe no-op, décode un buffer silencieux. */

type Fn = (...a: unknown[]) => unknown;

function param(v = 1) {
  return {
    value: v,
    setTargetAtTime(this: { value: number }, x: number) { this.value = x; },
    setValueAtTime(this: { value: number }, x: number) { this.value = x; },
    linearRampToValueAtTime(this: { value: number }, x: number) { this.value = x; },
    exponentialRampToValueAtTime(this: { value: number }, x: number) { this.value = x; },
  };
}

function node() {
  const n = {
    connect() { return n; },
    disconnect() { /* */ },
  };
  return n;
}

export function createMockAudioContext(sampleRate = 44100) {
  const sources: { started: boolean; stopped: boolean; onended: Fn | null; buffer: unknown; loop: boolean; playbackRate: ReturnType<typeof param> }[] = [];
  let time = 0;
  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate,
    destination: node(),
    listener: {
      positionX: param(0), positionY: param(0), positionZ: param(0),
      forwardX: param(0), forwardY: param(0), forwardZ: param(-1),
      upX: param(0), upY: param(1), upZ: param(0),
      setPosition() { /* */ },
      setOrientation() { /* */ },
    },
    createGain() {
      return { ...node(), gain: param(1) };
    },
    createDynamicsCompressor() {
      return {
        ...node(),
        threshold: param(-24),
        knee: param(30),
        ratio: param(12),
        attack: param(0.003),
        release: param(0.25),
      };
    },
    createPanner() {
      return {
        ...node(),
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 4,
        maxDistance: 40,
        rolloffFactor: 1.2,
        coneInnerAngle: 360,
        coneOuterAngle: 360,
        coneOuterGain: 0,
        positionX: param(0), positionY: param(0), positionZ: param(0),
        orientationX: param(1), orientationY: param(0), orientationZ: param(0),
        setPosition() { /* */ },
        setOrientation() { /* */ },
      };
    },
    createStereoPanner() {
      return { ...node(), pan: param(0) };
    },
    createBiquadFilter() {
      return { ...node(), type: 'lowpass', frequency: param(1200), Q: param(1) };
    },
    createBuffer(_ch: number, length: number, rate: number) {
      const data = [new Float32Array(length)];
      return {
        duration: length / rate,
        length,
        numberOfChannels: 1,
        sampleRate: rate,
        getChannelData: (i: number) => data[i] ?? data[0],
      };
    },
    createBufferSource() {
      const src = {
        buffer: null as unknown,
        loop: false,
        playbackRate: param(1),
        started: false,
        stopped: false,
        onended: null as Fn | null,
        connect() { return src; },
        disconnect() { /* */ },
        start() {
          src.started = true;
          sources.push(src);
        },
        stop() {
          src.stopped = true;
          src.onended?.(undefined);
        },
      };
      return src;
    },
    createMediaStreamDestination() {
      return { ...node(), stream: { getTracks() { return []; } } };
    },
    async decodeAudioData(_data: ArrayBuffer) {
      const length = Math.floor(sampleRate * 0.2);
      return ctx.createBuffer(1, length, sampleRate);
    },
    async resume() { ctx.state = 'running'; },
    async suspend() { ctx.state = 'suspended'; },
    close() { ctx.state = 'closed' as AudioContextState; },
    _tick(dt: number) { time += dt; ctx.currentTime = time; },
    _sources: sources,
  };
  return ctx;
}

export type MockAudioContext = ReturnType<typeof createMockAudioContext>;
