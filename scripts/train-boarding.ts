import {PPO,DEFAULT_PPO} from '../src/ppo';
import {createOperation,getView,shareReports,resolve,distance,type View} from '../src/strategy/engine';
import {BOARD_OBS,LEGACY_BOARD_OBS,BOARD_ACTIONS,BOARD_VERSION,boardingObservation,legacyBoardingObservation,boardingPlan} from '../src/strategy/boarding-agents';
import * as tf from '@tensorflow/tfjs-node';
import {layerSeed} from '../src/model';
import {playerPlan,HELD_OUT_RESIDUES,trainingScenario} from './boarding-scenarios';
import {sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {join} from 'node:path';
const hash=(x:string)=>createHash('sha256').update(x).digest('hex');
const {values:args}=parseArgs({options:{seed:{type:'string',default:'8341'},legacy:{type:'boolean',default:false},historical:{type:'boolean',default:false},resume:{type:'string'}}});
const trainingSeed=Number(args.seed);
if(!Number.isSafeInteger(trainingSeed)||trainingSeed<0)throw Error('Invalid training seed');
const width=args.legacy?LEGACY_BOARD_OBS:BOARD_OBS;
const version=args.legacy?'boarding-v1':BOARD_VERSION;
const encode=args.legacy?legacyBoardingObservation:boardingObservation;
if(args.historical && args.resume)throw Error('A continuation trains on complete operations');
const curriculum=args.resume?'continued':args.historical?'original':'crossed';
const out=join('runs/boarding',curriculum,version+'-'+trainingSeed);
const ppo=new PPO(width,BOARD_ACTIONS,{...DEFAULT_PPO,hidden:[48,48],lr:args.resume ? .0001 : .0006,epochs:4,minibatch:128},trainingSeed);
const rng=mulberry32(trainingSeed);
// Match the old actor and critic before the first update. New channels start
// neutral and acquire weights through exactly the same training curriculum.
if(args.resume){
 const saved=JSON.parse(readFileSync(args.resume,'utf8'));
 if(saved.obsDim!==LEGACY_BOARD_OBS || saved.nAct!==BOARD_ACTIONS)throw Error('Expected v1 checkpoint');
 for(const name of ['actor','critic'] as const){
  tf.tidy(()=>{
   const weights=saved[name].map((w:{data:number[];shape:number[]},index:number)=>{
    const tensor=tf.tensor(w.data,w.shape);
    return index===0 && !args.legacy?tensor.pad([[0,BOARD_OBS-LEGACY_BOARD_OBS],[0,0]]):tensor;
   });
   ppo[name].setWeights(weights);
  });
 }
}else if(!args.legacy)for(const [network,seed] of [[ppo.actor,trainingSeed],[ppo.critic,(trainingSeed^0x5bd1e995)>>>0]] as const){
 tf.tidy(()=>{
  const layer=network.layers[0];
  const oldKernel=tf.initializers.glorotNormal({seed:layerSeed(seed,0)}).apply([LEGACY_BOARD_OBS,48]);
  layer.setWeights([oldKernel.pad([[0,BOARD_OBS-LEGACY_BOARD_OBS],[0,0]]),layer.getWeights()[1]]);
 });
}
const initialHash=hash(JSON.stringify(ppo.exportActor(version).layers)),metrics:any[]=[],seeds:number[]=[];
const control=JSON.parse(readFileSync('docs/boarding/ppo-control-v1.json','utf8'));
const initialLayers=ppo.exportActor(version).layers;
initialLayers[0]={...initialLayers[0],inDim:LEGACY_BOARD_OBS,w:initialLayers[0].w.slice(0,LEGACY_BOARD_OBS*initialLayers[0].outDim)};
const sharedInitialHash=hash(JSON.stringify(initialLayers));
const expectedHash=args.resume?hash(JSON.stringify(control.layers)):control.meta.initialActorHash;
if((args.resume || trainingSeed===8341) && sharedInitialHash!==expectedHash)throw Error('Initial shared weights differ from the v1 control');
const stages=args.resume?[{name:'combat',updates:90,horizon:18}]:[{name:'movement',updates:12,horizon:6},{name:'objectives',updates:18,horizon:12},{name:'combat',updates:60,horizon:18}];
let transitions=0,episodeIndex=0,nextSeed=1,updateIndex=0;
const nearest=(v:View,obj:number)=>v.units.reduce((s,u)=>s+distance(u,v.objectives[obj]),0);
for(const stage of stages)for(let update=0;update<stage.updates;update++){
 const obs:number[]=[],acts:number[]=[],lps:number[]=[],advantages:number[]=[],returns:number[]=[];let wins=0,totalReward=0;
 for(let episode=0;episode<6;episode++){
  while(HELD_OUT_RESIDUES.includes(nextSeed%12))nextSeed++;
  const seed=nextSeed++;seeds.push(seed);
  const {mission,style}=trainingScenario(episodeIndex++,args.historical);
  const w=createOperation(seed,mission);
  const tracks:[any[],any[]]=[[],[]];let intent=[-1,-1];
  for(let turn=0;turn<stage.horizon&&!w.winner;turn++){
   const raw=[getView(w,0),getView(w,1)],views=raw.map((v,i)=>shareReports(v,raw[1-i])),oo=views.map((v,i)=>encode(v,intent[1-i]));
   const {probs,values}=ppo.act(Float32Array.from(oo.flat()),2),choices=[0,1].map(i=>sample(probs.slice(i*BOARD_ACTIONS,(i+1)*BOARD_ACTIONS),rng));
   const ps=views.map((v,i)=>boardingPlan(v,choices[i])),player=stage.name==='combat'?playerPlan(w,style):{orders:[]};
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
mkdirSync(out,{recursive:true});
const meta={curriculum,learningRate:ppo.cfg.lr,trainingSeed,sharedInitialHash,algorithm:'PPO-Clip: local MIT adaptation of IgnitionAI/ignition@52974ec in src/ppo.ts',stages,updates:updateIndex,episodes:episodeIndex,transitions,trainingSeeds:seeds,excludedConfigurations:HELD_OUT_RESIDUES,observations:width,actions:BOARD_ACTIONS,gamma:.97,returns:'discounted Monte Carlo',reward:'movement: .025 objective progress; objectives: .14 score delta + .25 captures -.025 friendly HP loss + .008 progress; combat: same mission reward + .02 damage + terminal +/-3; .04 cooperation only on positive objective gains; -.005 time',initialActorHash:initialHash,rulesHash:hash(readFileSync('src/strategy/engine.ts','utf8')+readFileSync('src/strategy/tactics.ts','utf8')+readFileSync('src/strategy/boarding-agents.ts','utf8'))};
const actor=ppo.exportActor(version,meta);const finalHash=hash(JSON.stringify(actor.layers));if(initialHash===finalHash)throw Error('No learned weight change');
ppo.save(join(out,'full.json'),meta);writeFileSync(join(out,'actor.json'),JSON.stringify(actor));writeFileSync(join(out,'training.json'),JSON.stringify({meta,finalActorHash:finalHash,metrics},null,2));console.log('TRAINING_COMPLETE',JSON.stringify({updates:updateIndex,transitions,episodes:episodeIndex,finalHash}));
