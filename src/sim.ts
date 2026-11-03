// Simulation à pas fixe, pure (aucune dépendance) : la même sert au jeu, à l'entraînement et à l'éval.
// Principe repris de The Crucible (IgnitionAI/ignition, packages/demo-cage-duel) : tick fixe de 100 ms,
// la sim fait foi pour le rendu comme pour l'entraînement.
import { mulberry32, gauss, type Rng } from './rng';

export const DT = 0.1;
export const MAX_TICKS = 1200; // 120 s simulées
export const ARENA = { w: 40, h: 24 };
export interface Box { x0: number; y0: number; x1: number; y1: number }
export const PILLARS: Box[] = [
  { x0: 9, y0: 4, x1: 11, y1: 8 }, { x0: 9, y0: 16, x1: 11, y1: 20 },
  { x0: 17, y0: 10, x1: 19, y1: 14 },
  { x0: 24, y0: 3, x1: 26, y1: 7 }, { x0: 24, y0: 17, x1: 26, y1: 21 },
  { x0: 31, y0: 8.5, x1: 33, y1: 10.5 }, { x0: 31, y0: 13.5, x1: 33, y1: 15.5 },
];
export const BEACON = { x: 37.5, y: 12, r: 1.6 };
export const ROLES = ['Talos', 'Uzas', 'Xarl', 'Cyrion'] as const;
export const N_NL = 4;

// Valeurs de prototype, à régler au ressenti. Ce ne sont pas des chiffres du lore.
export const T_CFG = {
  radius: 0.8, fwd: 2.5, back: 1.5, strafe: 1.5, hp: 30,
  // --- Inertie (à régler au ressenti) : rien n'est instantané chez un Terminator. Il met du temps à prendre
  // sa vitesse (`accel`), plus encore à la perdre (`decel`), et sa « tourelle » (la rotation) monte en régime
  // (`turnAccel`) jusqu'à un plafond (`turnMax`) — la vitesse de rotation d'avant, 1,6 rad/s, devient ce plafond.
  accel: 3, decel: 5, turnAccel: 2, turnMax: 1.6,
  // Aucune accélération latérale : `strafe` ne translate pas (voir `step`). `strafe` reste un plafond inutilisé
  // tant que cette valeur vaut 0 ; la hausser rendrait un pas de côté instantané, donc la mobilité qu'on retire.
  strafeAccel: 0,
  strideTime: 0.9, // une foulée = |v| · 0,9 s : la cadence des pas suit la vitesse
  boltCd: 12, boltRange: 16, boltHalf: 0.12, fistCd: 12, fistRange: 2.4, fistHalf: 1.0,
  visionHalf: 1.2, visionRange: 14, auspex: 4,
  noiseMove: 9, noiseIdle: 3, noiseBolt: 18, noiseFist: 12,
  channel: 60, // la téléportation exige 6 s dans la zone sans subir de dégât
  // --- Armes (lot 3) : uniquement des valeurs **dérivées**. Les cinq valeurs de base du combat (boltHalf, boltCd,
  // fistCd, fistRange, fistHalf) ne changent pas ; ce qui suit les met en forme (rafale, munitions, charge, stagger).
  boltAmmo: 30, // chargeur : 30 munitions, soit 10 rafales de 3
  boltBurst: 3, // tirs par rafale
  boltBurstGap: 1, // ticks entre deux tirs de la même rafale (1 = ticks consécutifs)
  boltReload: 20, // rechargement : 20 ticks = 2 s, pendant lesquels on ne court pas
  boltSpreadStep: 0.25, // dispersion ajoutée par tir déjà parti dans la rafale (0,25 = +25 %)
  fistChargeTicks: 8, // 0,8 s de charge de gantelet, non annulable
  fistStunTicks: 6, // stagger : 0,6 s pendant lesquelles la meute ne peut plus frapper
  slowScale: 0.5, // recharger ou charger un coup occupe les mains : vitesse réduite de moitié
  stunSpeed: 0.5, // un Night Lord étourdi se traîne à vitesse réduite
};
export const NL_CFG = {
  radius: 0.45, speed: 6, visionHalf: 1.1, visionRange: 12, clawRange: 1.75, clawCd: 8,
  frontHalf: 1.05, rearHalf: 2.1, dmgSide: 1, dmgRear: 2, hearSigma: 1.5,
  noiseMove: 5, noiseClaw: 7, voxRange: 14, // un frère n'est connu que vu, entendu ou à portée de vox
};

