// Calage locomotion rendu : le déplacement monde vient de la sim (pas de root motion).
// timeScale = v · T / foulée  ⇒  distance monde par cycle = foulée mesurée au sol.

export const MOVE_EPS = 0.1; // m/s : 0,01 m par tick de 0,1 s, même seuil que l'ancien `moved`

export type Gait = 'idle' | 'walk' | 'run';

export function cycleDistance(speed: number, clipDuration: number, timeScale: number): number {
  if (timeScale <= 1e-12) return Infinity;
  return speed * clipDuration / timeScale;
}

export function gaitTimeScale(speed: number, stride: number, clipDuration: number): number {
  if (speed < MOVE_EPS || stride <= 1e-6 || clipDuration <= 1e-6) return 1;
  return (speed * clipDuration) / stride;
}

export function pickGait(
  speed: number,
  opts: { allowRun: boolean; walkSpeed: number; runSpeed: number },
): Gait {
  if (speed < MOVE_EPS) return 'idle';
  if (!opts.allowRun) return 'walk';
  const mid = 0.5 * (opts.walkSpeed + opts.runSpeed);
  return speed >= mid ? 'run' : 'walk';
}

// Sous-pas mixer : le pas de sim reste DT, timeScale inchangé. Avec timeScale≈3, un seul
// mixer.update(DT) saute ~0,3 s de clip (~2 poses / cycle de run). On découpe pour que
// chaque évaluation reste au plus à l'intervalle de clés Genex (1/30 s de temps clip).
export const MIXER_MAX_ANIM_STEP = 1 / 30;

export function mixerSubstepCount(
  dt: number,
  timeScale: number,
  maxAnimStep = MIXER_MAX_ANIM_STEP,
): number {
  if (!(dt > 0) || !(maxAnimStep > 0)) return 1;
  const anim = dt * Math.abs(timeScale);
  if (anim <= 0) return 1;
  return Math.max(1, Math.ceil(anim / maxAnimStep - 1e-12));
}

export function advanceMixer(
  mixer: { update(deltaTime: number): void },
  dt: number,
  substeps: number,
  onStep?: (stepIndex: number, stepDt: number) => void,
): void {
  const n = Math.max(1, Math.floor(substeps));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    mixer.update(h);
    onStep?.(i, h);
  }
}
