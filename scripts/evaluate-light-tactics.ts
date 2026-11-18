import {newWorld,step,observe,T_IDLE,collide} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
import {griffeAction} from '../src/griffe';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {PROP_KINDS} from '../src/props';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const output=process.argv[2]??'docs/fps-light-tactics/after.json';
const actor=JSON.parse(readFileSync('policies/mission.json','utf8')),runs:any[]=[];
for(const mode of ['duel','mission'])for(const seed of [527,528,529,530,531,532]){
 const w=newWorld(seed,mode==='duel'?{x:4,y:12,facing:0}:undefined,{fps:true,eliteDuel:mode==='duel',mission:mode==='mission',propKinds:mode==='mission'?PROP_KINDS:[]}),rng=mulberry32(seed);
 if(mode==='duel')w.nls.forEach((n,i)=>{n.alive=i===0;n.x=11;n.y=12;n.facing=Math.PI;n.cd=10;});
 // Navigation witness only: high initial health and scheduled circuits keep all phases observable.
 w.t.hp=1000;const phases:any={},cpu:number[]=[];let penetration=0;
 for(let tick=0;tick<400;tick++){
  const phase=tick<100?'lit':tick<240?'dark':'restored';
  for(const c of w.lighting!.circuits){c.warningUntil=0;c.saboteur=-1;c.cooldownUntil=10000;c.blackoutUntil=phase==='dark'?240:0;}
  const ta={...T_IDLE,fwd:mode==='mission'&&tick<50?1:0,aimYaw:0};
  const start=performance.now(),acts=w.nls.map((n,i)=>mode==='duel'?eliteDuelAction(w,i):griffeAction(w,i,sample(softmax(forward(actor,observe(w,i))),rng)));
  step(w,ta,acts);cpu.push(performance.now()-start);
  const p=phases[phase]??={ranges:[],events:{},modes:{},closeTicks:0,agents:0};
  for(const e of w.events)p.events[e.type]=(p.events[e.type]??0)+1;
  for(const n of w.nls){if(!n.alive)continue;const d=Math.hypot(n.x-w.t.x,n.y-w.t.y),copy={x:n.x,y:n.y};collide(copy,.45,w.propSolids);penetration=Math.max(penetration,Math.hypot(copy.x-n.x,copy.y-n.y));
   if(tick%100>=30||phase==='dark'){p.ranges.push(d);p.agents++;if(d<3)p.closeTicks++;}
   const stance=(n as any).combatMode??'legacy';p.modes[stance]=(p.modes[stance]??0)+1;
  }
 }
 for(const p of Object.values(phases) as any[]){p.ranges.sort((a:number,b:number)=>a-b);p.medianRange=p.ranges[Math.floor(p.ranges.length/2)];p.minRange=p.ranges[0];p.closeFraction=p.closeTicks/p.agents;delete p.ranges;}
 cpu.sort((a,b)=>a-b);runs.push({mode,seed,phases,maxPenetration:penetration,cpuP95Ms:cpu[Math.floor(cpu.length*.95)]});
}
mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});
writeFileSync(output,JSON.stringify({fixture:true,description:'Navigation witness: 1000 initial player health, no fire, scheduled local circuits lit 0-10s, blackout 10-24s, lit 24-40s. Real policies and collision; not a normal playthrough.',runs},null,2));
console.log(JSON.stringify(runs.map(r=>({mode:r.mode,seed:r.seed,phases:r.phases,penetration:r.maxPenetration}))));