export interface TAction { fwd: number; strafe: number; turn: number; bolt: boolean; fist: boolean }
export const T_IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
export interface Belief { valid: boolean; x: number; y: number; age: number; facing: number | null; seen: boolean; heard: boolean; vox: boolean }
export interface Mate { known: boolean; x: number; y: number; age: number; alive: boolean }
export interface NL {
  role: number; x: number; y: number; facing: number; alive: boolean; cd: number; armTicks: number; belief: Belief;
  lastAction: number; noise: number; mates: Mate[];
  stunTicks: number; // stagger du gantelet (0 = rien) : cd de griffe gelé et déplacement ralenti
}
export interface Term {
  x: number; y: number; facing: number; hp: number; boltCd: number; fistCd: number; noise: number; moving: boolean;
  channel: number; lastHitTick: number; lastHitAngle: number;
  vx: number; vy: number; // vitesse courante (m/s, repère monde) : le Terminator ne l'atteint jamais d'un coup
  turnVel: number; // vitesse de rotation (rad/s), rampée vers ±turnMax
  strideAcc: number; // distance parcourue depuis le dernier pas (m)
  foot: 0 | 1; // pied qui vient de frapper le sol (0 = gauche, 1 = droit)
  // --- état des armes : ce qui n'est plus instantané. Ces champs changent les trajectoires (vitesse réduite) et
  // les durées (rafale, charge) : voir l'encadré du RAPPORT.
  ammo: number; // munitions restantes dans le chargeur
  burstLeft: number; // tirs restants dans la rafale en cours (0 = pas de rafale)
  burstCd: number; // ticks avant le prochain tir de la rafale
  reloadLeft: number; // ticks de rechargement restants (0 = chargeur utilisable)
  fistCharge: number; // ticks de charge du gantelet restants (0 = rien en cours)
}
export type Ev =
  // `recoil` (0 → 1) : recul normalisé du tir dans sa rafale, pour que la caméra ait une donnée et pas une impression.
  | { type: 'bolt'; x: number; y: number; tx: number; ty: number; kill: number; recoil: number }
  // `staggered` : le choc a étourdi au moins un Night Lord encore debout (`kill` reste l'index de la cible tuée, ou -1).
  | { type: 'fist'; kill: number; staggered: boolean }
  | { type: 'fistCharge' } // entrée en charge : le coup est engagé, il ne s'annule plus
  | { type: 'fistReady' } // fin de charge : l'impact tombe dans le même tick, l'audio peut le précéder
  | { type: 'claw'; who: number; dmg: number; zone: 'front' | 'side' | 'rear' }
  | { type: 'whiff'; who: number }
  | { type: 'clawArm'; who: number } // annonce : le coup tombe 2 ticks plus tard, il est télégraphié
  // le pas est un événement de simulation (et non un détail de rendu) : il porte le pied, la position et
  // l'intensité, pour que le son et l'animation n'aient pas à réinventer la cadence. `intensity: 0` = pas d'arrêt.
  | { type: 'step'; x: number; y: number; foot: 0 | 1; intensity: number };
/** Options de simulation. `clawWindup` : armement de 2 ticks avant l'impact des griffes (défaut `true`). */
export interface WorldOpts { clawWindup?: boolean }
export interface World {
  seed: number; tick: number; rng: Rng; t: Term; nls: NL[]; opts: Required<WorldOpts>;
  done: boolean; winner: 'pack' | 'terminator' | null; reason: string; events: Ev[];
}
export const NL_ACTIONS = ['tenir', 'approcher', 'reculer', 'flanc G', 'flanc D', 'diag G', 'diag D', 'griffes'] as const;
export const N_ACT = NL_ACTIONS.length;

export const angNorm = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
/** Déplace `v` vers `target` d'au plus `step`, sans dépassement (intégration d'une vitesse bornée). */
export const moveToward = (v: number, target: number, step: number) =>
  Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export function segHitsBox(ax: number, ay: number, bx: number, by: number, b: Box): boolean {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - b.x0], [dx, b.x1 - ax], [-dy, ay - b.y0], [dy, b.y1 - ay]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
export function los(ax: number, ay: number, bx: number, by: number): boolean {
  for (const b of PILLARS) if (segHitsBox(ax, ay, bx, by, b)) return false;
  return true;
}
function insideAny(x: number, y: number, m: number) {
  return PILLARS.some(b => x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m);
}
export function collide(p: { x: number; y: number }, r: number) {
  p.x = Math.min(ARENA.w - r, Math.max(r, p.x)); p.y = Math.min(ARENA.h - r, Math.max(r, p.y));
  for (const b of PILLARS) {
    const cx = Math.min(b.x1, Math.max(b.x0, p.x)), cy = Math.min(b.y1, Math.max(b.y0, p.y));
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (d > 0 && d < r) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; }
    else if (d === 0) {
      const pen = [p.x - b.x0 + r, b.x1 - p.x + r, p.y - b.y0 + r, b.y1 - p.y + r];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) p.x = b.x0 - r; else if (i === 1) p.x = b.x1 + r; else if (i === 2) p.y = b.y0 - r; else p.y = b.y1 + r;
    }
  }
}
// Distance libre le long d'un rayon (pas de 0,25 m), plafonnée.
export function rayFree(x: number, y: number, dx: number, dy: number, max = 6): number {
  for (let s = 0.25; s <= max; s += 0.25) {
    const px = x + dx * s, py = y + dy * s;
    if (px < 0 || py < 0 || px > ARENA.w || py > ARENA.h || insideAny(px, py, 0)) return s;
  }
  return max;
}

