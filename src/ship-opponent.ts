import {T_IDLE,angNorm,los,type World} from './sim';
const memory=new WeakMap<World,{yaw:number;pitch:number;fire:boolean;target:number;next:number}>();
/** Evaluation player: bounded view, reaction delay and angular speed; not a model of human skill. */
export function shipOpponent(w:World,style:number){
 let m=memory.get(w);if(!m){m={yaw:w.t.facing,pitch:0,fire:false,target:-1,next:0};memory.set(w,m);}
 if(w.tick>=m.next){
  const seen=w.nls.map((n,i)=>({n,i,d:Math.hypot(n.x-w.t.x,n.y-w.t.y)})).filter(({n,d})=>n.alive&&d<16&&Math.abs(angNorm(Math.atan2(n.y-w.t.y,n.x-w.t.x)-w.t.facing))<1.25&&los(n.x,n.y,w.t.x,w.t.y,w.propSolids)).sort((a,b)=>a.d-b.d);
  const hit=seen[0];m.fire=!!hit;m.target=hit?.i??-1;
  if(hit){m.yaw=Math.atan2(hit.n.y-w.t.y,hit.n.x-w.t.x);m.pitch=Math.atan2((hit.n.height??0)+1.6-2.1788,hit.d);}
  else m.yaw=w.t.facing+.5;m.next=w.tick+3;
 }
 const turn=Math.max(-.25,Math.min(.25,angNorm(m.yaw-w.t.facing))),n=w.nls[m.target];
 return {...T_IDLE,aimYaw:w.t.facing+turn,aimPitch:m.pitch,bolt:m.fire&&Math.abs(turn)<.15,fist:!!n&&n.alive&&Math.hypot(n.x-w.t.x,n.y-w.t.y)<2.1,fwd:style===1?-.45:style===2?.65:0};
}
