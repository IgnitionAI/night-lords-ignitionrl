import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
function duel(){const w=newWorld(17,{x:4,y:12,facing:0},{fps:true,eliteDuel:true});w.nls.forEach((n,i)=>{n.alive=i===0;n.x=11;n.y=12;n.belief.valid=true;n.belief.x=4;n.belief.y=12;});return w;}
test('elite armor survives a burst; recovery multiplies actual damage',()=>{
 const w=duel();step(w,{...T_IDLE,bolt:true},[0]);expect(w.nls[0].hp).toBeCloseTo(23.8);
 w.nls[0].recoveryTicks=3;step(w,T_IDLE,[0]);expect(w.nls[0].hp).toBeCloseTo(22.8);
});
test('missing with fist cannot stun elite remotely',()=>{
 const w=duel();step(w,{...T_IDLE,fist:true},[0]);for(let k=0;k<8;k++)step(w,T_IDLE,[0]);expect(w.nls[0].stunTicks).toBe(0);expect(w.nls[0].hp).toBe(24);
});
test('sprint ends and cannot restart before cooldown',()=>{
 const w=duel();eliteDuelAction(w,0);expect(w.nls[0].burstTicks).toBe(5);
 for(let k=0;k<6;k++){w.tick++;eliteDuelAction(w,0);}expect(w.nls[0].burstTicks).toBe(0);expect(w.nls[0].burstRest).toBeGreaterThan(0);
});
test('attack reveals a recovery window even when dodged',()=>{
 const w=duel();w.nls[0].armTicks=1;step(w,T_IDLE,[0]);expect(w.nls[0].recoveryTicks).toBe(10);expect(w.t.hp).toBe(30);
});
test('controller does not overwrite target behind solid pillar',()=>{
 const w=duel();w.nls[0].x=20;w.t.x=15;w.nls[0].belief.x=4;eliteDuelAction(w,0);expect(w.nls[0].belief.x).toBe(4);
});
