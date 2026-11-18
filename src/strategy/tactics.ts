import type {World,View,Unit,Order,Pos,Side} from './engine';

export type MissionId='breach'|'blackout'|'recovery';
export type CardId='crossfire'|'breach'|'cover'|'jam'|'decoy'|'sabotage';
export type Plans=Record<string,{card?:CardId}>;
export const MISSIONS={
  breach:{name:'Brèche du pont VII',brief:'Prenez les archives ; rapportez leurs données au sas pour 6 points supplémentaires.',values:[1,1,2],target:24,turns:18},
  blackout:{name:'Sous tension',brief:'L’alimentation vaut 3 points par tour. Le relais assure la vision ; les archives offrent une autre voie.',values:[1,3,1],target:27,turns:18},
  recovery:{name:'Mémoire du Noctis',brief:'Le relais vaut 2 points, les archives 1. Rapportez les données et stabilisez un frère gravement blessé.',values:[2,1,1],target:24,turns:18},
} as const;
export const CARDS:Record<CardId,{name:string;description:string}>={
  crossfire:{name:'Tir croisé',description:'Deux tirs alliés sur la même case : +1 dégât par tir. Une cible peut encore se déplacer.'},
  breach:{name:'Brèche',description:'Ouvre les portes fermées adjacentes à votre groupe avant les déplacements. +2 bruit.'},
  cover:{name:'Couverture',description:'Réduit de 1 chaque impact reçu ce tour. Cumulable avec une réserve défensive.'},
  jam:{name:'Brouillage',description:'Pendant le prochain tour : vision ennemie −2 et échanges de contacts interrompus.'},
  decoy:{name:'Leurre',description:'Émet un écho incertain dans un secteur. Une reconnaissance permet de le dissiper.'},
  sabotage:{name:'Sabotage',description:'Chaque système au contact de votre groupe ne rapporte aucun point ce tour.'},
};
export const ROLES:Record<string,{name:string;ability:string;description:string;target:boolean}>={
  t0:{name:'Commandant',ability:'Ralliement',description:'2 PC · réduit de 2 le bruit de ce tour ; +1 PC au prochain tour. Deux utilisations.',target:false},
  t1:{name:'Appui',ability:'Tir suppressif',description:'2 PC · tir visible à 7 cases : 2 dégâts et cible immobilisée au prochain tour. Deux utilisations.',target:true},
  t2:{name:'Apothicaire',ability:'Stabilisation',description:'2 PC · rend 3 armure à un frère adjacent. Stabiliser un frère à 5 armure ou moins : +3 points, une fois.',target:true},
  t3:{name:'Sapeur',ability:'Ouverture contrôlée',description:'2 PC · ouvre une porte fermée à 3 cases, en vue, avant les mouvements. Deux utilisations.',target:true},
};
export type Incident={threshold:number;sector:number;kind:'vent'|'lockdown'};
export type Tactics={version:1;mission:MissionId;threat:number;noise:number;incident:Incident;incidentIndex:number;
  budgets:Record<string,number>;hands:Record<string,CardId[]>;draw:Record<string,number>;charges:Record<string,number>;
  active:Record<string,CardId|undefined>;reserves:string[];spent:Record<string,number>;boost:number;
  jamUntil:Record<Side,number>;suppressed:Record<string,number>;signals:{sector:number;until:number;audience:Side}[];
  cargo:string|null;recovered:boolean;rescued:boolean;endReason?:string};
export type TacticalView={mission:MissionId;threat:number;noise:number;incident:Incident;budget:number;hand:CardId[];
  charges:Record<string,number>;suppressed:string[];jammed:boolean;signals:{sector:number;until:number}[];
  cargo:string|null;recovered:boolean;rescued:boolean;endReason?:string};
