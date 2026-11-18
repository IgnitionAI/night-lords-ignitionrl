import {shipOpponent} from '../src/ship-opponent';
import {newWorld,step,T_IDLE,type World} from '../src/sim';
import {tacticalObservation} from '../src/tactical-observation';
import {griffeAction,tacticalState} from '../src/griffe';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {readFileSync,writeFileSync} from 'node:fs';
const actor=JSON.parse(readFileSync(process.env.TACTICAL_ACTOR??'runs/ship-tactical/actor.json','utf8'));
function opponent(w:World,style:number){
 const visible=w.nls.filter(n=>n.alive&&Math.hypot(n.x-w.t.x,n.y-w.t.y)<16);
 visible.sort((a,b)=>Math.hypot(a.x-w.t.x,a.y-w.t.y)-Math.hypot(b.x-w.t.x,b.y-w.t.y));
 const n=visible[0],yaw=n?Math.atan2(n.y-w.t.y,n.x-w.t.x):w.t.facing+.1;
 return {...T_IDLE,aimYaw:yaw,aimPitch:n?Math.atan2((n.height??0)+1.6-2.1788,Math.hypot(n.x-w.t.x,n.y-w.t.y)):0,bolt:!!n&&style!==3,fist:!!n&&Math.hypot(n.x-w.t.x,n.y-w.t.y)<2.4,fwd:style===1?-.5:style===2?.6:0};
}
const rows=[];
for(const learned of [false,true])for(let seed=900001;seed<=900012;seed++)for(let style=0;style<3;style++){
 const spots=[[22,20],[40,20],[60,32],[54,12]],p=spots[seed%4],w=newWorld(seed,{x:p[0],y:p[1],facing:0},{mission:true,fps:true}),rng=mulberry32(seed);
 let choices=[0,0,0,0],dodge=0,vertical=0,search=0,contacts=0;
 for(let tick=0;tick<500&&!w.done&&w.nls.some(n=>n.alive);tick++){
  if(tick%8===0&&learned)choices=w.nls.map((_,i)=>sample(softmax(forward(actor,Array.from(tacticalObservation(w,i)))),rng));
  const acts=w.nls.map((n,i)=>griffeAction(w,i,Math.hypot(n.x-n.belief.x,n.y-n.belief.y)<1.7?7:1,learned?choices[i]:undefined));
  step(w,process.env.REACTION_PLAYER?shipOpponent(w,style):opponent(w,style),acts);
  dodge+=w.nls.filter(n=>n.alive&&n.dodgeTicks).length;vertical+=w.nls.filter(n=>n.alive&&n.vertical).length;search+=w.nls.filter((n,i)=>n.alive&&tacticalState(w,i)?.mode==='search').length;contacts+=w.events.filter(e=>e.type==='claw'||e.type==='enemyBolt').length;
 }
 rows.push({learned,seed,style,damage:30-w.t.hp,survivors:w.nls.filter(n=>n.alive).length,win:w.winner==='pack',dodge,vertical,search,contacts});
}
const summary=[false,true].map(learned=>{const r=rows.filter(x=>x.learned===learned);return {learned,episodes:r.length,wins:r.filter(x=>x.win).length,...Object.fromEntries(['damage','survivors','dodge','vertical','search','contacts'].map(key=>[key,r.reduce((sum,x)=>sum+(x as any)[key],0)/r.length]))};});
writeFileSync(process.env.TACTICAL_REPORT??'docs/mission/tactical-comparison.json',JSON.stringify({scope:'Held-out combat encounters; not full mission or human difficulty',summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