export function newWorld(seed: number, tSpawn?: { x: number; y: number; facing: number }, opts: WorldOpts = {}): World {
  const rng = mulberry32(seed);
  const t: Term = { x: 3, y: 6 + rng() * 12, facing: 0, hp: T_CFG.hp, boltCd: 0, fistCd: 0, noise: T_CFG.noiseIdle, moving: false, channel: 0, lastHitTick: -999, lastHitAngle: 0,
    vx: 0, vy: 0, turnVel: 0, strideAcc: 0, foot: 0,
    ammo: T_CFG.boltAmmo, burstLeft: 0, burstCd: 0, reloadLeft: 0, fistCharge: 0 };
  if (tSpawn) { t.x = tSpawn.x; t.y = tSpawn.y; t.facing = tSpawn.facing; }
  const nls: NL[] = [];
  for (let i = 0; i < N_NL; i++) {
    let x = 0, y = 0;
    do { x = 26 + rng() * 12; y = 2 + rng() * 20; } while (insideAny(x, y, 0.8) || dist(x, y, t.x, t.y) < 12);
    nls.push({ role: i, x, y, facing: Math.PI, alive: true, cd: 0, armTicks: 0, lastAction: 0, noise: 0, mates: [], stunTicks: 0,
      belief: { valid: false, x: BEACON.x, y: BEACON.y, age: 99, facing: null, seen: false, heard: false, vox: false } });
  }
  for (const n of nls) n.mates = nls.map(() => ({ known: false, x: n.x, y: n.y, age: 99, alive: true }));
  const w: World = { seed, tick: 0, rng, t, nls, opts: { clawWindup: opts.clawWindup ?? true }, done: false, winner: null, reason: '', events: [] };
  perceive(w);
  return w;
}

export function nlSees(w: World, n: NL): boolean {
  const t = w.t, d = dist(n.x, n.y, t.x, t.y);
  if (d > NL_CFG.visionRange) return false;
  const a = Math.atan2(t.y - n.y, t.x - n.x);
  if (Math.abs(angNorm(a - n.facing)) > NL_CFG.visionHalf + Math.atan2(T_CFG.radius, d)) return false;
  return los(n.x, n.y, t.x, t.y);
}
// Ce que le Terminator perçoit : cône de vision + auspex court (même logique, pas d'omniscience).
export function terminatorPerceives(w: World): number[] {
  const t = w.t, out: number[] = [];
  for (let i = 0; i < w.nls.length; i++) {
    const n = w.nls[i]; if (!n.alive) continue;
    const d = dist(n.x, n.y, t.x, t.y);
    if (d <= T_CFG.auspex) { out.push(i); continue; }
    if (d > T_CFG.visionRange) continue;
    if (Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing)) > T_CFG.visionHalf) continue;
    if (los(t.x, t.y, n.x, n.y)) out.push(i);
  }
  return out;
}

function nlSeesPoint(n: NL, x: number, y: number, r: number): boolean {
  const d = dist(n.x, n.y, x, y); if (d > NL_CFG.visionRange) return false;
  if (Math.abs(angNorm(Math.atan2(y - n.y, x - n.x) - n.facing)) > NL_CFG.visionHalf + Math.atan2(r, d)) return false;
  return los(n.x, n.y, x, y);
}
function perceive(w: World) {
  const t = w.t;
  const seers = w.nls.filter(n => n.alive && nlSees(w, n));
  for (const n of w.nls) {
    if (!n.alive) continue;
    const b = n.belief; b.seen = seers.includes(n);
    b.vox = !b.seen && seers.some(m => dist(m.x, m.y, n.x, n.y) <= NL_CFG.voxRange); b.heard = false;
    if (b.seen || b.vox) { b.valid = true; b.x = t.x; b.y = t.y; b.age = 0; b.facing = t.facing; }
    else {
      b.facing = null;
      if (dist(n.x, n.y, t.x, t.y) <= t.noise) {
        b.heard = true; b.valid = true; b.age = 0;
        b.x = t.x + gauss(w.rng) * NL_CFG.hearSigma; b.y = t.y + gauss(w.rng) * NL_CFG.hearSigma;
      } else b.age++;
    }
    // frères : vus, entendus (bruit de leurs pas / griffes) ou à portée de vox ; sinon dernière position connue qui vieillit
    w.nls.forEach((m, j) => {
      if (j === n.role) return; const k = n.mates[j]; const d = dist(n.x, n.y, m.x, m.y);
      const known = d <= NL_CFG.voxRange || (m.alive && (d <= m.noise || nlSeesPoint(n, m.x, m.y, NL_CFG.radius))) || (!m.alive && nlSeesPoint(n, m.x, m.y, NL_CFG.radius));
      k.known = known; if (known) { k.x = m.x; k.y = m.y; k.age = 0; k.alive = m.alive; } else k.age++;
    });
  }
}

