import {PROP_KINDS} from '../src/props';
import {test,expect} from 'bun:test';
import {newWorld,nlFrame,rayFree,observe} from '../src/sim';
import {griffeAction,tacticalState} from '../src/griffe';
test('navigation corrects a blocked approach using fresh belief',()=>{
 const w=newWorld(4,undefined,{fps:true}),n=w.nls[0];n.x=16.3;n.y=12;n.facing=0;
 n.belief={valid:true,x:28,y:12,age:0,facing:0,seen:true,heard:false,vox:false};
 n.armTicks=0;n.stunTicks=0;n.cd=0;
 expect(rayFree(n.x,n.y,1,0,1.2,w.propSolids)).toBeLessThan(.85);
 const a=griffeAction(w,0,1);expect(a).not.toBe(1);
});
test('stale information cannot trigger a scripted route or reveal the player',()=>{
 const w=newWorld(4,undefined,{fps:true}),n=w.nls[0];n.belief.valid=false;
 expect(griffeAction(w,0,5)).toBe(5);n.belief.valid=true;n.belief.age=30;
 expect(griffeAction(w,0,5)).toBe(5);
});

test('perceived rear opportunity in blackout attacks regardless of old rhythm, without moving bodies',()=>{
 for(const tick of [0,180,360,500]){
  const w=newWorld(527,undefined,{fps:true,mission:true}),n=w.nls[0];w.tick=tick;n.x=25.5;n.y=12;
  w.lighting!.circuits.forEach(c=>c.blackoutUntil=tick+100);
  n.belief={valid:true,x:27,y:12,age:0,facing:0,seen:true,heard:false,vox:false};
  const before={x:n.x,y:n.y,hp:n.hp};expect(griffeAction(w,0,0)).toBe(7);
  expect({x:n.x,y:n.y,hp:n.hp}).toEqual(before);
 }
});
test('mission shelter routing depends on belief, not hidden actual player coordinates',()=>{
 const a=newWorld(22,undefined,{fps:true,mission:true}),b=newWorld(22,undefined,{fps:true,mission:true});
 for(const w of [a,b]){w.tick=200;w.nls[0].belief={valid:true,x:27,y:12,age:0,facing:0,seen:true,heard:false,vox:false};}
 b.t.x=2;b.t.y=2;
 expect(griffeAction(a,0,7)).toBe(griffeAction(b,0,7));
});

 test('a hunter touching a prop can retreat without sticking to floating point contact',()=>{
 const w=newWorld(527,undefined,{fps:true,mission:true,propKinds:PROP_KINDS}),n=w.nls[1];
 n.x=29.664809150000004;n.y=14.352334452864683;w.tick=1160;
 n.belief={valid:true,x:27,y:12,age:0,facing:0,seen:true,heard:false,vox:false};
 expect(griffeAction(w,1,1)).not.toBe(0);
 });

 test('roles survive lost contact and change only after a known casualty',()=>{
 const w=newWorld(527,undefined,{fps:true,mission:true});
 const roles=['leader','bait','hunter','interceptor'];
 for(let i=0;i<4;i++){w.nls[i].belief.valid=false;griffeAction(w,i,0);expect(tacticalState(w,i)?.role).toBe(roles[i]);}
 w.nls[0].alive=false; // An unseen casualty cannot change another hunter's role.
 griffeAction(w,1,0);expect(tacticalState(w,1)?.role).toBe('bait');
 w.nls[1].mates[0].alive=false;
 griffeAction(w,1,0);expect(tacticalState(w,1)?.role).toBe('leader');
 });
 test('a fresh retreat report requests cover but an expired report does not',()=>{
 const w=newWorld(527,undefined,{fps:true,mission:true}),n=w.nls[2];
 w.lighting!.circuits.forEach(c=>c.blackoutUntil=200);
 w.tick=100;n.x=25;n.y=12;
 n.belief={valid:true,x:27,y:12,age:0,facing:0,seen:true,heard:false,vox:false};
 n.mates[1]={known:true,alive:true,x:24,y:12,age:0,retreatUntil:120};
 griffeAction(w,2,0);expect(tacticalState(w,2)?.mode).toBe('cover');
 w.tick=121;griffeAction(w,2,0);expect(tacticalState(w,2)?.mode).toBe('attack');
 });

test('legacy mission actor cannot read unseen player armor or objective channel',()=>{
 const w=newWorld(4,undefined,{fps:true,mission:true});w.nls[0].belief.valid=false;
 const before=observe(w,0);w.t.hp=1;w.t.channel=50;
 expect(observe(w,0)).toEqual(before);
});

test('synchronization waits briefly and cannot delay a perceived rear opening',()=>{
 const w=newWorld(527,undefined,{fps:true,mission:true}),n=w.nls[2];w.tick=100;n.x=25;n.y=12;w.lighting=undefined; // Isolate the rendezvous from the separately tested sabotage override.
 n.belief={valid:true,x:31,y:12,age:0,facing:Math.PI,seen:true,heard:false,vox:false};n.dodgeRest=20;
 n.mates[0]={known:true,alive:true,x:27,y:12,age:0};
 expect(griffeAction(w,2,1)).toBe(0);expect(tacticalState(w,2)?.mode).toBe('sync');
 w.tick=113;griffeAction(w,2,1);expect(tacticalState(w,2)?.mode).not.toBe('sync');
 n.belief.facing=0;w.tick=114;griffeAction(w,2,1);expect(tacticalState(w,2)?.mode).toBe('attack');
});
