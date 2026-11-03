export type Status = {
  ok: boolean;
  enabled: boolean;
  state: string;
  decoded: string[];
  missing: string[];
  samples: number;
  servo: boolean;
};

export type InitResult = { ok: boolean; samples: number; missing: string[]; reason?: string };

export type PlayOpts = { pan?: number; gain?: number; intensity?: number };

export function initAudio(opts?: {
  base?: string;
  manifest?: string;
  enabled?: boolean;
  preload?: string[];
  autounlock?: boolean;
  master?: number;
}): Promise<InitResult>;

export function unlock(): boolean;
export function setEnabled(v: boolean): boolean;
export function isEnabled(): boolean;

export declare const audio: {
  step(o?: PlayOpts): boolean;
  bolt(o?: PlayOpts): boolean;
  fist(o?: PlayOpts): boolean;
  gauntletCharge(o?: PlayOpts): boolean;
  gauntletArc(o?: PlayOpts): boolean;
  clawArm(o?: PlayOpts): boolean;
  claw(o?: PlayOpts): boolean;
  whiff(o?: PlayOpts): boolean;
  servoCreak(o?: { pan?: number }): boolean;
  servoSurge(o?: { pan?: number }): boolean;
  servoWhine(o?: { pan?: number }): boolean;
  servo: {
    start(o?: { pan?: number; load?: number }): boolean;
    setLoad(load?: number): boolean;
    stop(o?: { fade?: number }): boolean;
    isRunning(): boolean;
  };
  unlock(): boolean;
  mute(v?: boolean): boolean;
  status(): Status;
  preload(names?: string[]): Promise<string[]>;
  attachLifecycle(): boolean;
  detachLifecycle(): boolean;
};

export function onStep(intensity?: number, pan?: number): boolean;
export function onServoCharge(pan?: number): boolean;
export function onBolterBurst(pan?: number): boolean;
export function onFistCharge(pan?: number): boolean;
export function onFistImpact(pan?: number): boolean;
export function onHit(kind?: 'claw' | 'armor' | 'miss', pan?: number): boolean;
export function onServoAlarm(pan?: number): boolean;
export const onServoLoop: {
  start(o?: { pan?: number; load?: number }): boolean;
  load(x?: number): boolean;
  stop(o?: { fade?: number }): boolean;
};

export default audio;