/** Repère d'action d'un Night Lord : axe u vers la croyance (ou la balise si aucune info), v à gauche. */
export function nlFrame(n: NL) {
  const tx = n.belief.valid ? n.belief.x : BEACON.x, ty = n.belief.valid ? n.belief.y : BEACON.y;
  let ux = tx - n.x, uy = ty - n.y; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
  return { ux, uy, vx: -uy, vy: ux, d };
}

export const OBS_DIM = 32;
/** Observation d'un Night Lord : uniquement sa croyance (vu / entendu / vox), ce qu'il sait de ses frères, les murs. */
export function observe(w: World, i: number): number[] {
  const n = w.nls[i], b = n.belief, f = nlFrame(n), o: number[] = [];
  for (let r = 0; r < N_NL; r++) o.push(r === n.role ? 1 : 0);
  o.push(n.cd / NL_CFG.clawCd, b.seen ? 1 : 0, b.heard ? 1 : 0, b.vox ? 1 : 0, b.facing !== null ? 1 : 0);
  o.push(Math.min(1, b.valid ? b.age / 50 : 1), Math.min(1, f.d / 20));
  if (b.facing !== null) { const rel = angNorm(Math.atan2(n.y - b.y, n.x - b.x) - b.facing); o.push(Math.cos(rel), Math.sin(rel)); }
  else o.push(0, 0);
  o.push(w.t.hp / T_CFG.hp); // armure entamée : visible et relayée (règle publique du prototype)
  o.push(w.t.channel / T_CFG.channel); // la balise s'illumine pendant la téléportation : publique
  for (let j = 0; j < N_NL; j++) {
    if (j === i) continue; const k = n.mates[j];
    const dx = k.x - n.x, dy = k.y - n.y, live = k.alive && k.age < 99;
    o.push(k.known ? 1 : 0, Math.min(1, k.age / 50), live ? (dx * f.ux + dy * f.uy) / 20 : 0, live ? (dx * f.vx + dy * f.vy) / 20 : 0);
  }
  o.push(rayFree(n.x, n.y, f.ux, f.uy) / 6, rayFree(n.x, n.y, -f.ux, -f.uy) / 6, rayFree(n.x, n.y, f.vx, f.vy) / 6, rayFree(n.x, n.y, -f.vx, -f.vy) / 6);
  o.push(w.tick / MAX_TICKS);
  return o;
}

export const REWARD = { tick: -0.002, dmgSelf: 0.5, dmgTeam: 0.2, front: -0.05, death: -1, win: 3, loss: -2, shaping: 0.03, gamma: 0.99,
  uzasBait: 0.01, cyrionRear: 0.5, xarlFinish: 0.3, talosSpot: 0.005 };

export interface StepOut { rewards: number[]; died: boolean[] }

/**
 * Impact d'une griffe : portée et zone sont re-vérifiées ici, à l'instant où le coup tombe — jamais au moment
 * de l'annonce. Une cible sortie de portée pendant l'armement encaisse un `whiff` et zéro dégât.
 * Les récompenses restent attachées à l'impact effectif, pas à l'armement.
 */
function clawImpact(w: World, i: number, n: NL, rewards: number[], died: boolean[]) {
  const t = w.t;
  if (dist(n.x, n.y, t.x, t.y) > NL_CFG.clawRange) { w.events.push({ type: 'whiff', who: i }); return; }
  const rel = Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing));
  const zone = rel < NL_CFG.frontHalf ? 'front' : rel > NL_CFG.rearHalf ? 'rear' : 'side';
  const dmg = zone === 'front' ? 0 : zone === 'rear' ? NL_CFG.dmgRear : NL_CFG.dmgSide;
  const before = t.hp; t.hp = Math.max(0, t.hp - dmg);
  if (dmg > 0) { t.lastHitTick = w.tick; t.lastHitAngle = Math.atan2(n.y - t.y, n.x - t.x); }
  w.events.push({ type: 'claw', who: i, dmg, zone });
  if (dmg === 0) rewards[i] += REWARD.front;
  rewards[i] += REWARD.dmgSelf * dmg;
  if (n.role === 3 && zone === 'rear') rewards[i] += REWARD.cyrionRear * dmg;
  if (n.role === 2 && before <= T_CFG.hp / 2) rewards[i] += REWARD.xarlFinish * dmg;
  w.nls.forEach((m, j) => { if (m.alive && !died[j]) rewards[j] += REWARD.dmgTeam * dmg; });
}

