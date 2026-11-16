import { shipHeading } from './ship-path';
import { angNorm, collide, DT, los, step, type TAction, type World } from './sim';

export const CORE = { x: 67, y: 14, r: 2.2 };
export const EXTRACTION = { x: 3, y: 12, r: 2.2 };
export interface Xeno { x: number; y: number; hp: number; windup: number; cooldown: number; active: boolean; }
export interface Mission {
  phase: 'infiltration' | 'arming' | 'escape' | 'extracted' | 'lost';
  planted: number; remaining: number; extraction: number; xenos: Xeno[];
  radio: string; radioUntil: number; cleared: boolean; narrative: number;
}
export function newMission(): Mission {
  return { phase: 'infiltration', planted: 0, remaining: 90, extraction: 0, cleared: false, narrative: 0,
    radio: 'FRÈRE VARREN · Escouade dispersée. Gagnez le noyau. Nous couvrons votre extraction.', radioUntil: 90,
    xenos: [[22,20],[40,24],[54,20],[62,6],[60,32],[24,32]].map(([x,y]) => ({x,y,hp:2,windup:0,cooldown:0,active:false})) };
}
export function missionStep(w: World, m: Mission, ta: TAction, acts: number[], interact: boolean) {
  if (w.done) return;
  w.targets = m.xenos;
  step(w, ta, acts);
  const t = w.t, near = (p: {x:number;y:number;r:number}) => Math.hypot(t.x-p.x,t.y-p.y)<p.r;
  for (const g of m.xenos) {
    if(g.hp<=0) continue;
    let d=Math.hypot(t.x-g.x,t.y-g.y);
    if(d<10 && los(g.x,g.y,t.x,t.y,w.propSolids)) g.active=true;
    if(!g.active) continue;
    if(g.cooldown>0) g.cooldown--;
    if(g.windup>0) {
      g.windup--;
      if(g.windup===0 && d<1.9 && los(g.x,g.y,t.x,t.y,w.propSolids)) {
        t.hp=Math.max(0,t.hp-2);t.lastHitTick=w.tick-1;t.lastHitAngle=Math.atan2(g.y-t.y,g.x-t.x);
        w.events.push({type:'hit',dmg:2,zone:'side',hpAfter:t.hp,stagger:false,servoAlarm:4});g.cooldown=18;
      }
    } else if(d<1.9 && !g.cooldown) g.windup=6;
    else if(d>1.4 && !g.cooldown) {
      const old={x:g.x,y:g.y}, heading=shipHeading(w,g.x,g.y,t.x,t.y);g.x+=Math.cos(heading)*.38;g.y+=Math.sin(heading)*.38;collide(g,.5,w.propSolids,old);
    }
  }
  if(t.hp<=0) {m.phase='lost';w.done=true;w.winner='pack';w.reason='Armure détruite — signal perdu';}
  if(w.done)return;
  if (m.phase === 'infiltration' || m.phase === 'arming') {
    if (near(CORE) && interact && !ta.bolt && !ta.fist && !t.moving && t.lastHitTick !== w.tick-1) {
      m.phase = 'arming'; m.planted++;
      if (m.planted >= 40) { m.phase = 'escape'; m.radio = 'CHARGE ARMÉE · 90 secondes. Repliez-vous au sas initial !'; m.radioUntil = w.tick+70; }
    } else { m.planted = 0; m.phase = 'infiltration'; }
  } else if (m.phase === 'escape') {
    m.remaining = Math.max(0, m.remaining-DT);
    m.extraction = near(EXTRACTION) && interact && t.lastHitTick !== w.tick-1 ? m.extraction+1 : 0;
    if (m.remaining <= 0) { m.phase='lost'; w.done=true; w.winner='pack'; w.reason='Détonation : extraction manquée'; }
    else if (m.extraction >= 20 && t.hp>0) { m.phase='extracted'; w.done=true; w.winner='terminator'; w.reason='Extraction réussie — vaisseau purgé'; }
  }
  if (m.phase==='infiltration' && w.tick>m.radioUntil) {
    const lines=['FRÈRE VARREN · Des griffes dans les conduits. Ne vous laissez pas immobiliser.','VOX INTERCEPTÉ · Tes frères ne répondront plus. Nous avons tout notre temps.','AUSPEX · Biomasse au noyau. Armez la charge, puis revenez au sas initial.'];
    if(m.narrative<3 && t.x>10+m.narrative*9){m.radio=lines[m.narrative++];m.radioUntil=w.tick+55;}
  }
  if (!m.cleared && w.nls.every(n=>!n.alive)) { m.cleared=true; m.radio='GRIFFE ÉLIMINÉE · La chasse est terminée. Achevez le sabotage et évacuez.'; m.radioUntil=w.tick+70; }

}
export function missionText(w: World,m: Mission) {
  if(m.phase==='extracted')return 'EXTRACTION RÉUSSIE · Charge armée · Mission accomplie';
  if(m.phase==='lost')return `MISSION ÉCHOUÉE · ${w.reason}`;
  const target=m.phase==='escape'?EXTRACTION:CORE;
  const d=Math.ceil(Math.hypot(w.t.x-target.x,w.t.y-target.y));
  const heading=angNorm(Math.atan2(target.y-w.t.y,target.x-w.t.x)-w.t.facing);
  const arrow=Math.abs(heading)<.4?'↑':heading>0?'→':'←';
  return m.phase==='escape' ? `EXTRACTION ${arrow} ${d} m · ${Math.ceil(m.remaining)} s · Maintenir E au sas (${m.extraction}/20)`
    : `NOYAU ${arrow} ${d} m · Maintenir E immobile pour armer (${Math.floor(m.planted/40*100)} %)`;
}
