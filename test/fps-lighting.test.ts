import {test,expect} from 'bun:test';
import {newWorld,step,T_IDLE} from '../src/sim';
import {lightAction,isDark} from '../src/fps-lighting';
function scene(){
 const w=newWorld(2,{x:4,y:12,facing:0},{fps:true,eliteDuel:true});w.tick=20;
 w.nls.forEach((n,i)=>n.alive=i===0);const n=w.nls[0];Object.assign(n,{x:8,y:11,facing:Math.PI});
 Object.assign(n.belief,{valid:true,x:4,y:12,age:0,seen:true,facing:0});return w;
}
test('sabotage has a warning, delayed auto night vision, restoration and bounded cooldown',()=>{
 const w=scene(),c=w.lighting!.circuits[0];expect(lightAction(w,0)).toBe(0);expect(c.warningUntil).toBe(32);
 for(let t=0;t<11;t++)step(w,T_IDLE,[0]);expect(isDark(w,4,12)).toBe(false);
 step(w,T_IDLE,[0]);expect(isDark(w,4,12)).toBe(true);expect(w.lighting!.nightVision).toBe(false);
 for(let t=0;t<3;t++)step(w,T_IDLE,[0]);expect(w.lighting!.nightVision).toBe(true);
 for(let t=0;t<65;t++)step(w,T_IDLE,[0]);expect(isDark(w,4,12)).toBe(false);
 for(let t=0;t<5;t++)step(w,T_IDLE,[0]);expect(w.lighting!.nightVision).toBe(false);
 expect(c.cooldownUntil).toBeGreaterThan(w.tick);expect(w.nls[0].lightRetreatUntil).toBeGreaterThan(w.tick);
});
test('killing or hitting a saboteur cancels the prepared blackout',()=>{
 for(const kill of [true,false]){const w=scene(),c=w.lighting!.circuits[0];lightAction(w,0);
 if(kill)w.nls[0].alive=false;else w.nls[0].lastDamageTick=w.tick;
 step(w,T_IDLE,[0]);expect(c.warningUntil).toBe(0);expect(c.blackoutUntil).toBe(0);}
});
test('light decisions do not inspect a hidden player location',()=>{
 const a=scene(),b=scene();b.t.x=35;b.t.y=22;
 expect(lightAction(a,0)).toBe(lightAction(b,0));expect(a.lighting).toEqual(b.lighting);
});
test('tactical simulations keep their original lighting-independent contract',()=>{
 expect(newWorld(1).lighting).toBeUndefined();expect(newWorld(1,undefined,{fps:true}).lighting).toBeUndefined();
});
