import { readFileSync } from 'node:fs';
import * as T from 'three';
import { parseGlb, measureHeight, measureForwardStride } from '../web/stride';
class FakeImage {width=1;height=1;complete=true;onload:any;set src(v:string){queueMicrotask(()=>this.onload?.(null));}}
(globalThis as any).Image=FakeImage;(globalThis as any).self=globalThis;
for(const kind of ['idle','walk','run','attack','hit','death']) {
 const m=await parseGlb(readFileSync('web/models/NL-1.glb'));
 const c=await parseGlb(readFileSync(`web/models/NL-1-${kind}.glb`));
 m.scene.scale.setScalar(2/measureHeight(m.scene));
 const before=m.scene.getObjectByName('Hips')!; console.log('before',before.scale.toArray(),before.position.toArray()); if(kind==='walk'||kind==='run') measureForwardStride(m.scene,c.animations[0]); console.log('after',before.scale.toArray(),before.position.toArray()); const mix=new T.AnimationMixer(m.scene);const a=mix.clipAction(c.animations[0]);a.play();
 const rows=[];for(let i=0;i<4;i++){mix.update(c.animations[0].duration/5);m.scene.updateMatrixWorld(true);m.scene.traverse((o:any)=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});const box=new T.Box3().setFromObject(m.scene);rows.push(box.getSize(new T.Vector3()).toArray().map(x=>+x.toFixed(2)));}
 console.log(kind,rows);
}
