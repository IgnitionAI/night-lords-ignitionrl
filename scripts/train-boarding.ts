import {PPO,DEFAULT_PPO} from '../src/ppo';
import {createOperation,getView,shareReports,resolve,distance,type View} from '../src/strategy/engine';
import {BOARD_OBS,BOARD_ACTIONS,BOARD_VERSION,boardingObservation,boardingPlan} from '../src/strategy/boarding-agents';
import type {MissionId} from '../src/strategy/tactics';
import {playerPlan,HELD_OUT_RESIDUES} from './boarding-evaluate';
import {sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const ppo=new PPO(BOARD_OBS,BOARD_ACTIONS,{...DEFAULT_PPO,hidden:[48,48],lr:.0006,epochs:4,minibatch:128},8341),rng=mulberry32(8341);
const initialHash=hash(JSON.stringify(ppo.exportActor(BOARD_VERSION).layers)),metrics:any[]=[],seeds:number[]=[];
const stages=[{name:'movement',updates:12,horizon:6},{name:'objectives',updates:18,horizon:12},{name:'combat',updates:60,horizon:18}];
let transitions=0,episodeIndex=0,nextSeed=1,updateIndex=0;
const nearest=(v:View,obj:number)=>v.units.reduce((s,u)=>s+distance(u,v.objectives[obj]),0);
for(const stage of stages)for(let update=0;update<stage.updates;update++){
 const obs:number[]=[],acts:number[]=[],lps:number[]=[],advantages:number[]=[],returns:number[]=[];let wins=0,totalReward=0;
 for(let episode=0;episode<6;episode++){
  while(HELD_OUT_RESIDUES.includes(nextSeed%12))nextSeed++;
  const seed=nextSeed++;seeds.push(seed);const mission=(['breach','blackout','recovery'] as MissionId[])[episodeIndex++%3],w=createOperation(seed,mission);
  const tracks:[any[],any[]]=[[],[]];let intent=[-1,-1];
  for(let turn=0;turn<stage.horizon&&!w.winner;turn++){
   const raw=[getView(w,0),getView(w,1)],views=raw.map((v,i)=>shareReports(v,raw[1-i])),oo=views.map((v,i)=>boardingObservation(v,intent[1-i]));
   const {probs,values}=ppo.act(Float32Array.from(oo.flat()),2),choices=[0,1].map(i=>sample(probs.slice(i*BOARD_ACTIONS,(i+1)*BOARD_ACTIONS),rng));
   const ps=views.map((v,i)=>boardingPlan(v,choices[i])),player=stage.name==='combat'?playerPlan(w,episode%3):{orders:[]};
   const oldScore=w.score.nightlords-w.score.imperium,ownHP=w.units.filter(u=>u.side==='nightlords').reduce((s,u)=>s+u.hp,0),enemyHP=w.units.filter(u=>u.side==='imperium').reduce((s,u)=>s+u.hp,0);
   const owned=w.objectives.filter(o=>o.owner==='nightlords').length;
   resolve(w,[...player.orders,...ps.flatMap(p=>p.orders)],[],{'-1':{card:player.card},'0':{card:ps[0].card},'1':{card:ps[1].card}});
   const scoreDelta=w.score.nightlords-w.score.imperium-oldScore,ownLoss=ownHP-w.units.filter(u=>u.side==='nightlords').reduce((s,u)=>s+u.hp,0),enemyLoss=enemyHP-w.units.filter(u=>u.side==='imperium').reduce((s,u)=>s+u.hp,0);
   const capture=w.objectives.filter(o=>o.owner==='nightlords').length-owned;
   let teamReward=stage.name==='movement'?0:.14*scoreDelta+.25*capture-.025*ownLoss;
   if(stage.name==='combat')teamReward+=.02*enemyLoss+(w.winner?(w.winner==='nightlords'?3:w.winner==='imperium'?-3:0):0);
   // Cooperation earns only when distinct assignments coincide with actual objective gains.
   if(choices[0]%3!==choices[1]%3&&scoreDelta>0)teamReward+=.04;
   for(let i=0;i<2;i++){
    const now=getView(w,i),progress=nearest(views[i],choices[i]%3)-nearest(now,choices[i]%3);
    const reward=teamReward+(stage.name==='movement'?.025*progress:stage.name==='objectives'?.008*progress:0)-.005;
    tracks[i].push({o:oo[i],a:choices[i],lp:Math.log(probs[i*BOARD_ACTIONS+choices[i]]+1e-8),v:values[i],r:reward});totalReward+=reward;
   }
   intent=choices;
  }
  if(w.winner==='nightlords')wins++;
  for(const track of tracks){let target=0;for(let i=track.length-1;i>=0;i--){const x=track[i];target=x.r+.97*target;obs.push(...x.o);acts.push(x.a);lps.push(x.lp);advantages.push(target-x.v);returns.push(target);}}
 }
 const stats=ppo.update(Float32Array.from(obs),Int32Array.from(acts),Float32Array.from(lps),Float32Array.from(advantages),Float32Array.from(returns));transitions+=acts.length;
 const row={update:++updateIndex,stage:stage.name,transitions,wins,episodes:6,meanTeamReturn:totalReward/12,...stats};metrics.push(row);if(update%5===0||update===stage.updates-1)console.log(JSON.stringify(row));
}
mkdirSync('runs/boarding',{recursive:true});
const meta={algorithm:'PPO-Clip: local MIT adaptation of IgnitionAI/ignition@52974ec in src/ppo.ts',stages,updates:updateIndex,episodes:episodeIndex,transitions,trainingSeeds:seeds,excludedConfigurations:HELD_OUT_RESIDUES,observations:BOARD_OBS,actions:BOARD_ACTIONS,gamma:.97,returns:'discounted Monte Carlo',reward:'movement: .025 objective progress; objectives: .14 score delta + .25 captures -.025 friendly HP loss + .008 progress; combat: same mission reward + .02 damage + terminal +/-3; .04 cooperation only on positive objective gains; -.005 time',initialActorHash:initialHash,rulesHash:hash(readFileSync('src/strategy/engine.ts','utf8')+readFileSync('src/strategy/tactics.ts','utf8')+readFileSync('src/strategy/boarding-agents.ts','utf8'))};
const actor=ppo.exportActor(BOARD_VERSION,meta);const finalHash=hash(JSON.stringify(actor.layers));if(initialHash===finalHash)throw Error('No learned weight change');
ppo.save('runs/boarding/full.json',meta);writeFileSync('policies/boarding-actor.json',JSON.stringify(actor));writeFileSync('docs/boarding/training.json',JSON.stringify({meta,finalActorHash:finalHash,metrics},null,2));console.log('TRAINING_COMPLETE',JSON.stringify({updates:updateIndex,transitions,episodes:episodeIndex,finalHash}));
