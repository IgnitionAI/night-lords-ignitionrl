import {beginClimb} from './vertical-hunt';
import {CEILING_ROUTES} from './ship-layout';
import {SHIP_LANDMARKS} from './ship-layout';
import {shipHeading} from './ship-path';
import { angNorm, nlFrame, rayFree, los, collide, geometry, type World } from './sim';
/** Learned actor remains authoritative. A wounded, exposed squadmate may retreat during recovery. */
export function griffeAction(w:World,i:number,learned:number,choice?:number):number {
 const n=w.nls[i],b=n.belief;
 if(!n.alive)return 0;
 if(w.opts.mission)return huntAction(w,i,learned,choice);
 if(!b.valid||b.age>10||b.facing===null||n.armTicks||n.stunTicks)return learned;
 const f=nlFrame(n),front=Math.abs(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing));
 if(n.mates.some((m,j)=>j!==i&&m.known&&m.alive&&m.age<10)&&(n.hp??3)===1&&n.cd>0&&front<.6&&f.d<3&&rayFree(n.x,n.y,-f.ux,-f.uy,1.2,w.propSolids)>.9)return 2;
 // Only rescue a movement that would strike an obstacle. The route uses the agent's belief.
 const dirs:Record<number,[number,number]>={1:[1,0],2:[-1,0],3:[0,1],4:[0,-1],5:[.707,.707],6:[.707,-.707]};
 if(dirs[learned]&&f.d>2.8){const [u,v]=dirs[learned],dx=f.ux*u+f.vx*v,dy=f.uy*u+f.vy*v;
  if(rayFree(n.x,n.y,dx,dy,1.2,w.propSolids)<.85){
   const h=shipHeading(w,n.x,n.y,b.x,b.y);let best=-Infinity,chosen=learned;
   for(const k of [1,2,3,4,5,6]){const [a,c]=dirs[k],mx=f.ux*a+f.vx*c,my=f.uy*a+f.vy*c;
    if(rayFree(n.x,n.y,mx,my,1.2,w.propSolids)<.7)continue;
    const score=mx*Math.cos(h)+my*Math.sin(h);if(score>best){best=score;chosen=k;}}
   return chosen;
  }
 }
 return learned;
}

