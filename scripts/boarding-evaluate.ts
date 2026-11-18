import {createOperation,getView,shareReports,resolve,type Side} from '../src/strategy/engine';
import {boardingDecide,boardingAction,decisionPlans,legacyBoardingObservation,LEGACY_BOARD_OBS} from '../src/strategy/boarding-agents';
import {MISSIONS,type MissionId} from '../src/strategy/tactics';
import {argmax,forward,type ActorJSON} from '../src/policy';
import {writeFileSync,readFileSync} from 'node:fs';
import {playerPlan,EVAL_SEEDS,HELD_OUT_RESIDUES} from './boarding-scenarios';
export {playerPlan,EVAL_SEEDS,HELD_OUT_RESIDUES} from './boarding-scenarios';
type Mode='baseline'|'adaptive'|'ppo'|'control';
type Result={
 mode:Mode;mission:MissionId;seed:number;style:number;winner:Side|'draw';score:Record<Side,number>;
 turns:number;survivors:number;cards:string[];actions:number[];
};
const modes:Mode[]=['baseline','adaptive','ppo'];
export function summarize(mode:Mode,rows:Result[]){
 const rs=rows.filter(r=>r.mode===mode);
 return {mode,matches:rs.length,wins:rs.filter(r=>r.winner==='nightlords').length,
  draws:rs.filter(r=>r.winner==='draw').length,meanEnemyScore:rs.reduce((s,r)=>s+r.score.nightlords,0)/rs.length,
  meanPlayerScore:rs.reduce((s,r)=>s+r.score.imperium,0)/rs.length,meanSurvivors:rs.reduce((s,r)=>s+r.survivors,0)/rs.length};
}
export function runMatches(mode:Mode,policy:ActorJSON|undefined,seeds:readonly number[],styles:readonly number[],
 compare?:(view:ReturnType<typeof getView>,ally:number,action:number)=>void){
 const rows:Result[]=[];
 for(const mission of Object.keys(MISSIONS) as MissionId[])for(const style of styles)for(const seed of seeds){
  const w=createOperation(seed,mission);
  let intent=[-1,-1];
  const cards=new Set<string>();
  while(!w.winner){
   const vs=[getView(w,0),getView(w,1)];
   const ds=vs.map((v,i)=>{
    const view=shareReports(v,vs[1-i]),ally=intent[1-i];
    const decision=boardingDecide(view,ally,policy,mode==='baseline');
    compare?.(view,ally,decision.action);
    return decision;
   });
   const p=playerPlan(w,style);
   ds.forEach(d=>d.card&&cards.add(d.card));
   resolve(w,[...p.orders,...ds.flatMap(d=>d.orders)],ds,{...decisionPlans(ds),'-1':{card:p.card}});
   intent=ds.map(d=>d.action);
  }
  rows.push({mode,mission,seed,style,winner:w.winner,score:{...w.score},turns:w.history.length,
   survivors:w.units.filter(u=>u.side==='nightlords'&&u.hp>0).length,cards:[...cards],
   actions:[...new Set(w.history.flatMap(r=>r.decisions.map(d=>d.action)))]});
 }
 return rows;
}
export function evaluateBoarding(actor:ActorJSON,control?:ActorJSON){
 const decisions={compared:0,changedObjective:0,changedPosture:0};
 const masked={compared:0,changedObjective:0,changedPosture:0};
 const rows=modes.flatMap(mode=>runMatches(mode,mode==='ppo'?actor:undefined,EVAL_SEEDS,[0,1,2],
  mode==='ppo' && control ? (view,ally,action)=>{
   const previous=boardingAction(view,ally,control);
   decisions.compared++;
   decisions.changedObjective+=Number(previous%3!==action%3);
   decisions.changedPosture+=Number(Math.floor(previous/3)!==Math.floor(action/3));
   // Same learned weights and same observed state, with only the added channels muted.
   // This is an inference sensitivity check, separate from matched retraining.
   const prefix=legacyBoardingObservation(view,ally);
   const ablated=argmax(forward(actor,[...prefix,...Array(actor.obsDim-LEGACY_BOARD_OBS).fill(0)]));
   masked.compared++;
   masked.changedObjective+=Number(ablated%3!==action%3);
   masked.changedPosture+=Number(Math.floor(ablated/3)!==Math.floor(action/3));
  }:undefined));
 const controlRows=control?runMatches('control',control,EVAL_SEEDS,[0,1,2]):[];
 return {version:actor.version,evaluatedAt:new Date().toISOString(),scenarios:EVAL_SEEDS.length*Object.keys(MISSIONS).length*3,
  training:actor.meta,separation:{trainingExcludedModulo12:HELD_OUT_RESIDUES,evaluationSeeds:EVAL_SEEDS,
   note:'Held-out door/hand/incident configuration combinations, three missions and three player scripts. Same initial positions and map.'},
  summary:modes.map(mode=>summarize(mode,rows)),rows,
  ...(control?{observationComparison:{controlVersion:control.version,controlTraining:control.meta,controlRows,
   controlSummary:summarize('control',controlRows),decisionsOnNewPolicyTrajectory:decisions,maskedExtraChannels:masked}}:{})};
}
if(process.argv[1]?.endsWith('boarding-evaluate.ts')){
 const readActor=(path:string):ActorJSON=>JSON.parse(readFileSync(path,'utf8'));
 const report=evaluateBoarding(readActor('policies/boarding-actor.json'),readActor('docs/boarding/ppo-control-v1.json'));
 writeFileSync('docs/boarding/evaluation.json',JSON.stringify(report,null,2));
 // The in-game debrief displays the current three selectable controllers.
 const {observationComparison,...debrief}=report;
 writeFileSync('policies/boarding-evaluation.json',JSON.stringify(debrief));
 console.log(JSON.stringify([...report.summary,observationComparison!.controlSummary],null,2));
 console.log(observationComparison!.decisionsOnNewPolicyTrajectory);
}