/**
 * Impact du gantelet, à la fin de la charge. La géométrie de ciblage est celle d'avant (`fistRange` + rayon de la
 * cible, `fistHalf` en angle, ligne de vue **non** requise : on frappe au contact) et le contact tue toujours net.
 * Ce qui est nouveau, c'est le **stagger** : le choc étourdit les Night Lords encore debout. `stunTicks` gèle la
 * décrémentation de leur `cd` de griffe (la prochaine attaque est donc repoussée d'autant) et divise leur vitesse.
 * `stunTicks` est une **règle de simulation** ajoutée ici, pas un détail de rendu : elle change les trajectoires et
 * les durées. Un coup déjà armé (`armTicks`) atterrit quand même : il était parti avant le choc.
 */
function fistImpact(w: World, died: boolean[]) {
  const t = w.t;
  t.fistCd = T_CFG.fistCd; // le cooldown part **à l'impact**, pas à l'entrée en charge
  t.noise = Math.max(t.noise, T_CFG.noiseFist);
  let best = -1, bd = 1e9;
  w.nls.forEach((n, i) => {
    if (!n.alive) return; const d = dist(n.x, n.y, t.x, t.y);
    if (d <= T_CFG.fistRange + NL_CFG.radius && Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing)) <= T_CFG.fistHalf && d < bd) { bd = d; best = i; }
  });
  if (best >= 0) { w.nls[best].alive = false; died[best] = true; }
  // Le choc se propage aux survivants (la cible du contact, elle, est au sol) : c'est « la meute » qui perd l'initiative.
  let staggered = false;
  for (const n of w.nls) { if (!n.alive) continue; n.stunTicks = Math.max(n.stunTicks, T_CFG.fistStunTicks); staggered = true; }
  w.events.push({ type: 'fist', kill: best, staggered });
}