const shelters=new WeakMap<World,Map<number,{x:number,y:number,until:number}>>();
function travel(w:World,i:number,x:number,y:number):number {
 const n=w.nls[i],f=nlFrame(n);
 if(Math.hypot(n.x-x,n.y-y)<.65)return 0;
 const h=shipHeading(w,n.x,n.y,x,y);
 let best=-Infinity,action=0;
 for(const [k,u,v] of [[1,1,0],[2,-1,0],[3,0,1],[4,0,-1],[5,.707,.707],[6,.707,-.707]]) {
  const dx=f.ux*u+f.vx*v,dy=f.uy*u+f.vy*v;
  const next={x:n.x+dx*.32,y:n.y+dy*.32};collide(next,.45,w.propSolids,n);
  if(Math.hypot(next.x-n.x,next.y-n.y)<.025)continue;
  const score=(next.x-n.x)*Math.cos(h)+(next.y-n.y)*Math.sin(h);
  if(score>best){best=score;action=k;}
 }
 return action;
}
export type ClawRole='leader'|'bait'|'hunter'|'interceptor';
export type TacticalMode='search'|'flank'|'attack'|'cover'|'withdraw';
export interface TacticalState {role:ClawRole;mode:TacticalMode;until:number;search:number;}
const tactics=new WeakMap<World,Map<number,TacticalState>>();
export function tacticalState(w:World,i:number){return tactics.get(w)?.get(i);}
function huntAction(w:World,i:number,learned:number,choice?:number):number {
 const n=w.nls[i],b=n.belief;
 let states=tactics.get(w);if(!states){states=new Map();tactics.set(w,states);}
 let state=states.get(i);if(!state){state={role:'hunter',mode:'search',until:0,search:i};states.set(i,state);}
 // The initial roster is public. Losing contact is not evidence of death.
 // A confirmed death remains remembered after the corpse leaves sight.
 const known=n.mates.map((_,j)=>j).filter(j=>j===i||n.mates[j].alive);
 state.role=(['leader','bait','hunter','interceptor'] as ClawRole[])[known.indexOf(i)%4];
 if(n.vertical)return 0;
 if(n.armTicks||n.stunTicks)return 0;
 if(!b.valid||b.age>45){
  state.mode='search';
  const point=SHIP_LANDMARKS[state.search%SHIP_LANDMARKS.length];
  if(Math.hypot(n.x-point.x,n.y-point.y)<1)state.search++;
  return travel(w,i,point.x,point.y);
 }
 const d=Math.hypot(n.x-b.x,n.y-b.y);
 // Scripted reaction to visible aim; a short committed trajectory, not immunity.
 if(b.seen&&b.facing!==null&&d>2.5&&d<13&&!n.dodgeRest){
  const aimed=Math.abs(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing))<.18;
  if(aimed&&(choice===undefined||choice===4)){
   const side=i%2?1:-1,dx=-Math.sin(b.facing)*side,dy=Math.cos(b.facing)*side;
   for(const sign of [1,-1]){
    const end={x:n.x+dx*sign*2.55,y:n.y+dy*sign*2.55};const expected={...end};
    collide(end,.45,w.propSolids,n);
    if(Math.hypot(end.x-expected.x,end.y-expected.y)<.05){n.dodgeX=dx*sign;n.dodgeY=dy*sign;n.dodgeTicks=3;n.dodgeRest=28;break;}
   }
  }
 }

 const exposed=b.facing!==null&&Math.abs(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing))>1.2;
 const support=n.mates.some((m,j)=>j!==i&&m.known&&m.alive&&m.age<15&&Math.hypot(m.x-b.x,m.y-b.y)<9);
 // Reload is an observation acquired by perception, never a read of the player state here.
 const opportunity=b.age<8&&(exposed||n.reloadHeardUntil!>w.tick||support&&d<5);
 const retreatingMate=n.mates.some((m,j)=>j!==i&&m.known&&m.alive&&m.age<10&&(m.retreatUntil??0)>w.tick);
 const previousMode=state.mode;
 if((n.hp??7)<=4&&w.tick-(n.lastDamageTick??-999)<15){state.mode='withdraw';state.until=w.tick+25;}
 else if(retreatingMate&&b.age<15&&state.mode!=='withdraw'){state.mode='cover';state.until=w.tick+12;}
 else if(opportunity&&state.mode!=='withdraw'){state.mode='attack';state.until=w.tick+22;}
 else if(w.tick>=state.until)state.mode=state.role==='leader'||state.role==='bait'?'cover':'flank';
 n.retreatUntil=state.mode==='withdraw'?state.until:0;
 if(previousMode!==state.mode)shelters.get(w)?.delete(i);
 if(choice!==undefined&&state.mode!=='withdraw'&&!retreatingMate)state.mode=choice===0?'attack':choice===3?'cover':'flank';
 if(state.mode==='attack'&&b.age<15){if(d<1.75)return n.cd===0?7:learned;return travel(w,i,b.x,b.y);}
 if(state.mode==='flank'&&(choice===5||choice===undefined&&state.role==='interceptor')&&!n.verticalRest){
  if(beginClimb(w,n))return 0;
  const grips=CEILING_ROUTES.flatMap(r=>[r.a,r.b]).filter(p=>Math.hypot(p.x-n.x,p.y-n.y)<8);
  grips.sort((a,c)=>Math.hypot(a.x-n.x,a.y-n.y)-Math.hypot(c.x-n.x,c.y-n.y));
  if(grips[0])return travel(w,i,grips[0].x,grips[0].y);
 }
 if(state.mode==='cover'&&b.seen&&d>5&&d<11)return 0;
 let cache=shelters.get(w);if(!cache){cache=new Map();shelters.set(w,cache);}
 let target=cache.get(i);
 if(!target||target.until<=w.tick){
  target=undefined;let score=Infinity;const bounds=geometry(w.propSolids).size;
  const desired=(b.facing??0)+(choice===1?1.7:choice===2?-1.7:state.role==='interceptor'?Math.PI:state.role==='hunter'?1.7:-1.3);
  for(let y=1.5;y<bounds.h;y+=2)for(let x=1.5;x<bounds.w;x+=2){
   const range=Math.hypot(x-b.x,y-b.y);if(range<4||range>13)continue;
   const p={x,y};collide(p,.55,w.propSolids);if(Math.hypot(p.x-x,p.y-y)>.01)continue;
   const hidden=!los(x,y,b.x,b.y,w.propSolids);
   if(state.mode==='withdraw'&&!hidden)continue;
   const cost=Math.hypot(x-n.x,y-n.y)*.45+Math.abs(angNorm(Math.atan2(y-b.y,x-b.x)-desired))*4+Math.abs(range-(state.mode==='withdraw'?11:5))+(hidden?0:4);
   if(cost<score){score=cost;target={x,y,until:w.tick+20};}
  }
  if(target)cache.set(i,target);else cache.delete(i);
 }
 return target?travel(w,i,target.x,target.y):d<6?2:0;
}
/** Read-only diagnostics for encounter evaluation. */
export function huntShelter(w:World,i:number){const p=shelters.get(w)?.get(i);return p?{...p}:null;}
