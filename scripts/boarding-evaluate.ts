import {createOperation,getView,shareReports,resolve,type World} from '../src/strategy/engine';
import {boardingDecide,boardingPlan,boardingAction,decisionPlans} from '../src/strategy/boarding-agents';
import {MISSIONS,type MissionId} from '../src/strategy/tactics';
import type {ActorJSON} from '../src/policy';
import {writeFileSync,readFileSync} from 'node:fs';
export const HELD_OUT_RESIDUES=[5,8,11];
export const EVAL_SEEDS=[10001,10004,10007]; // modulo 12 = 5, 8, 11. No such configuration is used in training.
export function playerPlan(w:World,style:number){
 const v=getView(w,-1);const action=style===0?(w.turn<7?1:2):style===1?(w.turn<8?2:0):boardingAction(v);
 return boardingPlan(v,action);
}
export function evaluateBoarding(actor:ActorJSON){
 const rows:any[]=[];
 for(const mode of ['baseline','adaptive','ppo'])for(const mission of Object.keys(MISSIONS) as MissionId[])for(let style=0;style<3;style++)for(const seed of EVAL_SEEDS){
  const w=createOperation(seed,mission);let intent=[-1,-1];const cards=new Set<string>();
  while(!w.winner){const vs=[getView(w,0),getView(w,1)],ds=vs.map((v,i)=>boardingDecide(shareReports(v,vs[1-i]),intent[1-i],mode==='ppo'?actor:undefined,mode==='baseline'));const p=playerPlan(w,style);ds.forEach(d=>d.card&&cards.add(d.card));resolve(w,[...p.orders,...ds.flatMap(d=>d.orders)],ds,{...decisionPlans(ds),'-1':{card:p.card}});intent=ds.map(d=>d.action);}
  rows.push({mode,mission,seed,style,winner:w.winner,score:{...w.score},turns:w.history.length,survivors:w.units.filter(u=>u.side==='nightlords'&&u.hp>0).length,cards:[...cards],actions:[...new Set(w.history.flatMap(r=>r.decisions.map(d=>d.action)))]});
 }
 return {version:'boarding-v1',evaluatedAt:new Date().toISOString(),scenarios:27,training:actor.meta,separation:{trainingExcludedModulo12:HELD_OUT_RESIDUES,evaluationSeeds:EVAL_SEEDS,note:'Held-out door/hand/incident configuration combinations, three missions and three player scripts. Same initial positions and map.'},summary:['baseline','adaptive','ppo'].map(mode=>{const rs=rows.filter(r=>r.mode===mode);return {mode,matches:rs.length,wins:rs.filter(r=>r.winner==='nightlords').length,draws:rs.filter(r=>r.winner==='draw').length,meanEnemyScore:rs.reduce((s,r)=>s+r.score.nightlords,0)/rs.length,meanPlayerScore:rs.reduce((s,r)=>s+r.score.imperium,0)/rs.length,meanSurvivors:rs.reduce((s,r)=>s+r.survivors,0)/rs.length};}),rows};
}
if(process.argv[1]?.endsWith('boarding-evaluate.ts')){const actor=JSON.parse(readFileSync('policies/boarding-actor.json','utf8')),report=evaluateBoarding(actor);writeFileSync('docs/boarding/evaluation.json',JSON.stringify(report,null,2));writeFileSync('policies/boarding-evaluation.json',JSON.stringify(report));console.log(JSON.stringify(report.summary,null,2));}
