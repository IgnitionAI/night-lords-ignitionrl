import {PROP_KINDS} from '../src/props';
import {test,expect} from 'bun:test';
import {newWorld,nlFrame,rayFree} from '../src/sim';
import {griffeAction} from '../src/griffe';
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

test('mission rhythm suppresses attacks outside the short strike and never moves bodies itself',()=>{
 const w=newWorld(527,undefined,{fps:true,mission:true}),n=w.nls[0];
 n.belief={valid:true,x:27,y:12,age:0,facing:0,seen:true,heard:false,vox:false};
 for(const tick of [0,180,360,500]){
  w.tick=tick;const before={x:n.x,y:n.y,hp:n.hp};
  expect(griffeAction(w,0,7)).not.toBe(7);
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
