import {newWorld,step,observe,T_IDLE,angNorm,collide} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
import {griffeAction} from '../src/griffe';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {PROP_KINDS} from '../src/props';
import {readFileSync,writeFileSync} from 'node:fs';
const actor=JSON.parse(readFileSync('policies/mission.json','utf8')),runs:any[]=[];
for(const mode of ['duel','mission'])for(const style of ['observer','defender'])for(const seed of [527,528,529,530,531,532]){
 const w=newWorld(seed,mode==='duel'?{x:4,y:12,facing:0}:undefined,{fps:true,eliteDuel:mode==='duel',mission:mode==='mission',propKinds:mode==='mission'?PROP_KINDS:[]}),rng=mulberry32(seed);
 if(mode==='duel')w.nls.forEach((n,i)=>{n.alive=i===0;n.x=11;n.y=12;n.facing=Math.PI;n.cd=10;});
 const events:Record<string,number>={},cpu:number[]=[],stuck=[0,0,0,0];let longestStuck=0,penetration=0,yaw=0;
 for(let tick=0;tick<600&&!w.done;tick++){
  const ns=w.nls.filter(n=>n.alive).sort((a,b)=>Math.hypot(a.x-w.t.x,a.y-w.t.y)-Math.hypot(b.x-w.t.x,b.y-w.t.y)),n=ns[0],d=n?Math.hypot(n.x-w.t.x,n.y-w.t.y):99;
  if(n&&(mode==='duel'||tick>50))yaw+=Math.max(-.25,Math.min(.25,angNorm(Math.atan2(n.y-w.t.y,n.x-w.t.x)-yaw)));
  const ta={...T_IDLE,aimYaw:yaw,aimPitch:-.06,fwd:mode==='mission'&&tick<50?1:style==='defender'&&d<3?-1:0,strafe:style==='defender'&&tick>50&&d<7?(Math.floor(tick/30)%2?1:-1):0,bolt:style==='defender'&&tick>90};
  const before=w.nls.map(n=>({x:n.x,y:n.y})),start=performance.now();
  const acts=w.nls.map((n,i)=>mode==='duel'?eliteDuelAction(w,i):griffeAction(w,i,sample(softmax(forward(actor,observe(w,i))),rng)));
  step(w,ta,acts);cpu.push(performance.now()-start);
  for(const e of w.events)events[e.type]=(events[e.type]??0)+1;
  w.nls.forEach((n,i)=>{if(!n.alive)return;const p={x:n.x,y:n.y};collide(p,.45,w.propSolids);penetration=Math.max(penetration,Math.hypot(p.x-n.x,p.y-n.y));
   const trying=acts[i]>0&&acts[i]<7&&!n.armTicks&&!n.shotTicks&&!n.recoveryTicks&&!n.vertical;
   stuck[i]=trying&&Math.hypot(n.x-before[i].x,n.y-before[i].y)<.025?stuck[i]+1:0;longestStuck=Math.max(longestStuck,stuck[i]);});
 }
 cpu.sort((a,b)=>a-b);runs.push({mode,style,seed,ticks:w.tick,hp:w.t.hp,alive:w.nls.filter(n=>n.alive).length,events,longestStuckSeconds:longestStuck*.1,maxPenetration:penetration,cpuMedianMs:cpu[Math.floor(cpu.length*.5)],cpuP95Ms:cpu[Math.floor(cpu.length*.95)]});
}
writeFileSync(process.argv[2]??'docs/fps-hunt/evaluation.json',JSON.stringify({fixture:true,description:'Fixed seeds, normal simulation and policies; scripted observer/defender inputs, not human play.',runs},null,2));
console.log(JSON.stringify(runs.map(({mode,style,seed,ticks,hp,longestStuckSeconds,events})=>({mode,style,seed,ticks,hp,longestStuckSeconds,cuts:events.lightsOut??0,restored:events.lightsRestored??0}))));
