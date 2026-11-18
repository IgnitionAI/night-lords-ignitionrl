// Select on development configurations first, then measure the locked choices.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {runMatches,summarize,EVAL_SEEDS} from './boarding-evaluate';
import type {ActorJSON} from '../src/policy';
const versions=['boarding-v1','boarding-v2'] as const;
const trainingSeeds=[8341,8342,8343];
const historical=process.argv.includes('--historical');
const continued=process.argv.includes('--continued');
const curriculum=continued?'continued':historical?'original':'crossed';
const developmentSeeds=historical?[12000,12001,12010]:[0,1,2,3,4,6,7,9,10].map(r=>12000+r);
const developmentStyles=historical?[0,1,2]:[0,1,2,3,4,5];
const folder=(version:string,seed:number)=>`runs/boarding/${curriculum}/${version}-${seed}`;
const load=(version:string,seed:number):ActorJSON=>JSON.parse(readFileSync(folder(version,seed)+'/actor.json','utf8'));
const development=versions.flatMap(version=>trainingSeeds.map(seed=>{
 const actor=load(version,seed),rows=runMatches('ppo',actor,developmentSeeds,developmentStyles);
 const summary=summarize('ppo',rows);
 const missionWins=['breach','blackout','recovery'].map(m=>rows.filter(r=>r.mission===m&&r.winner==='nightlords').length);
 return {version,seed,worstMissionWins:Math.min(...missionWins),missionWins,wins:summary.wins,
  scoreMargin:summary.meanEnemyScore-summary.meanPlayerScore};
}));
const selected=versions.map(version=>development.filter(r=>r.version===version).sort((a,b)=>
 b.worstMissionWins-a.worstMissionWins || b.wins-a.wins || b.scoreMargin-a.scoreMargin || a.seed-b.seed)[0]);
console.log('Selected on development boards',selected);
const comparisons=trainingSeeds.map(seed=>{
 const old=load(versions[0],seed),fresh=load(versions[1],seed);
 for(const field of ['trainingSeed','sharedInitialHash','curriculum','learningRate','stages','updates','episodes','trainingSeeds','reward']){
  if(JSON.stringify(old.meta?.[field])!==JSON.stringify(fresh.meta?.[field]))throw Error('Unequal controls: '+field);
 }
 return {seed,paired:versions.map(version=>{
  const actor=load(version,seed);
  return {version,transitions:actor.meta!.transitions,
   ...summarize('ppo',runMatches('ppo',actor,EVAL_SEEDS,[0,1,2]))};
 })};
});
const opponents=continued?[9,10,11]:historical?[3,4,5]:[6,7,8];
const furtherTests=selected.map(({version,seed})=>({version,seed,
 ...summarize('ppo',runMatches('ppo',load(version,seed),EVAL_SEEDS,opponents))}));
const incumbent=JSON.parse(readFileSync('docs/boarding/ppo-control-v1.json','utf8'));
const incumbentExtra=summarize('control',runMatches('control',incumbent,EVAL_SEEDS,opponents));
const fresh=selected[1],candidate=folder(fresh.version,fresh.seed);

const result={curriculum,trainingSeeds,developmentSeeds,developmentStyles,incumbentExtra,selection:'worst mission wins, total wins, score margin, then smaller seed',
 development,selected,comparisons,furtherTests,extraOpponentStyles:opponents};
const resultPath=`docs/boarding/perception-${curriculum}.json`;
writeFileSync(resultPath,JSON.stringify(result,null,2));
if(!historical && process.argv.includes('--install')){
 copyFileSync(candidate+'/actor.json','policies/boarding-actor.json');
 copyFileSync(candidate+'/training.json','docs/boarding/training.json');
}
console.log(JSON.stringify(result,null,2));
