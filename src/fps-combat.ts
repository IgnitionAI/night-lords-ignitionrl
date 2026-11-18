import {collide,geometry,los,type World,type NL} from './sim';
import {isDark} from './fps-lighting';
import {travel} from './fps-navigation';
import {clearPath} from './ship-path';

export type CombatMode='ranged'|'hunt';
export const FIRE_RANGE={near:6,far:10,ideal:8};
type Position={x:number;y:number};
type FirePosition=Position&{until:number;contact:Position;settled?:number};
const positions=new WeakMap<World,Map<number,FirePosition>>();

/** Local light is public. Neither mode nor routing reads an unperceived player position. */
export function updateCombatMode(w:World,n:NL):CombatMode|undefined {
 if(!w.lighting)return;
 const wanted:CombatMode=isDark(w,n.x,n.y)?'hunt':'ranged';
 if(n.combatMode===undefined){n.combatMode=wanted;n.combatChangedAt=w.tick-8;}
 if(n.combatSampleTick===w.tick)return n.combatMode;
 n.combatSampleTick=w.tick;
 if(wanted===n.combatMode){n.combatPending=undefined;n.combatPendingTicks=0;return n.combatMode;}
 n.combatPendingTicks=n.combatPending===wanted?(n.combatPendingTicks??0)+1:1;n.combatPending=wanted;
 // Brief debounce at circuit borders; a committed claw and its riposte window finish before withdrawal.
 if(n.combatPendingTicks>=(wanted==='hunt'?2:3)&&w.tick-(n.combatChangedAt??0)>=8&&!n.armTicks&&!(n.recoveryTicks??0)){
  n.combatMode=wanted;n.combatChangedAt=w.tick;n.combatPending=undefined;n.combatPendingTicks=0;
  n.shotTicks=0;n.burstTicks=0;n.lightCover=undefined;
  positions.get(w)?.delete(w.nls.indexOf(n));
  if(wanted==='hunt')n.lightRetreatUntil=0;
 }
 return n.combatMode;
}
export function mayStartClaw(w:World,n:NL){return !w.lighting||(n.combatMode==='hunt'&&isDark(w,n.x,n.y));}
export function mayShoot(w:World,n:NL){return !w.lighting||(n.combatMode==='ranged'&&!isDark(w,n.x,n.y));}

/** A shared, bounded fire-position planner; learned mission roles still choose the flank. */
export function rangedAction(w:World,i:number,sideHint=0):number|undefined {
 const n=w.nls[i],b=n.belief;if(n.combatMode!=='ranged'||!b.valid||b.age>=90)return;
 const distance=Math.hypot(n.x-b.x,n.y-b.y);
 let cache=positions.get(w);if(!cache){cache=new Map();positions.set(w,cache);}
 let target=cache.get(i);
 const relocating=!!target&&w.tick>=target.until;
 if(target&&(w.tick>=target.until||Math.hypot(b.x-target.contact.x,b.y-target.contact.y)>2.2))target=undefined;
 const withdrawing=(n.lightRetreatUntil??0)>w.tick||distance<FIRE_RANGE.near;
 if(!target&&!relocating&&b.seen&&distance>=FIRE_RANGE.near&&distance<=FIRE_RANGE.far&&!withdrawing){
  target={x:n.x,y:n.y,until:w.tick+28,settled:w.tick,contact:{x:b.x,y:b.y}};
  cache.set(i,target);return 0;
 }
 if(target){
  const range=Math.hypot(target.x-b.x,target.y-b.y);
  if(range<5.5||range>11.5)target=undefined;
 }
 if(!target){
  let best=Infinity;const bounds=geometry(w.propSolids).size;
  const angle=Math.atan2(n.y-b.y,n.x-b.x),side=sideHint||((i+w.seed)%2?1:-1);
  // Sample around the last contact. Prefer reachable firing lanes next to cover, with spaced squad slots.
  for(const radius of [7,8.5,10])for(let k=-8;k<=8;k++){
   const a=angle+k*Math.PI/12,x=b.x+Math.cos(a)*radius,y=b.y+Math.sin(a)*radius;
   if(x<.6||y<.6||x>bounds.w-.6||y>bounds.h-.6)continue;
   const p={x,y};collide(p,.55,w.propSolids);if(Math.hypot(p.x-x,p.y-y)>.02)continue;
   const visible=los(x,y,b.x,b.y,w.propSolids),direct=clearPath(w,n.x,n.y,x,y,.5);
   const cover=[-1,1].some(s=>!los(x+Math.cos(a+Math.PI/2)*s*1.4,y+Math.sin(a+Math.PI/2)*s*1.4,b.x,b.y,w.propSolids));
   const crowded=n.mates.some((m,j)=>j!==i&&m.known&&m.alive&&m.age<20&&Math.hypot(x-m.x,y-m.y)<2);
   const displacement=Math.hypot(x-n.x,y-n.y);
   const dx=x-n.x,dy=y-n.y,t=Math.max(0,Math.min(1,((b.x-n.x)*dx+(b.y-n.y)*dy)/Math.max(.01,dx*dx+dy*dy)));
   const crossesContact=Math.hypot(n.x+dx*t-b.x,n.y+dy*t-b.y)<Math.min(4,distance-.2);
   const cost=displacement*.65+Math.abs(radius-FIRE_RANGE.ideal)*.6+(visible?0:7)+(direct?0:5)+(cover?-1.4:0)+(crowded?6:0)+(k*side<0?.8:0)+(displacement<1?4:0)+(crossesContact?20:0);
   if(cost<best){best=cost;target={x,y,until:w.tick+35,contact:{x:b.x,y:b.y}};}
  }
  if(target)cache.set(i,target);
 }
 if(!target)return 0;
 if(Math.hypot(n.x-target.x,n.y-target.y)<.55){
  if(target.settled===undefined){target.settled=w.tick;target.until=w.tick+24;}
  n.lightRetreatUntil=0;
  return 0;
 }
 // A visible target already at useful range can be aimed at before the next relocation.
 return travel(w,i,target.x,target.y,.5);
}

export function firePosition(w:World,i:number){const p=positions.get(w)?.get(i);return p?{x:p.x,y:p.y}:null;}

/** No shot through a squadmate, including when they cross a prepared firing line. */
export function clearFireLane(w:World,n:NL,x:number,y:number){
 if(!los(n.x,n.y,x,y,w.propSolids))return false;
 const dx=x-n.x,dy=y-n.y,len2=dx*dx+dy*dy;
 return !w.nls.some(m=>{
  if(m===n||!m.alive||Math.abs((m.height??0)-(n.height??0))>1.5)return false;
  const t=((m.x-n.x)*dx+(m.y-n.y)*dy)/Math.max(.01,len2);
  return t>.03&&t<.97&&Math.hypot(m.x-n.x-dx*t,m.y-n.y-dy*t)<.65;
 });
}
