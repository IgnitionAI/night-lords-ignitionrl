import {readFileSync,writeFileSync} from 'node:fs';
import {newWorld,observe,T_IDLE,los,angNorm} from '../src/sim';
import {newMission,missionStep,CORE,EXTRACTION} from '../src/mission';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {PROP_KINDS} from '../src/props';
import {griffeAction} from '../src/griffe';
const actor=JSON.parse(readFileSync('policies/mission.json','utf8'));
const results=[];
for(let seed=4200;seed<4230;seed++)for(const armed of [true,false]){
 const w=newWorld(seed,{x:3,y:12,facing:0},{fps:true,mission:true,clawWindup:true,propKinds:PROP_KINDS});const m=newMission(),rng=mulberry32(seed);
 const outbound=[[14,12],[14,8.8],[21,8.8],[21,12],[28,12],[28,6.8],[35,6.8],[35,12]];
 const waypoints=[...outbound,...outbound.slice(0,-1).reverse(),[3,12]],coreAt=outbound.length-1,exitAt=waypoints.length-1;let at=0,planted=false;
 while(!w.done&&w.tick<3000){
  if(m.phase==='escape'&&!planted){at=coreAt+1;planted=true;}
  const p=waypoints[at],d=Math.hypot(p[0]-w.t.x,p[1]-w.t.y);
  if(d<.6&&at!==coreAt&&at!==exitAt){at++;continue;}
  const enemies=[...w.nls.filter(n=>n.alive),...m.xenos.filter(g=>g.hp>0)].filter(n=>los(w.t.x,w.t.y,n.x,n.y,w.propSolids)).map(n=>({n,d:Math.hypot(n.x-w.t.x,n.y-w.t.y)})).sort((a,b)=>a.d-b.d);
  const target=armed?enemies.find(e=>e.d<11):undefined;
  const walk=Math.atan2(p[1]-w.t.y,p[0]-w.t.x),aim=target?Math.atan2(target.n.y-w.t.y,target.n.x-w.t.x):walk;
  const stopped=d<.6&&(at===coreAt||at===exitAt),delta=angNorm(walk-aim);
  const act={...T_IDLE,aimYaw:aim,aimPitch:target?Math.atan2(1.1-1.85,target.d):0,fwd:stopped?0:Math.cos(delta),strafe:stopped?0:Math.sin(delta),bolt:!!target&&target.d>2.2,fist:!!target&&target.d<2.8,reload:w.t.ammo===0};
  const actions=w.nls.map((n,i)=>n.alive?griffeAction(w,i,sample(softmax(forward(actor,observe(w,i))),rng)):0);
  missionStep(w,m,act,actions,stopped&&!target);
 }
 results.push({seed,armed,phase:m.phase,ticks:w.tick,position:[w.t.x,w.t.y],waypoint:at,hp:w.t.hp,cleared:m.cleared,planted,nightLords:w.nls.filter(n=>n.alive).length,xenos:m.xenos.filter(g=>g.hp>0).length});
}
writeFileSync('docs/mission/route-evaluation.json',JSON.stringify({description:'Deterministic route pilot, perfect enemy position knowledge and aiming. Integration/reachability proof, NOT human play or difficulty evidence. Armed and unarmed controls, 30 seeds each.',results},null,2));
for(const armed of [true,false]){const r=results.filter(x=>x.armed===armed);console.log({armed,extracted:r.filter(x=>x.phase==='extracted').length,planted:r.filter(x=>x.planted).length,lost:r.filter(x=>x.phase==='lost').length,timeout:r.filter(x=>x.ticks===3000).length});}
