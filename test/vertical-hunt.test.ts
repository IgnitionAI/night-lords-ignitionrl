import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE} from '../src/sim';
import {beginClimb,verticalStep} from '../src/vertical-hunt';
import {CEILING_ROUTES} from '../src/ship-layout';
test('ceiling routes are physical, bounded, and eventually descend without contact',()=>{
 for(const r of CEILING_ROUTES){const w=newWorld(9,undefined,{mission:true,fps:true}),n=w.nls[0];Object.assign(n,{x:r.a.x,y:r.a.y});expect(beginClimb(w,n)).toBe(true);
 let top=false;for(let k=0;k<250&&n.vertical;k++){const p={x:n.x,y:n.y,h:n.height??0};verticalStep(w,n);top ||= (n.height??0)===3;expect(Math.hypot(n.x-p.x,n.y-p.y)).toBeLessThan(.34);expect(Math.abs((n.height??0)-p.h)).toBeLessThan(.31);}
 expect(top).toBe(true);expect(n.vertical).toBeUndefined();expect(n.height).toBe(0);expect(n.verticalRest).toBe(65);}
});
test('elevated hunter can be hit by pitched bolter and cannot claw from ceiling',()=>{
 const w=newWorld(2,{x:18,y:12,facing:0},{mission:true,fps:true});w.nls.forEach(n=>n.alive=false);const n=w.nls[0];Object.assign(n,{alive:true,x:24,y:12,height:3,hp:7,armTicks:0});
 step(w,{...T_IDLE,bolt:true,aimPitch:Math.atan2(4.2-2.1788,6)},[7,0,0,0]);expect(n.hp).toBe(6);
 n.x=19.5;for(let k=0;k<7;k++)step(w,T_IDLE,[0,0,0,0]);expect(w.t.hp).toBe(30);
});
