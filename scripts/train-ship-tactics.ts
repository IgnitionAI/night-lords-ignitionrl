import {shipOpponent as opponent} from '../src/ship-opponent';
import {PPO,DEFAULT_PPO} from '../src/ppo';
import {newWorld,step,T_IDLE,angNorm,type World} from '../src/sim';
import {tacticalObservation,TACTICAL_DIM,TACTICAL_ACTIONS} from '../src/tactical-observation';
import {griffeAction} from '../src/griffe';
import {sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {checkGuard} from '../src/guard';
import {mkdirSync,writeFileSync} from 'node:fs';
const updates=Number(process.env.TACTICAL_UPDATES??400);
const out='runs/ship-tactical-v2';mkdirSync(out,{recursive:true});
const ppo=new PPO(TACTICAL_DIM,TACTICAL_ACTIONS,{...DEFAULT_PPO,hidden:[32,32],lr:.001,epochs:4,minibatch:256},7441),rng=mulberry32(7441);
const spawn=[[22,20],[40,20],[60,32],[54,12]];
let serial=0;
function fresh(){const p=spawn[serial++%spawn.length];return newWorld(5000+serial,{x:p[0],y:p[1],facing:0},{mission:true,fps:true});}
const envs=Array.from({length:4},fresh);

const metrics=[];let transitions=0;
for(let update=1;update<=updates;update++){
 if(update%10===0)checkGuard('ship tactical '+update);
 const obs:number[]=[],acts:number[]=[],lp:number[]=[],adv:number[]=[],ret:number[]=[];
 for(let k=0;k<32;k++)for(let e=0;e<envs.length;e++){
  const w=envs[e],before=w.t.hp,alive=w.nls.map(n=>n.alive),hp=w.nls.map(n=>n.hp??0);
  const oo=w.nls.map((_,i)=>tacticalObservation(w,i)),{probs,values}=ppo.act(Float32Array.from(oo.flatMap(o=>Array.from(o))),4);
  const choices=oo.map((_,i)=>sample(probs.slice(i*6,i*6+6),rng));
  for(let t=0;t<8&&!w.done;t++)step(w,opponent(w,e),w.nls.map((n,i)=>griffeAction(w,i,Math.hypot(n.x-n.belief.x,n.y-n.belief.y)<1.7?7:1,choices[i])));
  const terminal=w.done||w.tick>=500||w.nls.every(n=>!n.alive);
  const next=ppo.act(Float32Array.from(w.nls.flatMap((_,i)=>Array.from(tacticalObservation(w,i)))),4).values;
  for(let i=0;i<4;i++)if(alive[i]){
   const n=w.nls[i],b=n.belief,flank=b.seen&&b.facing!==null&&Math.abs(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing))>1.4;
   const reward=(before-w.t.hp)*.18-(hp[i]-(n.hp??0))*.22+(!n.alive?-.8:0)+(flank?.015:0)-.005;
   const target=reward+(terminal||!n.alive?0:.97*next[i]);obs.push(...oo[i]);acts.push(choices[i]);lp.push(Math.log(probs[i*6+choices[i]]+1e-8));adv.push(target-values[i]);ret.push(target);
  }
  if(terminal)envs[e]=fresh();
 }
 const stats=ppo.update(Float32Array.from(obs),Int32Array.from(acts),Float32Array.from(lp),Float32Array.from(adv),Float32Array.from(ret));transitions+=acts.length;
 metrics.push({update,transitions,...stats});if(update%10===0)console.log(JSON.stringify(metrics.at(-1)));
}
ppo.save(out+'/full.json',{transitions,updates,algorithm:'Ignition-derived PPO; eight-tick tactical options; TD bootstrap',actions:6});
writeFileSync(out+'/actor.json',JSON.stringify(ppo.exportActor('ship-tactical-v2',{transitions,updates})));writeFileSync(out+'/metrics.json',JSON.stringify(metrics,null,2));
