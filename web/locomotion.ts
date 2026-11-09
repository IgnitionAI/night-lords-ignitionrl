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
