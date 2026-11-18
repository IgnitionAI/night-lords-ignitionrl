import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE} from '../src/sim';
import {griffeAction} from '../src/griffe';
function setup(){const w=newWorld(1,{x:20,y:20,facing:0},{mission:true,fps:true});w.nls.forEach(n=>n.alive=false);const n=w.nls[0];Object.assign(n,{alive:true,x:26,y:20,facing:Math.PI});return {w,n};}
test('mission armor survives one full bolter burst and remains killable',()=>{
 const {w,n}=setup();for(let k=0;k<3;k++)step(w,{...T_IDLE,bolt:true},[0,0,0,0]);expect(n.hp).toBe(4);expect(n.alive).toBe(true);
 for(let k=0;k<40&&n.alive;k++)step(w,{...T_IDLE,bolt:true},[0,0,0,0]);expect(n.alive).toBe(false);
});
test('fist no longer stuns distant or hidden brothers',()=>{
 const {w,n}=setup();n.x=40;n.y=20;step(w,{...T_IDLE,fist:true},[0,0,0,0]);for(let k=0;k<8;k++)step(w,T_IDLE,[0,0,0,0]);expect(n.stunTicks).toBe(0);
});
test('visible aim triggers bounded physical dodge with recovery',()=>{
 const {w,n}=setup();Object.assign(n.belief,{valid:true,seen:true,x:20,y:20,facing:0,age:0});
 griffeAction(w,0,0);expect(n.dodgeTicks).toBe(5);const y=n.y;
 step(w,T_IDLE,[0,0,0,0]);expect(Math.abs(n.y-y)).toBeCloseTo(.30);expect(n.dodgeRest).toBe(33);expect(n.hp).toBe(7);
});
