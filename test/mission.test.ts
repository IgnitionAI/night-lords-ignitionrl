import { expect, test } from 'bun:test';
import { newWorld, T_IDLE } from '../src/sim';
import { CORE, EXTRACTION, missionStep, newMission } from '../src/mission';
function setup(){const w=newWorld(17,undefined,{fps:true,mission:true});w.nls.forEach(n=>n.alive=false);const m=newMission();m.xenos.forEach(g=>g.hp=0);return {w,m};}
test('eliminating the claw does not skip sabotage; arming and extraction finish mission',()=>{
 const {w,m}=setup();Object.assign(w.t,CORE);
 for(let i=0;i<39;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(w.done).toBe(false);expect(m.phase).toBe('arming');
 missionStep(w,m,T_IDLE,[0,0,0,0],true);expect(m.phase).toBe('escape');
 Object.assign(w.t,EXTRACTION);
 for(let i=0;i<20;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(w.winner).toBe('terminator');expect(m.phase).toBe('extracted');
});
test('leaving interaction resets arming and early extraction never wins',()=>{
 const {w,m}=setup();Object.assign(w.t,EXTRACTION);
 for(let i=0;i<65;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(w.done).toBe(false);Object.assign(w.t,CORE);
 for(let i=0;i<20;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 missionStep(w,m,T_IDLE,[0,0,0,0],false);expect(m.planted).toBe(0);
});
test('detonation is a loss and terminal states do not advance',()=>{
 const {w,m}=setup();m.phase='escape';m.remaining=.1;
 missionStep(w,m,T_IDLE,[0,0,0,0],false);expect(w.winner).toBe('pack');
 const tick=w.tick;missionStep(w,m,T_IDLE,[0,0,0,0],true);expect(w.tick).toBe(tick);
});
test('Genestealer attack has windup and can be evaded',()=>{
 const {w,m}=setup();const g=m.xenos[0];Object.assign(g,{hp:2,active:true,x:w.t.x+1.5,y:w.t.y});
 missionStep(w,m,T_IDLE,[0,0,0,0],false);expect(g.windup).toBe(6);expect(w.t.hp).toBe(30);
 w.t.y+=4;for(let i=0;i<6;i++)missionStep(w,m,T_IDLE,[0,0,0,0],false);
 expect(w.t.hp).toBe(30);
});
test('a Genestealer intercepts a bolt before a Night Lord behind it',()=>{
 const {w,m}=setup();w.t.x=3;w.t.y=12;w.t.facing=0;
 const n=w.nls[0];Object.assign(n,{alive:true,x:8,y:12,hp:3,cd:30});
 const g=m.xenos[0];Object.assign(g,{hp:2,x:5,y:12,active:false});
 missionStep(w,m,{...T_IDLE,bolt:true,aimPitch:-.12},[0,0,0,0],false);
 expect(g.hp).toBe(1);expect(n.hp).toBe(3);
});
test('a Genestealer actually damages armor after the telegraph',()=>{
 const {w,m}=setup();const g=m.xenos[0];Object.assign(g,{hp:2,active:true,x:w.t.x+1.5,y:w.t.y});
 for(let i=0;i<7;i++)missionStep(w,m,T_IDLE,[0,0,0,0],false);
 expect(w.t.hp).toBe(28);expect(w.events.some(e=>e.type==='hit')).toBe(true);
});
test('complete round trip uses movement, collision lanes and both interaction holds',()=>{
 const {w,m}=setup();Object.assign(w.t,{x:3,y:12,facing:0});
 const walk=(x:number,y:number)=>{let budget=400;while(Math.hypot(x-w.t.x,y-w.t.y)>.6 && budget--){missionStep(w,m,{...T_IDLE,fwd:1,aimYaw:Math.atan2(y-w.t.y,x-w.t.x)},[0,0,0,0],false);}expect(budget).toBeGreaterThan(0);};
 for(const [x,y] of [[10,12],[10,6],[62,6],[62,14],[67,14]])walk(x,y);
 for(let i=0;i<55;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(m.phase).toBe('escape');
 for(const [x,y] of [[62,14],[62,12],[3,12]])walk(x,y);
 for(let i=0;i<35;i++)missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(m.phase).toBe('extracted');expect(w.t.hp).toBe(30);
});
test('a creature hit interrupts the final tick of bomb arming',()=>{
 const {w,m}=setup();Object.assign(w.t,CORE);m.phase='arming';m.planted=39;
 Object.assign(m.xenos[0],{hp:2,x:CORE.x-1.5,y:CORE.y,active:true,windup:1});
 missionStep(w,m,T_IDLE,[0,0,0,0],true);
 expect(m.phase).toBe('infiltration');expect(m.planted).toBe(0);expect(w.t.hp).toBe(28);
});
test('death on the last extraction tick cannot become a victory',()=>{
 const {w,m}=setup();Object.assign(w.t,EXTRACTION);w.t.hp=2;m.phase='escape';m.extraction=19;
 Object.assign(m.xenos[0],{hp:2,x:EXTRACTION.x+1.5,y:EXTRACTION.y,active:true,windup:1});
 missionStep(w,m,T_IDLE,[0,0,0,0],true);expect(m.phase).toBe('lost');expect(w.winner).toBe('pack');
});
test('an active Genestealer navigates around ship pillars',()=>{
 const {w,m}=setup();w.t.x=28;w.t.y=12;
 const g=m.xenos[0];Object.assign(g,{hp:2,x:14,y:12,active:true});
 for(let i=0;i<200&&Math.hypot(g.x-w.t.x,g.y-w.t.y)>2;i++)missionStep(w,m,T_IDLE,[0,0,0,0],false);
 expect(Math.hypot(g.x-w.t.x,g.y-w.t.y)).toBeLessThan(2);
});
