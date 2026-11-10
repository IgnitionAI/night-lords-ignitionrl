import { director } from './director';
import { engine } from './engine';
import type { InitResult, PlayOpts } from './types';

export * from './types';
export { engine, AudioEngine } from './engine';
export { director, AudioDirector } from './director';
export { VoicePool } from './voices';
export { buildMixer, duckMusic, setBusGain, setMasterMuted } from './mixer';
export { createMockAudioContext } from './mock-context';
export { occluded } from './occlusion';

export async function initAudio(opts?: {
  base?: string;
  manifest?: string;
  enabled?: boolean;
  autounlock?: boolean;
  master?: number;
  context?: AudioContext;
  fetchImpl?: typeof fetch;
  polyphony?: number;
  search?: string;
}): Promise<InitResult> {
  return engine.init({
    base: opts?.base ?? '/web/sfx/nightlords/',
    manifest: opts?.manifest ?? 'manifest.json',
    enabled: opts?.enabled,
    autounlock: opts?.autounlock,
    master: opts?.master,
    context: opts?.context as never,
    fetchImpl: opts?.fetchImpl,
    polyphony: opts?.polyphony,
    search: opts?.search,
  });
}

export function unlock(): boolean { return engine.unlock(); }
export function setEnabled(v: boolean): boolean { engine.setMuted(!v); return engine.enabled; }
export function isEnabled(): boolean { return engine.enabled && !engine.muted; }

export const audio = {
  step(o: PlayOpts = {}) { return engine.play(engine.nextTermStep(), o); },
  bolt(o: PlayOpts = {}) { return engine.play('bolter-shot', o); },
  fist(o: PlayOpts = {}) { return engine.play('fist-impact', o); },
  gauntletCharge(o: PlayOpts = {}) { return engine.play('term-servo', o); },
  gauntletArc(o: PlayOpts = {}) { return engine.play('claw-crackle', o); },
  clawArm(o: PlayOpts = {}) { return engine.play('claw-crackle', o); },
  claw(o: PlayOpts = {}) { return engine.play('claw-metal', o); },
  whiff(o: PlayOpts = {}) { return engine.play('claw-swoosh', o); },
  servoCreak(o: PlayOpts = {}) { return engine.play('term-hydraulic', o); },
  servoSurge(o: PlayOpts = {}) { return engine.play('term-servo', o); },
  servoWhine(o: PlayOpts = {}) { return engine.play('term-servo', { ...o, gain: 0.4 }); },
  servo: {
    start(_o?: { pan?: number; load?: number }) {
      return engine.play('term-servo', { gain: 0.35, vary: false });
    },
    setLoad(_x?: number) { return true; },
    stop(_o?: { fade?: number }) { return true; },
    isRunning() { return engine.status().activeVoices > 0; },
  },
  unlock,
  mute(v = true) { return engine.setMuted(v); },
  status() { return engine.status(); },
  async preload(names: string[] = []) {
    await Promise.all(names.map((n) => engine.decodeName(n)));
    return [...engine.buffers.keys()];
  },
  attachLifecycle() { return engine.attachLifecycle(); },
  detachLifecycle() { return engine.detachLifecycle(); },
};

export function onStep(intensity = 1, pan = 0): boolean {
  return audio.step({ pan, intensity });
}
export function onServoCharge(pan = 0): boolean { return audio.servoSurge({ pan }); }
export function onBolterBurst(pan = 0): boolean { return audio.bolt({ pan }); }
export function onFistCharge(pan = 0): boolean { return audio.gauntletCharge({ pan }); }
export function onFistImpact(pan = 0): boolean { return audio.fist({ pan }); }
export function onHit(kind: 'claw' | 'armor' | 'miss' = 'claw', pan = 0): boolean {
  if (kind === 'armor') return audio.gauntletArc({ pan });
  if (kind === 'miss') return audio.whiff({ pan });
  return audio.claw({ pan });
}
export function onServoAlarm(pan = 0): boolean {
  return engine.play('alarm-klaxon', { pan, bus: 'ui' });
}
export const onServoLoop = {
  start: (opts?: { pan?: number; load?: number }) => audio.servo.start(opts),
  load: (x?: number) => audio.servo.setLoad(x),
  stop: (opts?: { fade?: number }) => audio.servo.stop(opts),
};

export default audio;
export { director as audioDirector };
