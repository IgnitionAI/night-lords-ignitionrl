export { parseFxQuality, FX_BUDGET, type FxQuality } from './quality';
export {
  HITSTOP_S, KILLCAM_S, KILLCAM_SCALE, SHAKE_AMP,
  freshFeel, punchFeel, simDelta, advanceFeel, shakeOffset, type FeelState,
} from './feel';
export { clipRayToAabbs, type ClipHit, type Aabb } from './hits';
export { eventsToFxPulses, fxCueFor, FX_CUE_FALLBACK, type FxPulse, type FxKind, type FxCueGate } from './events';
export { createFxSystem, type FxSystem, type FxWorldView } from './system';