export function step(w: World, ta: TAction, acts: number[]): StepOut {
  const t = w.t; w.events = [];
  const rewards = w.nls.map(() => REWARD.tick), died = w.nls.map(() => false);
  const phi0 = w.nls.map(n => -REWARD.shaping * nlFrame(n).d); // potentiel calculé sur la croyance, pas sur la vraie position
  // --- Terminator : rien n'est instantané. L'entrée ne déplace pas : elle fixe une consigne que l'état de vitesse
  // rejoint par rampe. C'est l'inertie qui fait la tension du jeu (quatre prédateurs rapides contre une forteresse
  // lente), pas la fragilité du Terminator.
  const turnIn = Math.max(-1, Math.min(1, ta.turn));
  t.turnVel = Math.max(-T_CFG.turnMax, Math.min(T_CFG.turnMax, t.turnVel + turnIn * T_CFG.turnAccel * DT));
  if (turnIn === 0) t.turnVel = moveToward(t.turnVel, 0, T_CFG.turnAccel * DT); // relâcher ne freine pas net
  t.facing = angNorm(t.facing + t.turnVel * DT);

  const fwd = Math.max(-1, Math.min(1, ta.fwd));
  // Recharger ou charger un coup occupe les mains : la vitesse est réduite de moitié (on recharge, on ne court pas).
  // Le facteur est lu sur l'état **au début du tick** : c'est l'état qui pèse sur le pas de ce tick.
  const speedScale = (t.reloadLeft > 0 || t.fistCharge > 0) ? T_CFG.slowScale : 1;
  // Le vecteur vitesse suit l'axe du regard : on n'intègre que la composante longitudinale. `strafe` est donc une
  // **orientation** de la marche, pas un pas de côté : sans accélération latérale (`strafeAccel = 0`), une vitesse
  // latérale ne peut jamais naître, et la créer d'un coup rendrait au Terminator la mobilité instantanée qu'on lui
  // retire. Pour se décaler, il doit pivoter — c'est exactement la « tourelle » lente qu'on veut faire ressentir.
  const cx = Math.cos(t.facing), cy = Math.sin(t.facing);
  let vLong = t.vx * cx + t.vy * cy; // projection sur le nouvel axe : il n'y a pas de latéral, et pivoter coûte un peu de vitesse (cos de l'angle tourné)
  const vTarget = (fwd >= 0 ? T_CFG.fwd * fwd : T_CFG.back * fwd) * speedScale;
  // freiner, c'est décélérer : entrée nulle, ou consigne opposée au sens de la marche en cours
  const braking = fwd === 0 || (vLong !== 0 && Math.sign(vTarget) !== Math.sign(vLong));
  vLong = moveToward(vLong, vTarget, (braking ? T_CFG.decel : T_CFG.accel) * DT);
  const vLat = 0; // `strafeAccel = 0` : aucune accélération latérale, donc jamais de vitesse latérale
  t.vx = cx * vLong - cy * vLat; t.vy = cy * vLong + cx * vLat;
  const wasMoving = t.moving; // avant de recalculer : sert au pas d'arrêt (un seul, pas un par tick)
  t.x += t.vx * DT; t.y += t.vy * DT; collide(t, T_CFG.radius);
  const speed = Math.abs(vLong);
  t.moving = speed > 1e-6; // la vitesse réelle, pas l'entrée : le Terminator reste bruyant en glissant
  t.noise = t.moving ? T_CFG.noiseMove : T_CFG.noiseIdle;
  if (t.fistCharge > 0) t.noise = Math.max(t.noise, T_CFG.noiseFist); // la charge s'entend venir
  // --- le pas comme événement de simulation. La foulée vaut |v| · 0,9 s : à pleine vitesse un pas tous les
  // 0,9 s (~2,25 m), et la cadence suit la vitesse quand elle retombe.
  t.strideAcc += speed * DT;
  if (t.moving) {
    if (t.strideAcc >= speed * T_CFG.strideTime) {
      w.events.push({ type: 'step', x: t.x, y: t.y, foot: t.foot, intensity: Math.min(1, speed / T_CFG.fwd) });
      t.strideAcc = 0; t.foot = t.foot === 0 ? 1 : 0;
    }
  } else if (wasMoving) {
    // « un Terminator qui s'arrête, ça s'entend » : un seul pas d'intensité 0, puis silence.
    w.events.push({ type: 'step', x: t.x, y: t.y, foot: t.foot, intensity: 0 });
    t.strideAcc = 0;
  }
  if (t.boltCd > 0) t.boltCd--; if (t.fistCd > 0) t.fistCd--;
  // État des armes au début du tick : un appui qui engage une charge (ou un chargeur qui se remplit) ce tick ne se
  // décompte pas le jour même. C'est ce qui rend la charge lisible : `fistCharge === 8` pendant tout le tick d'entrée.
  const wasCharging = t.fistCharge > 0;
  // --- Bolter lourd : rafale de `boltBurst` tirs, un par tick, avec munitions, dispersion et recul.
  const wasReloading = t.reloadLeft > 0; // état du début de tick : le chargeur qui vient de se remplir ce tick ne tire pas encore
  if (ta.bolt && t.boltCd === 0 && !wasReloading && t.burstLeft === 0 && t.ammo > 0) {
    t.burstLeft = T_CFG.boltBurst; t.burstCd = 0;
  }
  if (t.burstLeft > 0) {
    if (t.burstCd > 0) t.burstCd--;
    if (t.burstCd === 0) {
      const fired = T_CFG.boltBurst - t.burstLeft; // 0 pour le premier tir de la rafale
      // Dispersion : `T_CFG.boltHalf · (1 + 0,25 · tirs déjà partis)`. Un Terminator qui tient la détente encaisse
      // le recul de ses propres tirs : le 2ᵉ part 25 % plus large, le 3ᵉ 50 %. C'est le prix de la rafale — et ce
      // qui laisse à la meute une chance de sortir du cône entre deux balles. Le 1er tir garde la précision d'avant.
      const half = T_CFG.boltHalf * (1 + T_CFG.boltSpreadStep * fired);
      t.ammo--; t.burstLeft--; t.noise = Math.max(t.noise, T_CFG.noiseBolt);
      let best = -1, bd = 1e9;
      w.nls.forEach((n, i) => {
        if (!n.alive) return; const d = dist(n.x, n.y, t.x, t.y); if (d > T_CFG.boltRange) return;
        const e = Math.abs(angNorm(Math.atan2(n.y - t.y, n.x - t.x) - t.facing));
        if (e <= half + Math.atan2(NL_CFG.radius, d) && d < bd && los(t.x, t.y, n.x, n.y)) { bd = d; best = i; }
      });
      const ex = best >= 0 ? w.nls[best].x : t.x + cx * T_CFG.boltRange, ey = best >= 0 ? w.nls[best].y : t.y + cy * T_CFG.boltRange;
      if (best >= 0) { w.nls[best].alive = false; died[best] = true; }
      // Recul normalisé : 1/3, 2/3, 1 sur une rafale de 3 — croissant, saturé à 1 au dernier tir.
      w.events.push({ type: 'bolt', x: t.x, y: t.y, tx: ex, ty: ey, kill: best, recoil: (fired + 1) / T_CFG.boltBurst });
      if (t.burstLeft > 0 && t.ammo > 0) t.burstCd = T_CFG.boltBurstGap; // tir suivant au prochain tick
      else {
        // Fin de rafale : 3 tirs partis, ou chargeur vide. Le cooldown global part maintenant, comme avant.
        t.burstLeft = 0; t.burstCd = 0; t.boltCd = T_CFG.boltCd;
        if (t.ammo === 0) t.reloadLeft = T_CFG.boltReload; // chargeur vide : rechargement automatique (2 s)
      }
    }
  }
  // --- Gantelet : l'appui engage la charge, il ne peut plus l'annuler (une nouvelle entrée est ignorée pendant
  // les 8 ticks). `fistCd` ne part qu'à l'impact, dans `fistImpact`.
  if (ta.fist && t.fistCd === 0 && t.fistCharge === 0) {
    t.fistCharge = T_CFG.fistChargeTicks;
    t.noise = Math.max(t.noise, T_CFG.noiseFist);
    w.events.push({ type: 'fistCharge' });
  }
  // --- Rechargement : 20 ticks sans tir, puis chargeur plein. Le décompte se fait en fin de tick pour que le tick
  // où le chargeur se remplit ne puisse pas tirer (le tir est décidé avant, donc pendant les 20 ticks pleins).
  if (wasReloading) { t.reloadLeft--; if (t.reloadLeft === 0) t.ammo = T_CFG.boltAmmo; }
  // --- Night Lords (mêmes règles de collision et de portée)
  for (let i = 0; i < w.nls.length; i++) {
    const n = w.nls[i]; if (!n.alive || died[i]) continue;
    const a = acts[i] ?? 0; n.lastAction = a; const f = nlFrame(n); n.noise = 0;
    const stunned = n.stunTicks > 0; // stagger du gantelet : ni attaque, ni course
    if (n.cd > 0 && !stunned) n.cd--; // le cd de griffe est **gelé** pendant le stagger : la prochaine attaque est repoussée d'autant
    // armement en cours : le coup tombe quand le compte atteint 0, soit 2 ticks après l'annonce (il était parti avant le choc)
    if (n.armTicks > 0 && --n.armTicks === 0) clawImpact(w, i, n, rewards, died);
    if (a === 7) {
      n.facing = Math.atan2(f.uy, f.ux);
      if (n.cd === 0 && !stunned) {
        n.cd = NL_CFG.clawCd; n.noise = NL_CFG.noiseClaw;
        if (w.opts.clawWindup) { n.armTicks = 2; w.events.push({ type: 'clawArm', who: i }); }
        else clawImpact(w, i, n, rewards, died); // comportement d'avant : les dégâts tombent dans le tick
      }
    } else if (a > 0) {
      const dirs: Record<number, [number, number]> = { 1: [1, 0], 2: [-1, 0], 3: [0, 1], 4: [0, -1], 5: [0.7071, 0.7071], 6: [0.7071, -0.7071] };
      const [du, dv] = dirs[a]; const mx = f.ux * du + f.vx * dv, my = f.uy * du + f.vy * dv;
      const sp = NL_CFG.speed * (stunned ? T_CFG.stunSpeed : 1); // étourdi : il se traîne
      n.x += mx * sp * DT; n.y += my * sp * DT; n.facing = Math.atan2(my, mx); n.noise = NL_CFG.noiseMove;
    } else n.facing = Math.atan2(f.uy, f.ux);
    collide(n, NL_CFG.radius);
    const d = dist(n.x, n.y, t.x, t.y), mind = NL_CFG.radius + T_CFG.radius;
    if (d < mind && d > 0) { n.x = t.x + (n.x - t.x) / d * mind; n.y = t.y + (n.y - t.y) / d * mind; collide(n, NL_CFG.radius); }
    if (n.stunTicks > 0) n.stunTicks--; // décompte en fin de tick : la valeur pleine reste lisible au tick d'impact
    if (n.role === 1 && n.belief.facing !== null) { // Uzas : se savoir (vu ou vox) dans le cône avant, proche = appât
      const b = n.belief, rel = Math.abs(angNorm(Math.atan2(n.y - b.y, n.x - b.x) - b.facing!));
      if (rel < 0.6 && dist(n.x, n.y, b.x, b.y) < 7) rewards[i] += REWARD.uzasBait;
    }
  }
  for (let i = 0; i < w.nls.length; i++) for (let j = i + 1; j < w.nls.length; j++) {
    const a = w.nls[i], b = w.nls[j]; if (!a.alive || !b.alive) continue;
    const d = dist(a.x, a.y, b.x, b.y), m = 2 * NL_CFG.radius;
    if (d < m && d > 0) { const p = (m - d) / 2; a.x -= (b.x - a.x) / d * p; a.y -= (b.y - a.y) / d * p; b.x += (b.x - a.x) / d * p; b.y += (b.y - a.y) / d * p; }
  }
  // --- Gantelet : la charge se décompte **en fin de tick**, après que la meute a joué. L'impact tombe donc à la fin
  // du 8ᵉ tick qui suit l'entrée, sur les positions de fin de tick (comme un contact, pas comme un tir). Le stagger
  // qu'il pose se lit alors à sa valeur pleine (`fistStunTicks`) et couvre les 6 ticks suivants.
  if (wasCharging) {
    t.fistCharge--;
    if (t.fistCharge === 0) {
      w.events.push({ type: 'fistReady' }); // fin de charge : l'audio sait que le coup tombe maintenant
      fistImpact(w, died);
    }
  }
  // téléportation : 6 s dans la zone sans être touché
  const inZone = dist(t.x, t.y, BEACON.x, BEACON.y) <= BEACON.r;
  t.channel = inZone && t.lastHitTick !== w.tick ? t.channel + 1 : 0;
  w.tick++;
  perceive(w);
  w.nls.forEach((n, i) => {
    if (died[i]) rewards[i] += REWARD.death;
    if (n.alive && n.role === 0 && n.belief.seen) rewards[i] += REWARD.talosSpot;
    if (n.alive) rewards[i] += REWARD.gamma * -REWARD.shaping * nlFrame(n).d - phi0[i];
  });
  // --- fin de manche
  if (t.hp <= 0) { w.done = true; w.winner = 'pack'; w.reason = 'Terminator abattu'; }
  else if (w.nls.every(n => !n.alive)) { w.done = true; w.winner = 'terminator'; w.reason = 'meute anéantie'; }
  else if (t.channel >= T_CFG.channel) { w.done = true; w.winner = 'terminator'; w.reason = 'téléporté'; }
  else if (w.tick >= MAX_TICKS) { w.done = true; w.winner = 'terminator'; w.reason = 'temps écoulé, il a tenu'; }
  if (w.done) w.nls.forEach((n, i) => { if (n.alive) rewards[i] += w.winner === 'pack' ? REWARD.win : REWARD.loss; });
  return { rewards, died };
}

