import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {newWorld,step,observe,angNorm} from '../src/sim';
import {griffeAction} from '../src/griffe';
import {PROP_KINDS} from '../src/props';
import {POOL,UNSEEN} from '../src/tactics';
import {forward,softmax,sample,type ActorJSON} from '../src/policy';
import {mulberry32} from '../src/rng';
const props=process.argv.includes('--props');const files=process.argv.slice(2).filter(x=>x!=='--props');
const count=Number(process.env.EVAL_SEEDS??30);
const report:any={props,description:'Held-out FPS combat scenarios, no Genestealers or bomb. Not human difficulty or full mission completion.',seeds:`910000..${910000+count-1}`,results:[]};
for(const file of files) for(const coordinated of [false,true]){
 const actor:ActorJSON=JSON.parse(readFileSync(file,'utf8'));
 for(const name of ['march','turret','brawler','backpedal','elite','kiter']){
  let wins=0,totalTicks=0,damage=0,rear=0,claws=0,surround=0,samples=0;
  for(let s=910000;s<910000+count;s++){
   const w=newWorld(s,undefined,{fps:true,clawWindup:true,propKinds:props?PROP_KINDS:[]}),rng=mulberry32(s^7421),tactic=(POOL[name]??UNSEEN[name])();
   while(!w.done){step(w,tactic(w),w.nls.map((n,i)=>n.alive?(coordinated?griffeAction(w,i,sample(softmax(forward(actor,observe(w,i))),rng)):sample(softmax(forward(actor,observe(w,i))),rng)):0));
    for(const e of w.events){if(e.type==='hit')damage+=e.dmg;if(e.type==='claw'){claws++;if(e.zone==='rear')rear++;}}
    const near=w.nls.filter(n=>n.alive&&Math.hypot(n.x-w.t.x,n.y-w.t.y)<7);
    if(near.some(a=>near.some(b=>Math.abs(angNorm(Math.atan2(a.y-w.t.y,a.x-w.t.x)-Math.atan2(b.y-w.t.y,b.x-w.t.x)))>2)))surround++;
    samples++;
   }
   wins+=Number(w.winner==='pack');totalTicks+=w.tick;
  }
  report.results.push({file,coordinated,tactic:name,episodes:count,packWins:wins,packWinRate:wins/count,meanSeconds:totalTicks/(count*10),meanDamage:damage/count,rearHitShare:rear/Math.max(1,claws),encirclementTickShare:surround/samples});
 }
}
mkdirSync('docs/mission',{recursive:true});writeFileSync(process.env.EVAL_OUTPUT??(props?'docs/mission/evaluation-props.json':'docs/mission/evaluation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
