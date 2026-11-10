/** Compat : l'ancienne façade Honsou réexporte le moteur WebAudio. */
export {
  initAudio, unlock, setEnabled, isEnabled, audio,
  onStep, onServoCharge, onBolterBurst, onFistCharge, onFistImpact, onHit, onServoAlarm, onServoLoop,
} from './index.ts';
export { default } from './index.ts';
