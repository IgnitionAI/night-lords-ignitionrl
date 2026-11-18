import {readFileSync} from 'node:fs';import * as T from 'three';import {parseGlb,measureHeight,measureForwardStride} from '../web/stride';import {retargetArmorClip} from '../web/armor-retarget';
(globalThis as any).self=globalThis;(globalThis as any).Image=class {width=1;height=1;onload:any;set src(v:string){queueMicrotask(()=>this.onload?.());}};
console.error=()=>{};
const a=await parseGlb(readFileSync('web/models/NL-1.glb'));const b=await parseGlb(readFileSync('web/models/nightlord-refined.glb'));b.scene.scale.setScalar(2/measureHeight(b.scene));b.scene.rotation.y=Math.PI/2;
for(const name of ['Hips','Spine','Spine01','Spine02','LeftUpLeg','LeftLeg','LeftFoot','LeftArm','LeftForeArm','LeftHand']){const n=b.scene.getObjectByName(name)!;console.log(name,n.position.toArray(),n.quaternion.toArray(),n.getWorldPosition(new T.Vector3()).toArray());}
for(const f of ['NL-1-walk.glb','NL-1-run.glb','NL-1-idle.glb','NL-1-attack.glb','NL-1-hit.glb']){
 try{const c=await parseGlb(readFileSync('web/models/'+f));const clip=retargetArmorClip(a.scene,b.scene,c.animations[0]);const stride=measureForwardStride(b.scene,clip);console.log(f,clip.duration,stride.stride);const m=new T.AnimationMixer(b.scene),act=m.clipAction(clip).play();for(const t of [0,.2,.4,.6,.8]){m.setTime(t*clip.duration);b.scene.updateMatrixWorld(true);console.log(t,['Hips','Head','LeftFoot','RightFoot','LeftHand','RightHand'].map(n=>[n,b.scene.getObjectByName(n)!.getWorldPosition(new T.Vector3()).toArray().map(v=>+v.toFixed(2))]));}m.stopAllAction();}
 catch(e){console.log(f,String(e));}
}
