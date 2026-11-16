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