// Champ de distances vers la balise (Dijkstra sur grille 0,5 m, piliers gonflés du rayon du Terminator).
// Sert aux Terminators scriptés pour contourner les piliers ; c'est une carte publique, pas une triche.
const CELL = 0.5, GW = Math.round(ARENA.w / CELL), GH = Math.round(ARENA.h / CELL);
let FIELD: Float32Array | null = null;
function buildField() {
  const f = new Float32Array(GW * GH).fill(Infinity); const blocked = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
    if (insideAny(x, y, T_CFG.radius) || x < T_CFG.radius || y < T_CFG.radius || x > ARENA.w - T_CFG.radius || y > ARENA.h - T_CFG.radius) blocked[gy * GW + gx] = 1;
  }
  const bx = Math.floor(BEACON.x / CELL), by = Math.floor(BEACON.y / CELL); f[by * GW + bx] = 0;
  const q: number[] = [by * GW + bx];
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (q.length) { // petite file de priorité naïve (grille de 3 840 cases, calcul unique)
    let bi = 0; for (let i = 1; i < q.length; i++) if (f[q[i]] < f[q[bi]]) bi = i;
    const c = q.splice(bi, 1)[0], cx = c % GW, cy = (c - cx) / GW;
    for (const [dx, dy, cost] of nb) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx; if (blocked[ni]) continue;
      if (dx && dy && (blocked[cy * GW + nx] || blocked[ny * GW + cx])) continue;
      if (f[c] + cost < f[ni]) { if (f[ni] === Infinity) q.push(ni); f[ni] = f[c] + cost; }
    }
  }
  return f;
}
/** Direction (angle) de descente du champ vers la balise depuis (x, y). */
export function beaconHeading(x: number, y: number): number {
  FIELD ??= buildField();
  const gx = Math.min(GW - 1, Math.max(0, Math.floor(x / CELL))), gy = Math.min(GH - 1, Math.max(0, Math.floor(y / CELL)));
  let best = FIELD[gy * GW + gx], bx = 0, by = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const v = FIELD[ny * GW + nx] + 0.01 * Math.hypot(dx, dy); if (v < best) { best = v; bx = dx; by = dy; }
  }
  if (bx === 0 && by === 0) return Math.atan2(BEACON.y - y, BEACON.x - x);
  return Math.atan2(by, bx);
}
