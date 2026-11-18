import {distance,getView,type World} from '../src/strategy/engine';
import {boardingAction,boardingPlan} from '../src/strategy/boarding-agents';
import {MISSIONS,type MissionId} from '../src/strategy/tactics';

export const HELD_OUT_RESIDUES=[5,8,11];
export const EVAL_SEEDS=[10001,10004,10007]; // modulo 12 = 5, 8, 11. No such configuration is used in training.
export function playerPlan(w:World,style:number):ReturnType<typeof boardingPlan>{
 const v=getView(w,-1);
 // Evaluation-only opponents. All decisions use the player's normal view.
 if(style===3)return boardingPlan(v,v.objectives[0].owner==='imperium'?1:0);
 if(style===4)return boardingPlan(v,2+(v.contacts.some(c=>c.seen===v.turn)?6:3));
 if(style===5){
  const values:readonly number[]=MISSIONS[v.tactics!.mission].values;
  const goal=values.indexOf(Math.max(...values));
  return boardingPlan(v,goal+(v.units.some(u=>u.hp<=4)?9:0));
 }
 // Unused by training or model selection. Cover contested ground, value a
 // captured relay before switching lanes, or reconnoitre the threatened sector.
 if(style===6){
  const objective=v.objectives.findIndex(o=>o.owner!=='imperium');
  return boardingPlan(v,Math.max(0,objective)+(v.contacts.some(c=>c.seen===v.turn)?9:0));
 }
 if(style===7)return boardingPlan(v,(w.turn<=5?0:w.turn<=11?2:1)+(w.turn%3===0?6:0));
 if(style===8)return boardingPlan(v,v.tactics!.incident.sector+(v.contacts.some(c=>c.seen===v.turn)?6:3));
 // Final probes switch between previously defined commanders during a match.
 if(style>=9){
  const phases=[[4,1,2],[3,2,0],[2,5,4]];
  return playerPlan(w,phases[style-9][Math.min(2,Math.floor((w.turn-1)/6))]);
 }
 const action=style===0?(w.turn<7?1:2):style===1?(w.turn<8?2:0):boardingAction(v);
 return boardingPlan(v,action);
}

const missions:MissionId[]=['breach','blackout','recovery'];
export function trainingScenario(index:number,historical=false){
 const mission=missions[historical?index%3:(index+Math.floor(index/9))%3];
 const style=historical?index%3:(Math.floor(index/3)+Math.floor(index/27))%3;
 return {mission,style};
}

export function loyalistPlan(world: World, style: number) {
  if (style < 12) return playerPlan(world, style);
  const view = getView(world, -1);
  const tactics = view.tactics!;
  const objectives = view.objectives;
  const knownContact = view.contacts.some(c => c.seen === view.turn);
  if (style === 12) {
    // Secure the archives, then the power supply, then the relay.
    const goal = [2, 1, 0].find(i => objectives[i].owner !== view.side) ?? 2;
    return boardingPlan(view, goal + (knownContact ? 6 : 0));
  }
  if (style === 13) {
    // Defend the most valuable known holding when ahead, seek points otherwise.
    const ranked = [0, 1, 2].sort((a, b) => MISSIONS[tactics.mission].values[b] - MISSIONS[tactics.mission].values[a]);
    const leading = view.score.imperium > view.score.nightlords;
    const goal = ranked.find(i => (objectives[i].owner === view.side) === leading) ?? ranked[0];
    return boardingPlan(view, goal + (leading ? 9 : 0));
  }
  // Prefer the nearest unclaimed system outside an imminent decompression.
  const threatened = tactics.incident.kind === 'vent' && tactics.incident.threshold - tactics.threat <= 2;
  const candidates = [0, 1, 2].filter(i => !threatened || i !== tactics.incident.sector);
  const priority = (i: number) => (objectives[i].owner === view.side ? 100 : 0)
    + Math.min(...view.units.map(unit => distance(unit, objectives[i])));
  const goal = candidates.sort((a, b) => priority(a) - priority(b))[0];
  return boardingPlan(view, goal + (view.turn <= 2 ? 3 : 0));
}
