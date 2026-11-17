import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {HunterMotion,attackEnvelope,stepDuration} from '../web/hunter-motion';
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
 for(const windup of [.4,.6]){expect(attackEnvelope(windup-.01,windup).strike).toBe(0);expect(attackEnvelope(windup+.1,windup).strike).toBeCloseTo(1);expect(attackEnvelope(windup+.45,windup).recover).toBe(1);}
 expect(stepDuration(6)).toBeLessThan(stepDuration(2));expect(stepDuration(100)).toBe(.17);
});
