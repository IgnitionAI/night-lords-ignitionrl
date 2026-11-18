import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE,collide} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
import {griffeAction} from '../src/griffe';
import {rangedAction,updateCombatMode,firePosition,clearFireLane} from '../src/fps-combat';
function scene(){
 const w=newWorld(527,{x:4,y:12,facing:0},{fps:true,eliteDuel:true});
 w.nls.forEach((n,i)=>{n.alive=i===0;Object.assign(n,{x:11,y:12,facing:Math.PI});});
 w.lighting!.circuits.forEach(c=>c.cooldownUntil=10000);w.t.hp=1000;return w;
}
test('lit duel holds firing range and fires without a melee charge',()=>{
 const w=scene();let bolts=0,claws=0;
 for(let k=0;k<100;k++){step(w,T_IDLE,[eliteDuelAction(w,0)]);bolts+=w.events.filter(e=>e.type==='enemyBolt').length;claws+=w.events.filter(e=>e.type==='clawArm').length;
  expect(Math.hypot(w.nls[0].x-w.t.x,w.nls[0].y-w.t.y)).toBeGreaterThan(5);
 }
 expect(bolts).toBeGreaterThan(1);expect(claws).toBe(0);
});
test('ranged hunter retreats from a nearby observed player and clears obstacles',()=>{
 const w=scene(),n=w.nls[0];n.x=6;
 for(let k=0;k<70;k++){step(w,T_IDLE,[eliteDuelAction(w,0)]);const p={x:n.x,y:n.y};collide(p,.45,w.propSolids);expect(Math.hypot(p.x-n.x,p.y-n.y)).toBeLessThan(.001);}
 expect(Math.hypot(n.x-w.t.x,n.y-w.t.y)).toBeGreaterThan(5.5);expect(n.armTicks).toBe(0);
});
test('fire position depends on retained contact, not hidden player coordinates',()=>{
 const a=scene(),b=scene();b.t.x=35;b.t.y=22;
 for(const w of [a,b]){Object.assign(w.nls[0],{x:6});Object.assign(w.nls[0].belief,{valid:true,x:4,y:12,age:12,seen:false});updateCombatMode(w,w.nls[0]);}
 expect(rangedAction(a,0)).toBe(rangedAction(b,0));expect(firePosition(a,0)).toEqual(firePosition(b,0));
});
test('lighting controls melee and shooting permission even for an invalid actor choice',()=>{
 const w=scene(),n=w.nls[0];n.x=5.6;
 step(w,T_IDLE,[7]);expect(n.armTicks).toBe(0);
 w.lighting!.circuits.forEach(c=>c.blackoutUntil=200);
 for(let k=0;k<20;k++)step(w,T_IDLE,[eliteDuelAction(w,0)]);
 expect(n.combatMode).toBe('hunt');expect(n.shotTicks??0).toBe(0);expect(w.t.hp).toBeLessThan(1000);
});
test('a pillar or crossing squadmate blocks both preparation and a prepared shot',()=>{
 const w=scene(),n=w.nls[0],mate=w.nls[1];
 Object.assign(mate,{alive:true,x:7,y:12});
 expect(clearFireLane(w,n,4,12)).toBe(false);
 step(w,T_IDLE,[0,0]);expect(n.shotTicks??0).toBe(0);
 Object.assign(n,{shotTicks:1,shotX:4,shotY:12});step(w,T_IDLE,[0,0]);
 expect(w.events.some(e=>e.type==='enemyBolt'&&e.who===0)).toBe(false);
 mate.alive=false;expect(clearFireLane(w,n,4,12)).toBe(true);
 n.x=20;expect(clearFireLane(w,n,15,12)).toBe(false);
});
test('blackout belongs to the local zone, not the whole ship',()=>{
 const w=scene(),n=w.nls[0];w.lighting!.circuits[2].blackoutUntil=100;
 updateCombatMode(w,n);expect(n.combatMode).toBe('ranged');
 n.x=34;w.tick++;updateCombatMode(w,n);w.tick++;updateCombatMode(w,n);
 expect(n.combatMode).toBe('hunt');
});
test('visible squad windups stagger claws instead of all hitting in the same instant',()=>{
 const w=scene(),a=w.nls[0],b=w.nls[1];w.lighting!.circuits.forEach(c=>c.blackoutUntil=200);
 Object.assign(a,{x:5.5,y:12.4,facing:Math.atan2(-.4,-1.5),cd:0});
 Object.assign(b,{alive:true,x:5.3,y:11.4,facing:Math.atan2(.6,-1.3),cd:0});
 for(const n of [a,b])Object.assign(n.belief,{valid:true,x:4,y:12,age:0,seen:true});
 step(w,T_IDLE,[7,7]);expect(w.events.filter(e=>e.type==='clawArm')).toHaveLength(1);
 for(let k=0;k<4;k++){step(w,T_IDLE,[7,7]);expect(w.events.some(e=>e.type==='clawArm')).toBe(false);}
 step(w,T_IDLE,[7,7]);expect(w.events.filter(e=>e.type==='clawArm')).toHaveLength(1);
 expect(w.events.some(e=>e.type==='enemyBolt')).toBe(false);
});
