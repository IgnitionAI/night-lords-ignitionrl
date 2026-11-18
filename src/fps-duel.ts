import {angNorm,nlFrame,nlSees,type World} from './sim';
import {travel,searchContact} from './fps-navigation';
import {lightAction} from './fps-lighting';
import {updateCombatMode,rangedAction} from './fps-combat';

/** Solo elite: decisions use perception or retained contacts, not omniscient tracking. */
export function eliteDuelAction(w:World,i:number):number {
 const n=w.nls[i],b=n.belief;n.navHeading=undefined;n.navDistance=undefined;
 if(!n.alive)return 0;
 updateCombatMode(w,n);
 if((n.burstTicks??0)>0)n.burstTicks!--;
 if((n.burstRest??0)>0)n.burstRest!--;
 const visible=nlSees(w,n);
 // Also permit the controller's first tick after a deliberate encounter placement.
 if(visible){b.valid=true;b.x=w.t.x;b.y=w.t.y;b.age=0;b.facing=w.t.facing;b.seen=true;}
 if((n.recoveryTicks??0)>0||n.stunTicks||n.armTicks||(n.shotTicks??0)>0)return 0;
 const lighting=lightAction(w,i);if(lighting!==undefined)return lighting;
 const ranged=rangedAction(w,i);if(ranged!==undefined)return ranged;
 if(!visible){
  if(b.valid&&b.age<90)return searchContact(w,i);
  const points=[[7,12],[20,6],[28,12],[20,18]];
  const p=points[Math.floor(w.tick/80)%points.length];return travel(w,i,p[0],p[1]);
 }
 const f=nlFrame(n),d=f.d,side=w.seed%2?1:-1;
 const facing=b.facing===null?Math.PI:Math.abs(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing));
 if(w.t.fistCharge>0&&d<3.5)return travel(w,i,n.x-f.ux*2,n.y-f.uy*2,.1);
 if(d<1.7&&n.cd===0)return 7;
 if(n.burstRest===0&&d>3&&d<9&&(n.reloadHeardUntil!>w.tick||facing<.25)){
  n.burstTicks=5;n.burstRest=32;
 }
 if(d<2.8&&n.cd>0)return travel(w,i,n.x+f.vx*side*1.5-f.ux*.3,n.y+f.vy*side*1.5-f.uy*.3,.1);
 const angle=Math.atan2(n.y-b.y,n.x-b.x)+(facing<.35&&d>3?.5*side:0);
 return travel(w,i,b.x+Math.cos(angle)*1.4,b.y+Math.sin(angle)*1.4,.15);
}
