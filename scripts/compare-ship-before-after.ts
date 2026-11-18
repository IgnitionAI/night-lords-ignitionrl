import * as before from '../runs/before-ship/src/sim';
import {griffeAction as oldGriffe} from '../runs/before-ship/src/griffe';
import * as after from '../src/sim';
import {griffeAction} from '../src/griffe';
import {shipOpponent} from '../src/ship-opponent';
import {forward,softmax,sample} from '../src/policy';
import {mulberry32} from '../src/rng';
import {readFileSync,writeFileSync} from 'node:fs';
const actor=JSON.parse(readFileSync('policies/mission.json','utf8'));
const rows=[];
for(const version of ['before','after'])for(let seed=910001;seed<=910012;seed++)for(let style=0;style<3;style++){
 const sim=version==='before'?before:after,control=version==='before'?oldGriffe:griffeAction;
 const spots=version==='before'?[[22,12],[28,6],[28,18]]:[[22,20],[54,12],[60,32]];
 const p=spots[seed%3],w=sim.newWorld(seed,{x:p[0],y:p[1],facing:0},{mission:true,fps:true}),rng=mulberry32(seed);
 let dodges=0,vertical=0;
 while(w.tick<500&&!w.done&&w.nls.some(n=>n.alive)){
  const actions=w.nls.map((n,i)=>n.alive?control(w as any,i,sample(softmax(forward(actor,sim.observe(w as any,i))),rng)):0);
  sim.step(w as any,shipOpponent(w as any,style),actions);
  dodges+=w.nls.filter(n=>(n as any).dodgeTicks>0).length;vertical+=w.nls.filter(n=>(n as any).vertical).length;
 }
 rows.push({version,seed,style,sector:seed%3,damage:30-w.t.hp,win:w.winner==='pack',survivors:w.nls.filter(n=>n.alive).length,ticks:w.tick,dodges,vertical});
}
const summary=['before','after'].map(version=>{const r=rows.filter(x=>x.version===version);return {version,episodes:r.length,wins:r.filter(x=>x.win).length,...Object.fromEntries(['damage','survivors','ticks','dodges','vertical'].map(k=>[k,r.reduce((a,b)=>a+(b as any)[k],0)/r.length]))};});
const report={baselineCommit:'d5c05b2',scope:'Historical small arena and fixed rhythm versus expanded ship and current tactics. Three corresponding encounter sectors, three bounded-view player styles,12 held-out seeds. Different geometry and armor: total build comparison, not isolated policy causality. Same retained32-input actor for close action selection. No Genestealers/objectives in this encounter test.',summary,rows};
writeFileSync('docs/mission/before-after-builds.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary,null,2));
