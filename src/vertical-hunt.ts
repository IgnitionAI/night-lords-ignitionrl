import {CEILING_ROUTES} from './ship-layout';
import {collide,los,type World,type NL} from './sim';
export type VerticalMotion={phase:'climb'|'traverse'|'perch'|'drop';route:number;reverse:boolean;wait:number;targetX:number;targetY:number};
/** Scripted execution: finite paths, bounded displacement and no privileged target coordinates. */
export function beginClimb(w:World,n:NL):boolean{
 if(!w.opts.mission||n.vertical||n.verticalRest||n.armTicks||n.stunTicks)return false;
 for(let i=0;i<CEILING_ROUTES.length;i++)for(const reverse of [false,true]){
  const r=CEILING_ROUTES[i],a=reverse?r.b:r.a;
  if(Math.hypot(n.x-a.x,n.y-a.y)<.7){n.vertical={phase:'climb',route:i,reverse,wait:0,targetX:n.x,targetY:n.y};n.dodgeTicks=0;n.shotTicks=0;return true;}
 }return false;
}
export function verticalStep(w:World,n:NL):boolean{
 if(n.verticalRest)n.verticalRest--;
 const v=n.vertical;if(!v)return false;
 if(!n.alive||n.stunTicks){v.phase='drop';v.targetX=n.x;v.targetY=n.y;}
 const b=n.belief,h=n.height??0;
 if(v.phase==='climb'){n.height=Math.min(3,h+.22);if(n.height===3)v.phase='traverse';}
 else if(v.phase==='traverse'){
  const r=CEILING_ROUTES[v.route],end=v.reverse?r.a:r.b,d=Math.hypot(end.x-n.x,end.y-n.y);
  if(d<.25){v.phase='perch';v.wait=0;}
  else{const from={x:n.x,y:n.y};n.x+=(end.x-n.x)/d*.24;n.y+=(end.y-n.y)/d*.24;collide(n,.45,w.propSolids,from);}
 }else if(v.phase==='perch'){
  v.wait++;
  if(b.valid&&b.age<8&&Math.hypot(n.x-b.x,n.y-b.y)<4&&los(n.x,n.y,b.x,b.y,w.propSolids)){
   v.targetX=b.x;v.targetY=b.y;v.phase='drop';n.armTicks=0;
   w.events.push({type:'clawArm',who:w.nls.indexOf(n)});
  }else if(v.wait>65){v.phase='drop';v.targetX=n.x;v.targetY=n.y;}
 }else{
  const from={x:n.x,y:n.y},d=Math.hypot(v.targetX-n.x,v.targetY-n.y);
  if(d>.1){n.x+=(v.targetX-n.x)/d*Math.min(.32,d);n.y+=(v.targetY-n.y)/d*Math.min(.32,d);collide(n,.45,w.propSolids,from);}
  n.height=Math.max(0,h-.3);
  if(n.height===0){n.vertical=undefined;n.verticalRest=65;n.recoveryTicks=4;}
 }
 n.noise= v.phase==='perch'?0:6;
 return true;
}
