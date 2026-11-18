import {test,expect} from 'bun:test';
import {createOperation,getView,resolve,observeAll,shareReports,legalOrder,type Order} from '../src/strategy/engine';
import {MISSIONS,planCost,EXTRACTION} from '../src/strategy/tactics';
import {boardingDecide,boardingPlan,boardingObservation,legacyBoardingObservation,BOARD_OBS,BOARD_VERSION,decisionPlans} from '../src/strategy/boarding-agents';
import {trainingScenario,HELD_OUT_RESIDUES} from '../scripts/boarding-scenarios';
test('each permitted board sees all nine mission/opponent combinations in a training block',()=>{
 const byBoard=new Map<number,Set<string>>();
 let episode=0;
 for(let seed=1;episode<81;seed++){
  if(HELD_OUT_RESIDUES.includes(seed%12))continue;
  const {mission,style}=trainingScenario(episode++);
  const combinations=byBoard.get(seed%12)??new Set<string>();
  combinations.add(mission+'-'+style);
  byBoard.set(seed%12,combinations);
 }
 expect(byBoard.size).toBe(9);
 for(const pairs of byBoard.values())expect(pairs.size).toBe(9);
});
function duel(){const w=createOperation(17);Object.assign(w.units[0],{x:9,y:10});Object.assign(w.units[1],{x:9,y:9});Object.assign(w.units[4],{x:12,y:10});Object.assign(w.units[5],{x:12,y:9});observeAll(w);return w;}
test('PPO distinguishes public incidents, echo sectors and the ally posture',()=>{
 const v=getView(duel(),0);
 const compare=(b:typeof v,ally=-1,otherAlly=ally)=>{
  expect(legacyBoardingObservation(v,ally)).toEqual(legacyBoardingObservation(b,otherAlly));
  expect(boardingObservation(v,ally)).not.toEqual(boardingObservation(b,otherAlly));
 };
 const locked=structuredClone(v);locked.tactics!.incident.kind='lockdown';compare(locked);
 v.tactics!.signals=[{sector:0,until:v.turn+1}];
 const echo=structuredClone(v);echo.tactics!.signals[0].sector=2;compare(echo);
 compare(v,0,9);
 v.tactics!.jammed=true;
 expect(boardingObservation(v,0)).toEqual(boardingObservation(v,9));
});
test('PPO distinguishes an exposed weakened target without treating a radio report as a shot',()=>{
 const v=getView(duel(),0);
 const hurt=structuredClone(v);hurt.contacts[0].hp=1;
 expect(legacyBoardingObservation(v)).toEqual(legacyBoardingObservation(hurt));
 expect(boardingObservation(v)).not.toEqual(boardingObservation(hurt));
 v.visible=[];hurt.visible=[];
 expect(boardingObservation(v)).toEqual(boardingObservation(hurt));
 const local=getView(createOperation(17),1);
 expect(shareReports(local,hurt).contacts.length).toBeGreaterThan(local.contacts.length);
 local.tactics!.jammed=true;
 expect(boardingObservation(shareReports(local,hurt),2)).toEqual(boardingObservation(local));
});
test('shared budget includes card and reservations, absent orders do not guard',()=>{const w=duel();w.tactics!.hands['-1']=['cover'];const r=resolve(w,w.units.filter(u=>u.side==='imperium').map(u=>({unit:u.id,kind:'guard',reaction:true})),[],{'-1':{card:'cover'}});expect(w.tactics!.spent['-1']).toBe(5);expect(r.orders.filter(o=>o.unit.startsWith('t')).map(o=>o.kind)).toEqual(['guard','guard','hold','hold']);expect(w.tactics!.hands['-1']).toEqual([]);});
test('cover and reserve reduce real impacts; reservation applies once',()=>{const w=duel();w.tactics!.hands['-1']=['cover'];resolve(w,[{unit:'t0',kind:'hold',reaction:true},{unit:'n0',kind:'fire',target:{x:9,y:10}},{unit:'n1',kind:'fire',target:{x:9,y:10}}],[],{'-1':{card:'cover'}});expect(w.units[0].hp).toBe(8);expect(w.tactics!.reserves).not.toContain('t0');});
test('crossfire needs matching shots and can be countered by simultaneous movement',()=>{for(const dodge of [false,true]){const w=duel();w.tactics!.hands['-1']=['crossfire'];resolve(w,[{unit:'t0',kind:'fire',target:{x:12,y:10}},{unit:'t1',kind:'fire',target:{x:12,y:10}},...(dodge?[{unit:'n0',kind:'move',target:{x:12,y:12}} as Order]:[])],[],{'-1':{card:'crossfire'}});expect(w.units[4].hp).toBe(dodge?7:0);}});
test('Vael rally has two charges and next-turn command bonus only',()=>{const w=createOperation();resolve(w,[{unit:'t0',kind:'special'}]);expect(w.tactics!.budgets['-1']).toBe(7);expect(w.tactics!.charges.t0).toBe(1);resolve(w,[]);expect(w.tactics!.budgets['-1']).toBe(6);resolve(w,[{unit:'t0',kind:'special'}]);expect(legalOrder(getView(w,-1),{unit:'t0',kind:'special'})).toBe(false);});
test('Cael saves a critical brother only once and Brann opens a visible distant door',()=>{const w=createOperation();Object.assign(w.units[0],{x:2,y:11,hp:4});Object.assign(w.units[2],{x:3,y:11});Object.assign(w.units[3],{x:5,y:10});w.doors[0].open=false;observeAll(w);resolve(w,[{unit:'t2',kind:'special',target:{x:2,y:11}},{unit:'t3',kind:'special',target:{x:7,y:10}}]);expect(w.units[0].hp).toBe(7);expect(w.score.imperium).toBe(3);expect(w.tactics!.rescued).toBe(true);expect(w.doors[0].open).toBe(true);});
test('suppressive fire blocks next-turn movement, then expires',()=>{const w=duel();resolve(w,[{unit:'t1',kind:'special',target:{x:12,y:10}}]);expect(w.units[4].hp).toBe(5);expect(legalOrder(getView(w,0),{unit:'n0',kind:'move',target:{x:13,y:10}})).toBe(false);resolve(w,[]);expect(legalOrder(getView(w,0),{unit:'n0',kind:'move',target:{x:13,y:10}})).toBe(true);});
test('jamming cuts visibility and reports, decoy never creates an enemy contact',()=>{const w=createOperation();w.tactics!.hands['-1']=['jam'];w.tactics!.hands['0']=['decoy'];const visible=getView(w,0).visible.length;resolve(w,[],[],{'-1':{card:'jam'},'0':{card:'decoy'}});const a=getView(w,0),b=getView(w,1);b.contacts=[{...w.units[0],seen:w.turn}];expect(a.visible.length).toBeLessThan(visible);expect(shareReports(a,b).contacts).toEqual(a.contacts);expect(boardingObservation(a,2)).toEqual(boardingObservation(a,-1));expect(getView(w,-1).tactics!.signals).toHaveLength(1);expect(getView(w,-1).contacts).toHaveLength(0);});
test('cards refill slowly and sabotage cancels only the adjacent system scoring',()=>{const w=createOperation(28,'blackout');w.turn=4;w.objectives[1].owner='imperium';Object.assign(w.units[4],{x:14,y:10});w.tactics!.hands['0']=['sabotage'];observeAll(w);resolve(w,[],[],{'0':{card:'sabotage'}});expect(w.score.imperium).toBe(0);expect(w.tactics!.hands['0']).toHaveLength(1);resolve(w,[]);expect(w.score.imperium).toBe(3);expect(w.tactics!.hands['0']).toHaveLength(1);});
test('incident is announced, pressure responds to noise, hidden casualties stay hidden',()=>{const w=createOperation(17);w.tactics!.threat=6;const sector=w.tactics!.incident.sector;Object.assign(w.units[4],{...w.objectives[sector],hp:1,id:'n0',name:'VRAK'});const forecast={...getView(w,-1).tactics!.incident};const r=resolve(w,[]);expect(forecast.kind).toBe('vent');expect(w.units[4].hp).toBe(0);expect(r.playerEvents.join(' ')).not.toContain('VRAK');expect(w.tactics!.incident.threshold).toBe(14);const noisy=duel();resolve(noisy,[{unit:'t0',kind:'fire',target:{x:12,y:10}},{unit:'t1',kind:'fire',target:{x:12,y:10}},{unit:'n0',kind:'fire',target:{x:9,y:10}}]);expect(noisy.tactics!.noise).toBe(3);expect(noisy.tactics!.threat).toBe(2);});
test('archive payload can be extracted only by living carrier, once',()=>{const w=createOperation();Object.assign(w.units[0],{x:11,y:17});observeAll(w);resolve(w,[{unit:'t0',kind:'interact',target:{x:11,y:17}}]);expect(w.tactics!.cargo).toBe('t0');Object.assign(w.units[0],EXTRACTION);observeAll(w);resolve(w,[{unit:'t0',kind:'interact',target:EXTRACTION}]);expect(w.tactics!.recovered).toBe(true);expect(w.tactics!.cargo).toBeNull();expect(w.score.imperium).toBe(6);expect(legalOrder(getView(w,-1),{unit:'t0',kind:'interact',target:EXTRACTION})).toBe(false);});
test('hidden positions, charges and hands cannot affect learned observation',()=>{const a=createOperation(),b=createOperation();b.units[0].y=12;b.tactics!.hands['-1']=[];b.tactics!.charges.t0=0;observeAll(b);expect(boardingObservation(getView(a,0))).toEqual(boardingObservation(getView(b,0)));expect(boardingObservation(getView(a,0))).toHaveLength(BOARD_OBS);expect(JSON.stringify(getView(a,0))).not.toContain('t0');});
test('every posture respects budgets and completes each mission without overlap',()=>{for(const mission of Object.keys(MISSIONS) as (keyof typeof MISSIONS)[]){const w=createOperation(28,mission);while(!w.winner){const p=boardingPlan(getView(w,-1),w.turn%12);const vs=[getView(w,0),getView(w,1)],ds=vs.map((v,i)=>boardingDecide(shareReports(v,vs[1-i])));for(const d of ds)expect(planCost(d.orders,d.card)).toBeLessThanOrEqual(d.view.tactics!.budget);expect(planCost(p.orders,p.card)).toBeLessThanOrEqual(getView(w,-1).tactics!.budget);resolve(w,[...p.orders,...ds.flatMap(d=>d.orders)],ds,{...decisionPlans(ds),'-1':{card:p.card}});const alive=w.units.filter(u=>u.hp>0);expect(new Set(alive.map(u=>`${u.x},${u.y}`)).size).toBe(alive.length);}expect(w.history.length).toBeLessThanOrEqual(18);}});
test('delivered learned policy matches these rules and excludes held-out configurations',()=>{
 const {readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
 const actor=JSON.parse(readFileSync('policies/boarding-actor.json','utf8')),report=JSON.parse(readFileSync('docs/boarding/training.json','utf8'));
 const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
 expect(actor.obsDim).toBe(BOARD_OBS);expect(actor.nAct).toBe(12);expect(actor.version).toBe(BOARD_VERSION);
 expect(actor.layers.every((l:any)=>l.w.length===l.inDim*l.outDim&&l.b.length===l.outDim&&[...l.w,...l.b].every(Number.isFinite))).toBe(true);
 expect(digest(JSON.stringify(actor.layers))).toBe(report.finalActorHash);expect(report.meta.initialActorHash).not.toBe(report.finalActorHash);
 expect(report.meta.rulesHash).toBe(digest(['src/strategy/engine.ts','src/strategy/tactics.ts','src/strategy/boarding-agents.ts'].map(p=>readFileSync(p,'utf8')).join('')));
 expect(report.meta.trainingSeeds.some((seed:number)=>[5,8,11].includes(seed%12))).toBe(false);
 expect(report.metrics).toHaveLength(90);expect(report.meta.transitions).toBeGreaterThan(15000);
 const evaluation=JSON.parse(readFileSync('policies/boarding-evaluation.json','utf8'));expect(evaluation.rows).toHaveLength(81);
 for(const row of evaluation.rows)expect([5,8,11]).toContain(row.seed%12);
});
