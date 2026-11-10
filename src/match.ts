// Lisibilité de manche : horloge, objectifs, armes, rythme. Aucune règle de simulation nouvelle —
// on lit `World` après `step`. Les raisons de victoire restent celles de `src/sim.ts`.
import {
  BEACON, DT, MAX_TICKS, ROLES, T_CFG, dist,
  type Term, type World,
} from './sim';

export const HOLD_WARN_S = 15;

export type MatchPhase = 'hunt' | 'channel' | 'lastStand' | 'hold' | 'over';
export type MatchBeatKind = 'channelStart' | 'channelBreak' | 'lastStand' | 'timePressure' | 'reload' | 'fistCharge';
export interface MatchBeat { kind: MatchBeatKind }

export interface RosterEntry { role: (typeof ROLES)[number]; alive: boolean }
export interface WeaponReadout {
  ammo: number; ammoMax: number; reloadLeft: number; burstLeft: number;
  boltReady: boolean; fistReady: boolean; fistCharge: number; staggered: boolean;
  bolterLabel: string; fistLabel: string;
}
export interface MatchStatus {
  ticksLeft: number; secondsLeft: number; clock: string; timePressure: boolean;
  inBeacon: boolean; channeling: boolean; channelFrac: number;
  packAlive: number; roster: RosterEntry[]; phase: MatchPhase;
  winner: World['winner']; reason: string; done: boolean;
  armor: { hp: number; max: number; frac: number; critical: boolean };
  weapons: WeaponReadout;
  objectiveLine: string;
}

export interface RoundCard {
  roundNo: number; winner: World['winner']; reason: string; title: string;
  seconds: number; packAlive: number; survivors: string[]; how: string;
}

