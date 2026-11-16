import {shipHeading} from './ship-path';
import { angNorm, nlFrame, rayFree, type World } from './sim';
/** Learned actor remains authoritative. A wounded, exposed squadmate may retreat during recovery. */
export function griffeAction(w:World,i:number,learned:number):number {
 const n=w.nls[i],b=n.belief;
 if(!n.alive)return 0;
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
