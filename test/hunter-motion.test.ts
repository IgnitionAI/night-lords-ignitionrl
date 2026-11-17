import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {HunterMotion,attackEnvelope,stepDuration,hitOnCompletedTick} from '../web/hunter-motion';
import {parseGlb,measureHeight} from '../web/stride';
(globalThis as any).self=globalThis;
(globalThis as any).Image=class {width=1;height=1;onload:any;set src(_v:string){queueMicrotask(()=>this.onload?.());}};
async function hunter(){const m=await parseGlb(readFileSync('web/models/nightlord-refined.glb'));m.scene.scale.setScalar(2/measureHeight(m.scene));const group=new T.Group();group.add(m.scene);const motion=new HunterMotion(m.scene,false);return {group,motion,root:m.scene};}
test('grounded contacts remain fixed in world space through lateral motion and stops',async()=>{
 const {group,motion}=await hunter();let last:any;
 for(let i=0;i<240;i++){
  const t=i/60;group.position.x=t<1?0:t<3?(t-1)*2:4;group.updateMatrixWorld(true);motion.restore();motion.apply(1/60);const r=motion.report();
  if(last)r.feet.forEach((f,j)=>{if(f.contact&&last.feet[j].contact)expect(new T.Vector3(...f.position as [number,number,number]).distanceTo(new T.Vector3(...last.feet[j].position as [number,number,number]))).toBeLessThan(.035);});last=r;
 }
 expect(last.speed).toBe(0);expect(last.feet.every(f=>f.contact)).toBe(true);expect(last.contactError).toBeLessThan(.04);
});
test('sprint does not stretch the rig or depend on render frequency',async()=>{
 for(const fps of [30,60,120]){
  const {group,motion,root}=await hunter();
  for(let i=0;i<fps*3;i++){group.position.z=i/fps*6;group.updateMatrixWorld(true);motion.restore();motion.apply(1/fps);}
  expect(motion.report().speed).toBeCloseTo(6,4);
  for(const side of ['Left','Right']){
   const up=root.getObjectByName(side+'UpLeg')!,foot=root.getObjectByName(side+'Foot')!;
   expect(up.getWorldPosition(new T.Vector3()).distanceTo(foot.getWorldPosition(new T.Vector3()))).toBeLessThan(1.0);
  }
  expect(motion.report().contactError).toBeLessThan(.14);
 }
});
test('attack anticipation cannot precede the actual windup and recovers to guard',()=>{
 for(const windup of [.4,.6]){expect(attackEnvelope(windup-.19,windup).strike).toBe(0);expect(attackEnvelope(windup,windup).strike).toBeCloseTo(1);expect(attackEnvelope(windup+.45,windup).recover).toBe(1);}
 expect(stepDuration(6)).toBeLessThan(stepDuration(2));expect(stepDuration(100)).toBe(.17);
});

test('reversals do not leave a planted foot behind or snap the facing',async()=>{
 const {group,motion}=await hunter();
 for(let i=0;i<360;i++){
  const t=i/60;group.position.x=t<2?t*2:t<4?4-(t-2)*2:0;
  const prev=group.rotation.y;group.rotation.y=motion.facing(t<2?0:Math.PI,1/60);expect(Math.abs(group.rotation.y-prev)).toBeLessThan(.101);
  group.updateMatrixWorld(true);motion.restore();motion.apply(1/60);
 }
 expect(motion.report().contactError).toBeLessThan(.08);
});

test('fast lateral dodges and rapidly changing directions release contacts before overextension',async()=>{
 const {group,motion}=await hunter();
 for(let i=0;i<600;i++){
  const heading=Math.floor(i/15)*1.8;group.position.x+=Math.cos(heading)*8/60;group.position.z+=Math.sin(heading)*8/60;
  group.rotation.y=motion.facing(-heading,1/60);group.updateMatrixWorld(true);motion.restore();motion.apply(1/60);
 }
 expect(motion.report().contactError).toBeLessThan(.08);
});

test('a real armoured duel hit triggers a visual reaction even without simulation stun',async()=>{
 const {newWorld,step,T_IDLE}=await import('../src/sim');
 const w=newWorld(527,{x:4,y:12,facing:0},{fps:true,eliteDuel:true});
 w.nls.forEach((n,i)=>{n.alive=i===0;n.x=8;n.y=12;});
 step(w,{...T_IDLE,bolt:true,aimPitch:-.1},[0,0,0,0]);
 expect(w.nls[0].hp).toBeLessThan(24);expect(w.nls[0].stunTicks).toBe(0);
 const hit=hitOnCompletedTick(w.nls[0].lastDamageTick,w.tick);expect(hit).toBe(true);
 expect(hitOnCompletedTick(w.nls[0].lastDamageTick,w.tick+1)).toBe(false);
 const {motion}=await hunter();motion.signal({arm:0,shot:0,windup:.4,impact:false,fire:false,hit,dodge:false});motion.apply(.07);
 expect(motion.report().state).toBe('hit');
});

test('strike and interrupted preparation blend continuously with grounded feet',async()=>{
 for(const interrupted of [false,true]){
  const {root,motion}=await hunter();let last:T.Vector3|undefined,maxJump=0;
  for(let i=0;i<70;i++){
   if(i===0)motion.signal({arm:4,shot:0,windup:.4,impact:false,fire:false,hit:false,dodge:false});
   if(interrupted&&i===12)motion.signal({arm:0,shot:0,windup:.4,impact:false,fire:false,hit:true,dodge:false});
   if(!interrupted&&i===24)motion.signal({arm:0,shot:0,windup:.4,impact:true,fire:false,hit:false,dodge:false});
   motion.restore();motion.apply(1/60);const hand=root.getObjectByName('RightHand')!.getWorldPosition(new T.Vector3());
   if(last)maxJump=Math.max(maxJump,last.distanceTo(hand));last=hand;
  }
  expect(maxJump).toBeLessThan(.16);expect(motion.report().state).toBe('idle');expect(motion.report().contactError).toBeLessThan(.03);
 }
});