export function formatClock(ticksLeft: number): string {
  const s = Math.max(0, Math.floor(Math.max(0, ticksLeft) * DT));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function secLabel(ticks: number): string {
  return `${(ticks * DT).toFixed(1)} s`;
}

function weaponReadout(t: Term): WeaponReadout {
  const staggered = t.staggerTicks > 0;
  let bolterLabel: string;
  if (t.reloadLeft > 0) bolterLabel = `recharge ${secLabel(t.reloadLeft)}`;
  else if (t.burstLeft > 0) bolterLabel = `rafale ${t.burstLeft}`;
  else if (t.boltCd > 0) bolterLabel = '…';
  else bolterLabel = `prêt ${t.ammo}/${T_CFG.boltAmmo}`;
  let fistLabel: string;
  if (t.fistCharge > 0) fistLabel = `charge ${secLabel(t.fistCharge)}`;
  else if (t.fistCd > 0) fistLabel = '…';
  else fistLabel = 'prêt';
  return {
    ammo: t.ammo, ammoMax: T_CFG.boltAmmo, reloadLeft: t.reloadLeft, burstLeft: t.burstLeft,
    boltReady: t.reloadLeft === 0 && t.boltCd === 0 && t.burstLeft === 0,
    fistReady: t.fistCharge === 0 && t.fistCd === 0, fistCharge: t.fistCharge, staggered,
    bolterLabel, fistLabel,
  };
}

function phaseOf(s: Omit<MatchStatus, 'phase' | 'objectiveLine'>): MatchPhase {
  if (s.done) return 'over';
  if (s.channeling) return 'channel';
  if (s.packAlive === 1) return 'lastStand';
  if (s.timePressure) return 'hold';
  return 'hunt';
}

function objectiveLine(phase: MatchPhase, s: Omit<MatchStatus, 'phase' | 'objectiveLine'>): string {
  switch (phase) {
    case 'over':
      return s.winner === 'pack' ? 'La meute gagne' : 'Le Terminator gagne';
    case 'channel':
      return 'Canalisation à la balise — un coup qui blesse remet à zéro';
    case 'lastStand':
      return 'Dernier Night Lord — tuez-le ou tenez';
    case 'hold':
      return `Tenez encore ${s.clock}`;
    case 'hunt':
      return 'Objectif : tenez 2:00 · anéantissez la meute · canalisez 6 s à la balise';
    default: {
      const _n: never = phase;
      return _n;
    }
  }
}

export function matchStatus(w: World): MatchStatus {
  const ticksLeft = Math.max(0, MAX_TICKS - w.tick);
  const secondsLeft = ticksLeft * DT;
  const inBeacon = dist(w.t.x, w.t.y, BEACON.x, BEACON.y) <= BEACON.r;
  const roster: RosterEntry[] = w.nls.map((n, i) => ({ role: ROLES[i], alive: n.alive }));
  const packAlive = roster.filter(r => r.alive).length;
  const base = {
    ticksLeft, secondsLeft, clock: formatClock(ticksLeft),
    timePressure: !w.done && secondsLeft <= HOLD_WARN_S,
    inBeacon, channeling: w.t.channel > 0, channelFrac: w.t.channel / T_CFG.channel,
    packAlive, roster, winner: w.winner, reason: w.reason, done: w.done,
    armor: {
      hp: w.t.hp, max: T_CFG.hp, frac: w.t.hp / T_CFG.hp,
      critical: w.t.servoCriticalSent || w.t.hp < T_CFG.hp * T_CFG.servoCriticalFrac,
    },
    weapons: weaponReadout(w.t),
  };
  const phase = phaseOf(base);
  return { ...base, phase, objectiveLine: objectiveLine(phase, base) };
}

export function matchBeats(prev: MatchStatus | null, next: MatchStatus): MatchBeat[] {
  if (!prev) return [];
  const out: MatchBeat[] = [];
  if (!prev.channeling && next.channeling) out.push({ kind: 'channelStart' });
  if (prev.channeling && !next.channeling && !next.done) out.push({ kind: 'channelBreak' });
  if (prev.packAlive > 1 && next.packAlive === 1) out.push({ kind: 'lastStand' });
  if (!prev.timePressure && next.timePressure) out.push({ kind: 'timePressure' });
  if (prev.weapons.reloadLeft === 0 && next.weapons.reloadLeft > 0) out.push({ kind: 'reload' });
  if (prev.weapons.fistCharge === 0 && next.weapons.fistCharge > 0) out.push({ kind: 'fistCharge' });
  return out;
}

function howOf(reason: string, winner: World['winner']): string {
  switch (reason) {
    case 'Terminator abattu':
      return 'L\'armure est tombée à 0. La meute a frappé de flanc ou dans le dos.';
    case 'meute anéantie':
      return 'Les quatre Night Lords sont à terre.';
    case 'téléporté':
      return 'Canalisation de 6 s à la balise, sans coup qui blesse.';
    case 'temps écoulé, il a tenu':
      return '120 s tenues. Le Terminator n\'a pas été abattu.';
    default:
      return winner === 'pack' ? 'La meute l\'emporte.' : 'Le Terminator l\'emporte.';
  }
}

export function roundCard(w: World, extra: { roundNo: number }): RoundCard {
  const survivors = w.nls.filter(n => n.alive).map(n => ROLES[n.role]);
  const winner = w.winner;
  return {
    roundNo: extra.roundNo, winner, reason: w.reason,
    title: winner === 'pack' ? 'la meute gagne' : 'le Terminator gagne',
    seconds: w.tick * DT, packAlive: survivors.length, survivors,
    how: howOf(w.reason, winner),
  };
}

export function hudMarkup(s: MatchStatus, extra: {
  roundNo: number; score: { pack: number; term: number };
  demo?: boolean; alarmOn?: boolean; servoAlarm?: boolean; servoCritical?: boolean;
  policyLine?: string; burnIn?: string;
}): string {
  const armorPct = Math.max(0, Math.min(100, s.armor.frac * 100));
  const beaconPct = Math.max(0, Math.min(100, s.channelFrac * 100));
  const clockCls = s.timePressure ? 'clock warn' : 'clock';
  const demo = extra.demo ? `<b class="demo">MISE EN SCÈNE</b> — ce n'est pas une manche jouée · ` : '';
  const alarm = extra.alarmOn && extra.servoAlarm ? ' <b class="alarm">■ ALARME SERVO</b>'
    : extra.servoCritical ? ' <b class="crit">servos critiques</b>' : '';
  const stagger = s.weapons.staggered ? ' · <b class="stagger">choc</b>' : '';
  const roster = s.roster.map(r =>
    `<b class="${r.alive ? 'up' : 'down'}">${r.role}${r.alive ? '' : ' †'}</b>`).join(' ');
  const policy = extra.policyLine ? `<div class="meta">${extra.policyLine}</div>` : '';
  const burn = extra.burnIn ? `<div class="burn">${extra.burnIn}</div>` : '';
  return `${demo}<div class="head"><b>TERMINATOR</b> — manche ${extra.roundNo}`
    + ` · <span class="score">meute ${extra.score.pack} · Terminator ${extra.score.term}</span>`
    + ` · <span class="${clockCls}">${s.clock}</span></div>`
    + `<div class="obj">${s.objectiveLine}</div>`
    + `<div class="bar armor" title="armure"><i style="width:${armorPct}%"></i></div>`
    + `<div class="bar beacon" title="canalisation"><i style="width:${beaconPct}%"></i></div>`
    + `<div class="vitals">Armure ${s.armor.hp}/${s.armor.max}${alarm}${stagger}`
    + ` · bolter ${s.weapons.bolterLabel} · gantelet ${s.weapons.fistLabel}`
    + ` · munitions ${s.weapons.ammo}/${s.weapons.ammoMax}</div>`
    + `<div class="roster">${roster}</div>`
    + policy + burn;
}

export function roundMarkup(card: RoundCard): string {
  const who = card.survivors.length ? card.survivors.join(', ') : 'aucun';
  return `<b>Manche ${card.roundNo} : ${card.title}</b> (${card.reason})`
    + `<p class="how">${card.how}</p>`
    + `<p>${card.seconds.toFixed(1)} s · Night Lords debout : ${who}</p>`
    + `<p>Entrée : manche suivante</p>`;
}
