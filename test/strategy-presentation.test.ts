import {test,expect} from 'bun:test';
import {createWorld,getView,resolve,observeAll,key} from '../src/strategy/engine';
import {presentRound} from '../web/strategy/presentation';

test('unseen orders, routes and hits never enter the presentation',()=>{
  const w=createWorld(17),view=getView(w,-1),r=resolve(w,[]);const a=presentRound(r,view);
  const changed=structuredClone(r);for(const u of [...changed.before,...changed.after])if(u.side==='nightlords'){u.x=22;u.y=17;u.hp=1;}
  changed.orders.filter(o=>o.unit.startsWith('n')).forEach(o=>{o.kind='fire';o.target={x:21,y:17};});
  changed.events.push('VRAK touche NYX (−3).');
  expect(presentRound(changed,view)).toEqual(a);expect(a.units.every(u=>u.side==='imperium')).toBe(true);expect(a.combat).toBe(false);
});
test('visible hostile routes terminate at the known visibility boundary',()=>{
  const w=createWorld();const n=w.units.find(u=>u.id==='n0')!;Object.assign(n,{x:6,y:10});observeAll(w);const v=getView(w,-1);const r=resolve(w,[{unit:'n0',kind:'move',target:{x:9,y:10}}]);
  // Simulate a route leaving the observed cells while keeping all game rules untouched.
  r.movement.n0=[{x:6,y:10},{x:7,y:10},{x:22,y:17},{x:21,y:17}];
  const p=presentRound(r,v);expect(p.movement.n0[2]).toEqual({x:-100,y:-100});expect(p.movement.n0[3]).toEqual({x:-100,y:-100});
  expect(p.orders.every(o=>o.unit.startsWith('t')||!o.target||v.visible.includes(key(o.target)))).toBe(true);
});
test('a hit on an ally never reveals a hidden shooter or tracer',()=>{
  const w=createWorld(17),v=getView(w,-1),r=resolve(w,[]);r.after[0].hp-=3;r.playerEvents.push('VRAK touche VAEL (−3).');
  const p=presentRound(r,v);expect(p.combat).toBe(true);expect(p.shots).toEqual([]);expect(p.after.find(u=>u.id==='t0')!.hp).toBe(7);
});
test('animation presentation preserves recorded movement and does not mutate history',()=>{
  const w=createWorld(),v=getView(w,-1),r=resolve(w,[{unit:'t0',kind:'move',target:{x:5,y:9}}]);const saved=JSON.stringify(r);const p=presentRound(r,v);
  expect(p.movement.t0).toEqual(r.movement.t0);p.movement.t0[0].x=100;p.doors[0].open=!p.doors[0].open;expect(JSON.stringify(r)).toBe(saved);
});
