// HUD casque Terminator : léger. Reticle, hit-mark, flèches de dégâts, menaces hors cadre.
import type { MatchStatus } from '../../src/match';
import type { OffscreenMark } from './fps';

export interface HitFlash {
  t: number;
  kill: boolean;
}

export interface DmgFlash {
  t: number;
  zone: 'front' | 'side' | 'rear';
  ang: number;
}

export function fpsHudMarkup(s: MatchStatus, extra: {
  roundNo: number;
  score: { pack: number; term: number };
  demo?: boolean;
  alarmOn?: boolean;
  servoAlarm?: boolean;
  servoCritical?: boolean;
  policyLine?: string;
  burnIn?: string;
}): string {
  const armorPct = Math.max(0, Math.min(100, s.armor.frac * 100));
  const ammoPct = Math.max(0, Math.min(100, (s.weapons.ammo / Math.max(1, s.weapons.ammoMax)) * 100));
  const demo = extra.demo ? `<b class="demo">MISE EN SCÈNE</b>` : '';
  const alarm = extra.alarmOn && extra.servoAlarm
    ? '<b class="alarm">ALARME SERVO</b>'
    : extra.servoCritical ? '<b class="crit">servos critiques</b>' : '';
  const stagger = s.weapons.staggered ? '<b class="stagger">choc</b>' : '';
  const fist = s.weapons.fistCharge > 0
    ? `charge ${s.weapons.fistCharge}`
    : s.weapons.fistLabel;
  const policy = extra.policyLine ? `<div class="meta">${extra.policyLine}</div>` : '';
  const burn = extra.burnIn ? `<div class="burn">${extra.burnIn}</div>` : '';
  return `${demo}<div class="helm">
    <div class="cell armor"><span>ARMURE</span><b>${s.armor.hp}/${s.armor.max}</b>
      <i class="pip"><u style="width:${armorPct}%"></u></i></div>
    <div class="cell ammo"><span>BOLTER</span><b>${s.weapons.ammo}/${s.weapons.ammoMax}</b>
      <i class="pip"><u style="width:${ammoPct}%"></u></i>
      <em>${s.weapons.bolterLabel}</em></div>
    <div class="cell fist"><span>GANTELET</span><b>${fist}</b></div>
    <div class="cell clock"><span>TEMPS</span><b class="${s.timePressure ? 'warn' : ''}">${s.clock}</b></div>
  </div>
  <div class="pack">${s.roster.map((r) => `<b class="${r.alive ? 'up' : 'down'}">${r.role[0]}</b>`).join('')}</div>
  <div class="alarms">${alarm}${stagger}</div>
  <div class="score">M${extra.score.pack} · T${extra.score.term} · ${extra.roundNo}</div>
  ${policy}${burn}`;
}

export function dmgSide(zone: 'front' | 'side' | 'rear', hitAng: number, facing: number): 'front' | 'back' | 'left' | 'right' {
  if (zone === 'rear') return 'back';
  if (zone === 'front') return 'front';
  let rel = hitAng - facing;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return rel > 0 ? 'left' : 'right';
}

export function marksHtml(marks: readonly OffscreenMark[]): string {
  return marks.map((m) => {
    const x = 50 + m.edgeX * 46;
    const y = 50 + m.edgeY * 42;
    const cls = m.armed ? 'threat armed' : 'threat';
    return `<i class="${cls}" style="left:${x}%;top:${y}%"></i>`;
  }).join('');
}
