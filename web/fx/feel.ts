// Game-feel : hit-stop, ralenti de kill-cam, shake directionnel, post (CA / vignette).
// Purement présentation. Le hit-stop gèle le pas de sim ; les FX visuels continuent.

export const HITSTOP_S = {
  boltKill: 0.062,
  fistKill: 0.078,
  fist: 0.052,
  claw: 0.048,
  clawArmor: 0.040,
} as const;

export const KILLCAM_S = 0.26;
export const KILLCAM_SCALE = 0.36;

export const SHAKE_AMP = {
  bolt: 0.10,
  boltKill: 0.22,
  fist: 0.26,
  claw: 0.16,
  clawArmor: 0.07,
} as const;

export interface FeelState {
  hitstop: number;
  killcam: number;
  shake: number;
  dirX: number;
  dirZ: number;
  bloom: number;
  ca: number;
  vignettePulse: number;
}

export function freshFeel(bloom: number): FeelState {
  return { hitstop: 0, killcam: 0, shake: 0, dirX: 0, dirZ: 1, bloom, ca: 0, vignettePulse: 0 };
}

export function punchFeel(s: FeelState, stop: number, shake: number, dx: number, dz: number, killcam: boolean): void {
  s.hitstop = Math.max(s.hitstop, stop);
  if (shake >= s.shake) {
    s.shake = shake;
    const n = Math.hypot(dx, dz) || 1;
    s.dirX = dx / n;
    s.dirZ = dz / n;
  } else {
    s.shake = Math.max(s.shake, shake);
  }
  if (killcam) s.killcam = Math.max(s.killcam, KILLCAM_S);
}

/** Temps de sim pendant un frame mur. Hit-stop → 0 ; kill-cam → ralenti. */
export function simDelta(s: FeelState, wallDt: number): number {
  if (s.hitstop > 0) return 0;
  if (s.killcam > 0) return wallDt * KILLCAM_SCALE;
  return wallDt;
}

export function advanceFeel(s: FeelState, wallDt: number, armorFrac: number, t: number, lowArmorFx: boolean): void {
  s.hitstop = Math.max(0, s.hitstop - wallDt);
  s.killcam = Math.max(0, s.killcam - wallDt);
  s.shake *= Math.exp(-wallDt * 9.5);
  if (s.shake < 0.002) s.shake = 0;
  if (lowArmorFx && armorFrac < 0.25) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 5.2);
    s.ca = 0.0016 * pulse;
    s.vignettePulse = 0.28 * pulse;
  } else {
    s.ca = 0;
    s.vignettePulse = 0;
  }
}

export function shakeOffset(s: FeelState): { sx: number; sz: number } {
  const perpX = -s.dirZ, perpZ = s.dirX;
  const wobble = s.shake * 0.18;
  return {
    sx: s.dirX * s.shake + perpX * wobble,
    sz: s.dirZ * s.shake + perpZ * wobble,
  };
}
