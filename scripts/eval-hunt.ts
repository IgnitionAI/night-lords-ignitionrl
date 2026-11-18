import {newWorld,step,observe,los,T_IDLE} from '../src/sim';
import {griffeAction,huntShelter} from '../src/griffe';
import {huntPhase} from '../src/hunt-rhythm';
import {PROP_KINDS} from '../src/props';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {readFileSync,writeFileSync} from 'node:fs';
const actor=JSON.parse(readFileSync('policies/mission.json','utf8')),results=[];
for(let seed=527;seed<533;seed++){
 const w=newWorld(seed,undefined,{mission:true,fps:true,propKinds:PROP_KINDS}),rng=mulberry32(seed);
 w.t.x=27;w.t.y=12;
 const phases:Record<string,any>={};
 for(let tick=0;tick<1160&&!w.done;tick++){
  const phase=huntPhase(w.tick),p=phases[phase]??={ticks:0,visible:0,near:0,shots:0,claws:0};p.ticks++;
  const ns=w.nls.filter(n=>n.alive);
  p.visible+=Number(ns.some(n=>los(n.x,n.y,w.t.x,w.t.y,w.propSolids)));
  p.near+=Number(ns.some(n=>Math.hypot(n.x-w.t.x,n.y-w.t.y)<4));
  step(w,T_IDLE,w.nls.map((n,i)=>griffeAction(w,i,sample(softmax(forward(actor,observe(w,i))),rng))));
  for(const e of w.events){p.shots+=Number(e.type==='enemyBolt');p.claws+=Number(e.type==='clawArm');}
 }
 results.push({agents:w.nls.map(n=>({x:n.x,y:n.y,b:n.belief,alive:n.alive,hp:n.hp,shelter:huntShelter(w,w.nls.indexOf(n)),action:n.lastAction,arm:n.armTicks,stun:n.stunTicks,next:griffeAction(w,w.nls.indexOf(n),1)})),seed,hp:w.t.hp,ticks:w.tick,phases});
}
writeFileSync('docs/mission/hunt-evaluation.json',JSON.stringify({description:'Stationary unarmed observer at central junction, all props, 116 seconds maximum. Visibility is geometric LOS, not player field of view. Scripted rhythm; unchanged PPO weights.',results},null,2));console.log(JSON.stringify(results));
