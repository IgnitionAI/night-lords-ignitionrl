import {observation as classicObservation,chooseAction,execute} from './agents';
import {distance,key,line,legalOrder,type View,type Order,type Decision} from './engine';
import {MISSIONS,orderCost,type CardId,type Plans} from './tactics';
import {forward,argmax,type ActorJSON} from '../policy';

export const LEGACY_BOARD_OBS=45, BOARD_ACTIONS=12, BOARD_VERSION='boarding-v2';
// v1 prefix + six signals per system + four radio postures + five local combat/incident signals.
export const BOARD_OBS=LEGACY_BOARD_OBS+3*6+4+5;
export const POSTURES=['progression','reconnaissance','pression coordonnée','défense'];
export function legacyBoardingObservation(v:View,ally=-1){
 const t=v.tactics;if(!t)throw Error('Tactical observation requires an operation');if(t.jammed)ally=-1;
 return [...classicObservation(v,ally),t.threat/28,t.noise/10,t.budget/7,
  ...(['crossfire','breach','cover','jam','decoy','sabotage'] as CardId[]).map(c=>Number(t.hand.includes(c))),
  Object.values(t.charges).reduce((s,n)=>s+n,0)/Math.max(1,v.units.length*2),t.suppressed.length/Math.max(1,v.units.length),Number(t.jammed),
  ...[0,1,2].map(i=>Number(t.incident.sector===i)),(t.incident.threshold-t.threat)/7,
  ...['breach','blackout','recovery'].map(m=>Number(t.mission===m)),Math.min(1,t.signals.length/3)];
}
export function boardingObservation(v:View, ally=-1):number[] {
 const t=v.tactics;
 if(!t)throw Error('Tactical observation requires an operation');
 const base=legacyBoardingObservation(v,ally);
 const size=Math.max(1,v.units.length);
 const mission=MISSIONS[t.mission];
 const visible=new Set(v.visible);
 const explored=new Set(v.explored);
 const systems=v.objectives.flatMap((o,i)=>{
  const adjacent=v.units.filter(u=>distance(u,o)<=1).length;
  // The v1 prefix already contains the shortest known route per system.
  // A unit on the system can interact even when path() returns no steps.
  const steps=adjacent?0:Math.round(base[7+4*i]*40);
  const turns=1+Math.ceil(Math.max(0,steps-1)/3);
  const value=mission.values[i]/3;
  const recentThreat=v.contacts.reduce((max,c)=>{
   const freshness=Math.max(0,1-(v.turn-c.seen)/4);
   return Math.max(max,freshness/(1+distance(c,o)/3));
  },0);
  return [value,Number(explored.has(key(o))),adjacent/size,
   steps<40 && o.owner!==v.side ? value/turns : 0,
   recentThreat,Number(t.signals.some(s=>s.sector===i))];
 });
 const localTargets=v.contacts.filter(c=>c.seen===v.turn && visible.has(key(c)));
 let maxShooters=0,weakestTarget=1;
 for(const c of localTargets){
  const shooters=v.units.filter(u=>distance(u,c)<=7 && line(u,c,v.doors)).length;
  if(shooters){
   maxShooters=Math.max(maxShooters,shooters);
   weakestTarget=Math.min(weakestTarget,c.hp/c.maxHp);
  }
 }
 const allyStance=t.jammed || ally<0 ? -1 : Math.floor(ally/3);
 const vent=t.incident.kind==='vent';
 const exposed=vent?v.units.filter(u=>distance(u,v.objectives[t.incident.sector])<=3).length:0;
 return [...base,...systems,...POSTURES.map((_,i)=>Number(allyStance===i)),
  Number(vent),exposed/size,maxShooters/size,1-weakestTarget,
  v.units.reduce((worst,u)=>Math.max(worst,1-u.hp/u.maxHp),0)];
}
export function boardingAction(v:View,ally=-1,actor?:ActorJSON){
 if(actor){
  const encode=actor.version==='boarding-v1'?legacyBoardingObservation:boardingObservation;
  return argmax(forward(actor,encode(v,ally)));
 }
 const target=chooseAction(v,v.tactics?.jammed?-1:ally)%3;
 if(v.units.some(u=>u.hp<4))return target+9;
 if(v.contacts.some(c=>c.seen===v.turn))return target+6;
 return target+(v.tactics?.signals.length||v.turn%4===0?3:0);
}
/** Shared mechanical executor for every controller. It sees only the camp's View. */
export function boardingPlan(v:View,action:number):{orders:Order[];card?:CardId}{
 const t=v.tactics;if(!t)return {orders:execute(v,action%6)};
 const target=action%3,stance=Math.floor(action/3),contacts=v.contacts.filter(c=>c.seen===v.turn&&v.visible.includes(key(c)));
 const preferred:CardId[]=stance===2?['crossfire','sabotage','breach']:stance===3?['cover','jam']:stance===1?['jam','decoy']:[];
 let card=preferred.find(c=>t.hand.includes(c));
 if(card==='crossfire'&&!contacts.length)card=undefined;
 if(card==='sabotage'&&!v.units.some(u=>v.objectives.some(o=>distance(u,o)<=1)))card=undefined;
 if(card==='breach'&&!v.units.some(u=>v.doors.some(d=>!d.open&&distance(u,d)<=1)))card=undefined;
 let left=t.budget-(card?1:0);
 const proposed=execute(v,target+(stance===1?3:0)).map(o=>({...o}));
 // Unit abilities are deterministic actions, not additional unobserved agent inputs.
 for(let i=0;i<proposed.length;i++){
  const u=v.units[i];if(t.charges[u.id]<=0)continue;
  if(u.id==='t2'){
   const hurt=v.units.filter(a=>a.hp<=5&&distance(u,a)<=1).sort((a,b)=>a.hp-b.hp)[0];
   if(hurt)proposed[i]={unit:u.id,kind:'special',target:{x:hurt.x,y:hurt.y}};
  }
  if(u.id==='t3'){
   const door=v.doors.find(d=>!d.open&&distance(u,d)<=3&&v.visible.includes(key(d)));
   if(door)proposed[i]={unit:u.id,kind:'special',target:{x:door.x,y:door.y}};
  }
  if(u.id==='t1'&&stance===3){const c=contacts.find(c=>distance(u,c)<=7&&line(u,c,v.doors));if(c)proposed[i]={unit:u.id,kind:'special',target:{x:c.x,y:c.y}};}
 }
 const rank=(o:Order)=>o.kind==='interact'?0:o.kind==='special'?1:o.kind==='fire'?2:o.kind==='move'?3:4;
 const selected=new Map<string,Order>();
 for(const o of proposed.sort((a,b)=>rank(a)-rank(b))){
  const valid=legalOrder(v,o)?o:{unit:o.unit,kind:'hold' as const};
  if(orderCost(valid)<=left){selected.set(o.unit,valid);left-=orderCost(valid);}else if(left>=1){selected.set(o.unit,{unit:o.unit,kind:'guard'});left--;}else selected.set(o.unit,{unit:o.unit,kind:'hold'});
 }
 if(stance===3)for(const u of [...v.units].sort((a,b)=>a.hp-b.hp))if(left>=1&&contacts.some(c=>distance(c,u)<=7)){
  const o=selected.get(u.id)!;o.reaction=true;left--;
 }
 return {orders:v.units.map(u=>selected.get(u.id)!),card};
}
export function boardingDecide(v:View,ally=-1,actor?:ActorJSON,baseline=false):Decision&{card?:CardId}{
 const action=baseline?(v.observer===0?0:2):boardingAction(v,ally,actor),plan=boardingPlan(v,action);
 return {commander:v.observer,action,objective:v.objectives[action%3].name,stance:POSTURES[Math.floor(action/3)],view:structuredClone(v),
  orders:plan.orders,card:plan.card,report:`${v.contacts.length} contact(s) connu(s) ; ${v.tactics?.budget} PC disponibles ; posture ${POSTURES[Math.floor(action/3)]}.`};
}
export function decisionPlans(ds:(Decision&{card?:CardId})[]):Plans{return Object.fromEntries(ds.map(d=>[d.commander,{card:d.card}]));}
