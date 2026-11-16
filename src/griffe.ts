import {huntPhase,huntStriking} from './hunt-rhythm';
import {shipHeading} from './ship-path';
import { angNorm, nlFrame, rayFree, los, collide, type World } from './sim';
/** Learned actor remains authoritative. A wounded, exposed squadmate may retreat during recovery. */
export function griffeAction(w:World,i:number,learned:number):number {
 const n=w.nls[i],b=n.belief;
 if(!n.alive)return 0;
 if(w.opts.mission)return huntAction(w,i,learned);
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
function huntAction(w:World,i:number,learned:number):number {
 const n=w.nls[i],b=n.belief,phase=huntPhase(w.tick);
 if(n.armTicks||n.stunTicks)return 0;
 // No fresh contact: hold the last shelter, never track the real player.
 if(!b.valid||b.age>50) {
  // Search patrol follows authored corridors, not the unknown player position.
  if(phase==='watch')return 0;
  const patrol=[[28,8],[21,8],[14,12],[21,16],[28,16],[35,12]];
  const point=patrol[(Math.floor(w.tick/100)+i*2)%patrol.length];
  return travel(w,i,point[0],point[1]);
 }
 const d=Math.hypot(n.x-b.x,n.y-b.y);
 if(huntStriking(w.tick,i)) {
  if(b.age>10)return 0;
  if(d<2)return learned===7?7:learned;
  return travel(w,i,b.x,b.y);
 }
 let cache=shelters.get(w);if(!cache){cache=new Map();shelters.set(w,cache);}
 let target=cache.get(i);
 if(!target||target.until<=w.tick) {
  let score=Infinity;
  for(let y=1.5;y<23;y+=2)for(let x=1.5;x<39;x+=2) {
   const range=Math.hypot(x-b.x,y-b.y);
   if(range<5||range>13||[[0,0],[.7,0],[-.7,0],[0,.7],[0,-.7]].some(([dx,dy])=>los(x+dx,y+dy,b.x,b.y,w.propSolids)))continue;
   const p={x,y};collide(p,.55,w.propSolids);
   if(Math.hypot(p.x-x,p.y-y)>.01)continue;
   const flank=Math.atan2(y-b.y,x-b.x),desired=(b.facing??0)+(i%2?1:-1)*(1.3+i*.3);
   const cost=Math.hypot(x-n.x,y-n.y)+Math.abs(angNorm(flank-desired))*2+Math.abs(range-(phase==='stalk'?6:10));
   if(cost<score){score=cost;target={x,y,until:w.tick+35};}
  }
  if(target)cache.set(i,target);
 }
 if(target)return travel(w,i,target.x,target.y);
 // Open ground has no magical disappearance: physically back off.
 return d<9?2:0;
}
/** Read-only diagnostics for encounter evaluation. */
export function huntShelter(w:World,i:number){const p=shelters.get(w)?.get(i);return p?{...p}:null;}