const dist=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same=(a:Pos,b:Pos)=>a.x===b.x&&a.y===b.y;
const owner=(u:Unit)=>String(u.side==='imperium'?-1:u.commander);
const deck=(observer:string):CardId[]=>observer==='-1'?['crossfire','cover','breach','jam']:['decoy','sabotage','crossfire','cover'];
export const EXTRACTION={x:3,y:10};
export function setupTactics(w:World,mission:MissionId){
 const hands:Record<string,CardId[]>={},draw:Record<string,number>={};
 for(const id of ['-1','0','1']){const d=deck(id),offset=(w.seed+Number(id)+1)%d.length;hands[id]=[0,1,2].map(i=>d[(offset+i)%d.length]);draw[id]=offset+3;}
 w.tactics={version:1,mission,threat:0,noise:0,incident:{threshold:7,sector:w.seed%3,kind:w.seed%2?'vent':'lockdown'},incidentIndex:0,
  budgets:{'-1':6,'0':4,'1':4},hands,draw,charges:Object.fromEntries(w.units.map(u=>[u.id,2])),active:{},reserves:[],spent:{},boost:0,
  jamUntil:{imperium:0,nightlords:0},suppressed:{},signals:[],cargo:null,recovered:false,rescued:false};
}
export function tacticsView(w:World,observer:number):TacticalView|undefined{
 const t=w.tactics;if(!t)return;const side=observer===-1?'imperium':'nightlords';
 const ids=w.units.filter(u=>u.hp>0&&owner(u)===String(observer)).map(u=>u.id);
 return {mission:t.mission,threat:t.threat,noise:t.noise,incident:{...t.incident},budget:t.budgets[observer],hand:[...t.hands[observer]],
  charges:Object.fromEntries(ids.map(id=>[id,t.charges[id]])),suppressed:ids.filter(id=>t.suppressed[id]>=w.turn),jammed:t.jamUntil[side]>=w.turn,
  signals:t.signals.filter(s=>s.audience===side&&s.until>=w.turn).map(({sector,until})=>({sector,until})),
  cargo:side==='imperium'?t.cargo:null,recovered:side==='imperium'&&t.recovered,rescued:side==='imperium'&&t.rescued,endReason:t.endReason};
}
export function orderCost(o:Order){return (o.kind==='hold'?0:o.kind==='fire'||o.kind==='special'?2:1)+(o.reaction?1:0);}
export function planCost(orders:Order[],card?:CardId){return orders.reduce((n,o)=>n+orderCost(o),card?1:0);}
export function specialLegal(v:View,o:Order){
 const u=v.units.find(u=>u.id===o.unit),t=v.tactics;if(!u||!t||t.charges[u.id]<=0)return false;
 if(u.id==='t0')return true;
 const p=o.target;if(!p||!v.visible.includes(`${p.x},${p.y}`))return false;
 if(u.id==='t1')return dist(u,p)<=7;
 if(u.id==='t2')return dist(u,p)<=1&&v.units.some(a=>same(a,p)&&a.hp<a.maxHp);
 if(u.id==='t3')return dist(u,p)<=3&&v.doors.some(d=>same(d,p)&&!d.open);
 return dist(u,p)<=1&&v.objectives.some(x=>same(x,p));
}
/** Budgets and hands are enforced by the engine, never trusted from the UI or agent. */
export function budgetOrders(w:World,orders:Order[],plans:Plans){
 const t=w.tactics;if(!t)return;t.active={};t.reserves=[];t.spent={};
 for(const id of ['-1','0','1']){
  let left=t.budgets[id];const card=plans[id]?.card;
  if(card&&t.hands[id].includes(card)&&left>=1){t.active[id]=card;t.hands[id].splice(t.hands[id].indexOf(card),1);left--;}
  for(let i=0;i<orders.length;i++){
   const o=orders[i],u=w.units.find(u=>u.id===o.unit)!;if(owner(u)!==id)continue;
   const cost=orderCost(o);if(cost>left){orders[i]={unit:u.id,kind:'hold'};continue;}left-=cost;
   if(o.reaction)t.reserves.push(u.id);if(o.kind==='special')t.charges[u.id]--;
  }
  t.spent[id]=t.budgets[id]-left;
 }
}
type Emit=(s:string,p:Pos,side?:Side)=>void;
export function startTactics(w:World,orders:Order[],emit:Emit){
 const t=w.tactics;if(!t)return;
 for(const [id,card] of Object.entries(t.active)){
  const group=w.units.filter(u=>u.hp>0&&owner(u)===id),side=id==='-1'?'imperium':'nightlords';
  if(card==='breach')for(const d of w.doors)if(!d.open&&group.some(u=>dist(u,d)<=1)){d.open=true;emit(`Brèche : ${d.id} ouverte.`,d,side);}
  if(card==='jam'){const other=side==='imperium'?'nightlords':'imperium';t.jamUntil[other]=w.turn+1;}
  if(card==='decoy'){t.signals.push({sector:(w.seed+w.turn+Number(id))%3,until:w.turn+2,audience:side==='imperium'?'nightlords':'imperium'});}
  // The hostile card itself is disclosed only through visible effects, not global chatter.
  if(side==='imperium')emit(`Carte : ${CARDS[card!].name}.`,group[0]??EXTRACTION,side);
 }
 for(const o of orders){const u=w.units.find(u=>u.id===o.unit)!;
  if(o.kind==='scan')t.signals=t.signals.filter(s=>s.audience!==u.side||dist(u,w.objectives[s.sector])>10);
  if(o.kind!=='special')continue;
  if(u.id==='t0'){t.boost=1;emit('VAEL rallie les frères : bruit réduit, +1 PC au prochain tour.',u,u.side);}
  else if(u.id==='t2'){
   const ally=w.units.find(a=>a.side===u.side&&a.hp>0&&o.target&&same(a,o.target));
   if(ally){const critical=ally.hp<=5;ally.hp=Math.min(ally.maxHp,ally.hp+3);emit(`CAEL stabilise ${ally.name} (+3 armure).`,ally,u.side);
    if(critical&&!t.rescued){t.rescued=true;w.score.imperium+=3;emit('Frère stabilisé : objectif secondaire +3.',ally,u.side);}}
  }else if(u.id==='t3'){const d=w.doors.find(d=>o.target&&same(d,o.target));if(d){d.open=true;emit(`BRANN ouvre ${d.id} sans explosion.`,d,u.side);}}
  else if(u.side==='nightlords'){const obj=w.objectives.find(a=>o.target&&same(a,o.target));if(obj){obj.owner=null;emit(`${obj.name} saboté.`,obj,u.side);}}
 }
}
export function tacticalDamage(w:World,orders:Order[],shooter:Unit,target:Unit,amount:number){
 const t=w.tactics;if(!t)return amount;
 if(t.active[owner(shooter)]==='crossfire'&&orders.filter(o=>o.kind==='fire'&&o.target&&same(o.target,target)&&w.units.find(u=>u.id===o.unit)?.side===shooter.side).length>=2)amount++;
 if(t.active[owner(target)]==='cover')amount--;
 const i=t.reserves.indexOf(target.id);if(i>=0){amount-=2;t.reserves.splice(i,1);}
 return Math.max(0,amount);
}
export function objectiveValue(w:World,index:number){
 const t=w.tactics;if(!t)return index===2?2:1;
 const obj=w.objectives[index];
 for(const [id,card] of Object.entries(t.active))if(card==='sabotage'&&w.units.some(u=>u.hp>0&&owner(u)===id&&dist(u,obj)<=1))return 0;
 return MISSIONS[t.mission].values[index];
}
export function finishTactics(w:World,orders:Order[],emit:Emit){
 const t=w.tactics;if(!t)return;
 if(t.cargo&&!w.units.some(u=>u.id===t.cargo&&u.hp>0))t.cargo=null;
 for(const o of orders.filter(o=>o.kind==='interact')){
  const u=w.units.find(u=>u.id===o.unit)!;if(u.hp<=0||u.side!=='imperium'||!o.target)continue;
  if(!t.recovered&&!t.cargo&&same(o.target,w.objectives[2])&&dist(u,w.objectives[2])<=1&&w.objectives[2].owner==='imperium'){t.cargo=u.id;emit(`${u.name} porte les données : retour au sas pour +6.`,u,u.side);}
  if(t.cargo===u.id&&same(o.target,EXTRACTION)&&dist(u,EXTRACTION)<=1){t.cargo=null;t.recovered=true;w.score.imperium+=6;emit('Données extraites : objectif secondaire +6.',u,u.side);}
 }
 t.noise=Math.max(0,orders.filter(o=>o.kind==='fire'||o.kind==='special'&&o.unit==='t1').length+Object.values(t.active).filter(c=>c==='breach').length*2-(orders.some(o=>o.kind==='special'&&o.unit==='t0')?2:0));
 t.threat+=1+Math.floor(t.noise/3);
 if(t.threat>=t.incident.threshold){
  const sector=t.incident.sector,obj=w.objectives[sector];
  if(t.incident.kind==='vent'){
   for(const u of w.units.filter(u=>u.hp>0&&dist(u,obj)<=3)){const guarded=orders.some(o=>o.unit===u.id&&o.kind==='guard');const reserved=t.reserves.includes(u.id);const hit=Math.max(0,2-Number(guarded)-Number(reserved));u.hp=Math.max(0,u.hp-hit);if(hit)emit(`${u.name} : décompression (−${hit}).`,u,u.side);}
   emit(`Incident annoncé : décompression du secteur ${obj.name}.`,EXTRACTION,'imperium');
  }else{
   const d=w.doors[[1,2,3][sector]];d.open=false;emit(`Incident annoncé : verrouillage de ${d.id}.`,EXTRACTION,'imperium');
  }
  t.incidentIndex++;t.incident={threshold:t.incident.threshold+7,sector:(w.seed+t.incidentIndex)%3,kind:t.incident.kind==='vent'?'lockdown':'vent'};
 }
 if(t.cargo&&!w.units.some(u=>u.id===t.cargo&&u.hp>0))t.cargo=null;
 // One replacement every other turn, bounded hand; spending a card has lasting cost.
 if(w.turn%2===0)for(const id of ['-1','0','1'])if(t.hands[id].length<3){const d=deck(id);t.hands[id].push(d[t.draw[id]++%d.length]);}
 t.budgets={'-1':6+t.boost,'0':4,'1':4};t.boost=0;
 t.signals=t.signals.filter(s=>s.until>w.turn);
}
