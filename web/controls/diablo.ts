// Contrôles de la vue Diablo : traduction pure clavier + curseur → `TAction` (fwd, turn).
// Aucune règle de src/sim.ts ne change : mêmes turnMax / turnAccel / fwd / back, strafeAccel reste à 0.
// Le Terminator ne marche que dans son axe ; on choisit donc seulement *quand* il avance ou recule, et
// *vers où* il pivote. Rien ici ne lit l'horloge : même entrée, même sortie (captures déterministes).

/** Demi-cône (50°) dans lequel une direction écran compte comme « devant » (ou « derrière » pour reculer). */
export const DIABLO_WALK_HALF = 50 * Math.PI / 180;
/** Gain de la consigne de vitesse de rotation (rad/s par rad d'écart), celui du schéma clavier existant. */
export const DIABLO_TURN_GAIN = 2.4;
/** En deçà de cette distance au sol (m), le cap du curseur est indéfini : on tient le cap courant. */
export const DIABLO_AIM_DEADZONE = 0.35;

export interface DiabloTerm { x: number; y: number; facing: number; turnVel: number }
export interface DiabloTurnCfg { turnMax: number; turnAccel: number }
/** `up` / `right` ∈ {-1, 0, 1} : ZQSD ou flèches, en directions écran. */
export interface DiabloKeys { up: number; right: number }
/** Point du sol sous le curseur, en coordonnées sim (x, y = z monde). `null` : pas de souris sur le canvas. */
export type DiabloAim = { x: number; y: number } | null;

/** Codes physiques (`e.code`) des déplacements. Les flèches sont la référence ; ZQSD (AZERTY) / WASD (QWERTY) en alternative. */
export const DIABLO_MOVE_CODES = {
  up: ['ArrowUp', 'KeyW', 'KeyZ'], down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA', 'KeyQ'], right: ['ArrowRight', 'KeyD'],
} as const;

/** Touches tenues → direction écran. En vue Diablo, aucune touche ne fait pivoter directement : ←/→ déplacent. */
export function diabloKeys(has: (code: string) => boolean): DiabloKeys {
  const any = (codes: readonly string[]) => codes.some(has);
  return {
    up: (any(DIABLO_MOVE_CODES.up) ? 1 : 0) - (any(DIABLO_MOVE_CODES.down) ? 1 : 0),
    right: (any(DIABLO_MOVE_CODES.right) ? 1 : 0) - (any(DIABLO_MOVE_CODES.left) ? 1 : 0),
  };
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Cap sim d'une direction écran (caméra à lacet `camYaw`), ou `null` sans touche. */
export function screenHeading(k: DiabloKeys, camYaw: number): number | null {
  if (k.up === 0 && k.right === 0) return null;
  const gx = Math.cos(camYaw), gy = Math.sin(camYaw);
  return Math.atan2(k.up * gy + k.right * gx, k.up * gx - k.right * gy);
}

/** Consigne `turn` ∈ [-1, 1] : contrôleur turnVel borné (vitesse voulue ∝ écart, plafonnée à turnMax, rampée par turnAccel). */
export function turnToward(t: DiabloTerm, target: number, cfg: DiabloTurnCfg, dt: number): number {
  const diff = wrap(target - t.facing);
  const wantVel = clamp(diff * DIABLO_TURN_GAIN, -cfg.turnMax, cfg.turnMax);
  return clamp((wantVel - t.turnVel) / (cfg.turnAccel * dt), -1, 1);
}

export interface DiabloOut { fwd: number; turn: number }

/**
 * Sans curseur : schéma historique, ZQSD oriente et fait avancer quand le cap est à moins de 50° (jamais de recul).
 * Avec curseur : le Terminator pivote vers le point visé ; ZQSD ne fait qu'avancer (direction à moins de 50° du cap),
 * reculer (à moins de 50° de l'opposé, vitesse `back` de la sim) ou rien.
 */
export function diabloControls(t: DiabloTerm, keys: DiabloKeys, aim: DiabloAim, camYaw: number, cfg: DiabloTurnCfg, dt: number): DiabloOut {
  const dir = screenHeading(keys, camYaw);
  const cosHalf = Math.cos(DIABLO_WALK_HALF);
  if (aim === null) {
    if (dir === null) return { fwd: 0, turn: 0 };
    return { fwd: Math.cos(wrap(dir - t.facing)) > cosHalf ? 1 : 0, turn: turnToward(t, dir, cfg, dt) };
  }
  const dx = aim.x - t.x, dy = aim.y - t.y;
  const target = Math.hypot(dx, dy) < DIABLO_AIM_DEADZONE ? t.facing : Math.atan2(dy, dx);
  const turn = turnToward(t, target, cfg, dt);
  if (dir === null) return { fwd: 0, turn };
  const c = Math.cos(wrap(dir - t.facing));
  return { fwd: c > cosHalf ? 1 : c < -cosHalf ? -1 : 0, turn };
}

/** Rayon caméra → plan du sol y = 0. Retourne le point en coordonnées sim (x, y = z monde), ou `null` si le rayon ne descend pas. */
export function rayToGround(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { x: number; y: number } | null {
  if (dy > -1e-6) return null;
  const s = -oy / dy;
  return { x: ox + dx * s, y: oz + dz * s };
}
