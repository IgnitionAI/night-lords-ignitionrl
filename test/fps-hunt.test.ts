import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE,collide} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
import {travel} from '../src/fps-navigation';

test('duel cannot see behind its back or outside perception range',()=>{
 for(const x of [6,30]){
  const w=newWorld(22,{x,y:12,facing:0},{fps:true,eliteDuel:true}),n=w.nls[0];
  w.nls.forEach((n,i)=>n.alive=i===0);Object.assign(n,{x:8,y:12,facing:0});
  Object.assign(n.belief,{valid:true,x:5,y:5,age:25,seen:false});
  eliteDuelAction(w,0);expect([n.belief.x,n.belief.y]).toEqual([5,5]);
 }
});
test('sound contact stays stable between spaced auditory samples',()=>{
 const w=newWorld(22,{x:6,y:12,facing:0},{fps:true}),n=w.nls[0];
 w.nls.forEach((n,i)=>n.alive=i===0);Object.assign(n,{x:8,y:12,facing:0});
 step(w,T_IDLE,[0]);const p=[n.belief.x,n.belief.y];
 n.facing=0;step(w,T_IDLE,[0]);expect(n.belief.heard).toBe(true);expect([n.belief.x,n.belief.y]).toEqual(p);
});
test('continuous navigation goes around a pillar instead of oscillating at its face',()=>{
 const w=newWorld(22,{x:2,y:2,facing:0},{fps:true}),n=w.nls[0];w.nls.forEach((n,i)=>n.alive=i===0);
 Object.assign(n,{x:15,y:12,facing:0});
 let maxTurn=0,last=n.facing;
 for(let t=0;t<150&&Math.hypot(n.x-22,n.y-12)>1;t++){
  step(w,T_IDLE,[travel(w,0,22,12)]);maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(n.facing-last),Math.cos(n.facing-last))));last=n.facing;
  const p={x:n.x,y:n.y};collide(p,.45,w.propSolids);expect(Math.hypot(p.x-n.x,p.y-n.y)).toBeLessThan(.001);
 }
 expect(Math.hypot(n.x-22,n.y-12)).toBeLessThan(1);expect(maxTurn).toBeLessThanOrEqual(.321);
});
test('separation handles coincident hunters without pushing them through a wall',()=>{
 const w=newWorld(22,undefined,{fps:true});w.nls.forEach((n,i)=>{n.alive=i<2;n.x=16.54;n.y=12;});
 step(w,T_IDLE,[0,0]);const [a,b]=w.nls;expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThan(.3);
 for(const n of [a,b]){const p={x:n.x,y:n.y};collide(p,.45,w.propSolids);expect(Math.hypot(p.x-n.x,p.y-n.y)).toBeLessThan(.001);}
});
