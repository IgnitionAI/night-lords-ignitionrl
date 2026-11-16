import {griffeAction} from '../src/griffe';
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

test('landing recovery blocks attacks and movement for four ticks without immunity',()=>{
 const w=newWorld(2,{x:18,y:12,facing:0},{mission:true,fps:true,clawWindup:true});
 w.nls.forEach(n=>n.alive=false);const n=w.nls[0];
 Object.assign(n,{alive:true,x:24,y:12,height:0,hp:7,recoveryTicks:4,armTicks:0,cd:0});
 for(let k=0;k<4;k++){step(w,k===0?{...T_IDLE,bolt:true}:T_IDLE,[k%2?7:1,0,0,0]);expect(n.x).toBe(24);expect(n.armTicks).toBe(0);expect(n.shotTicks??0).toBe(0);}
 expect(n.hp).toBeLessThan(7);expect(n.recoveryTicks).toBe(0);
 step(w,T_IDLE,[1,0,0,0]);expect(n.x).not.toBe(24);
});

test('a rear drop lands outside the player then commits a punishable ground strike',()=>{
 const w=newWorld(2,{x:24,y:26,facing:Math.PI/2},{mission:true,fps:true,clawWindup:true});
 w.nls.forEach(n=>n.alive=false);const n=w.nls[0];Object.assign(n,{alive:true,x:24,y:15,facing:Math.PI/2,hp:7,armTicks:0,stunTicks:0});
 expect(beginClimb(w,n)).toBe(true);let landed=false,airTicks=0;
 for(let k=0;k<100;k++){
  const wasAir=!!n.vertical;step(w,T_IDLE,[griffeAction(w,0,1),0,0,0]);
  if(wasAir){airTicks++;expect(w.t.hp).toBe(30);}
  if(wasAir&&!n.vertical){landed=true;expect(Math.hypot(n.x-w.t.x,n.y-w.t.y)).toBeGreaterThanOrEqual(1.25);expect(n.recoveryTicks).toBe(4);}
  if(w.t.hp<30)break;
 }
 expect(airTicks).toBeGreaterThan(40);expect(landed).toBe(true);expect(w.t.hp).toBeLessThan(30);
});
