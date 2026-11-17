import {collide, nlFrame, type World} from './sim';
import {shipHeading} from './ship-path';

/** Continuous steering underneath the learned action interface; targets are beliefs, never the player. */
export function travel(w:World,i:number,x:number,y:number,stop=.65):number {
 const n=w.nls[i],distance=Math.hypot(x-n.x,y-n.y);
 if(distance<stop){n.navHeading=undefined;return 0;}
 const h=shipHeading(w,n.x,n.y,x,y,.5),f=nlFrame(n);
 n.navHeading=h;n.navDistance=distance;
 // Keep the categorical action for the trained actor's diagnostics/animation intent.
 let best=-Infinity,action=1;
 for(const [a,u,v] of [[1,1,0],[2,-1,0],[3,0,1],[4,0,-1],[5,.707,.707],[6,.707,-.707]]){
  const score=(f.ux*u+f.vx*v)*Math.cos(h)+(f.uy*u+f.vy*v)*Math.sin(h);
  if(score>best){best=score;action=a;}
 }
 return action;
}

/** Search around a last contact, then turn through the room; no live target coordinates. */
export function searchContact(w:World,i:number):number {
 const n=w.nls[i],b=n.belief;
 if(Math.hypot(n.x-b.x,n.y-b.y)>1.1&&b.age<60)return travel(w,i,b.x,b.y,1);
 const phase=Math.floor(b.age/18)+i;
 const p={x:b.x+Math.cos(phase*2.4)*2,y:b.y+Math.sin(phase*2.4)*2};
 collide(p,.55,w.propSolids);
 return travel(w,i,p.x,p.y,.5);
}
