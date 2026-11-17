import {t,onLocaleChange} from './i18n';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CORE, EXTRACTION, type Mission } from '../src/mission';

/** Mission props share geometry; creature limbs are articulated rather than sliding capsules. */
export function missionScene(scene: THREE.Scene) {
  const metal=new THREE.MeshStandardMaterial({color:0x293644,metalness:.7,roughness:.55});
  const glow=new THREE.MeshStandardMaterial({color:0x68d9dc,emissive:0x22aabb,emissiveIntensity:2});
  const core=new THREE.Group();core.position.set(CORE.x,0,CORE.y);scene.add(core);
  for(let i=0;i<5;i++) { const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3,.13,8,32),metal);ring.rotation.x=Math.PI/2;ring.position.y=.4+i*.85;core.add(ring); }
  const fuel=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,4.4,24),glow);fuel.position.y=2.3;core.add(fuel);
  const bomb=new THREE.Mesh(new THREE.BoxGeometry(.5,.7,.25),new THREE.MeshStandardMaterial({color:0x8b742e,roughness:.7}));bomb.position.set(-1.2,.6,0);core.add(bomb);
  const lamp=new THREE.PointLight(0x40c9dd,8,10);lamp.position.y=2.8;core.add(lamp);
  const exit=new THREE.Mesh(new THREE.TorusGeometry(1.5,.12,8,32),glow);exit.position.set(EXTRACTION.x,.15,EXTRACTION.y);exit.rotation.x=Math.PI/2;scene.add(exit);
  const flesh=new THREE.MeshStandardMaterial({color:0x89516c,roughness:.82});
  const sphere=new THREE.SphereGeometry(1,12,8);
  const bodies=Array.from({length:6},()=>{const g=new THREE.Group();scene.add(g);return g;});
  const actors:{mixer:THREE.AnimationMixer,actions:Record<string,THREE.AnimationAction>,current:string,hp:number}[]=[];
  let lastTime=0;
  new GLTFLoader().load('/web/models/genestealer.glb',gltf=>{
    // Preserve vertical motion, remove horizontal root travel: simulation owns collisions.
    const clips=gltf.animations.map(source=>{const c=source.clone();for(const t of c.tracks){
      if(t.name.includes('Hips')&&t.name.endsWith('.position'))for(let k=0;k<t.values.length;k+=3){t.values[k]=t.values[0];t.values[k+2]=t.values[2];}
    }return c;});
    gltf.scene.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3());
    const scale=2.1/box.getSize(new THREE.Vector3()).y;
    bodies.forEach((body,i)=>{
      const root=clone(gltf.scene);root.scale.multiplyScalar(scale);root.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
      root.traverse((o:any)=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});body.add(root);
      const mixer=new THREE.AnimationMixer(root),actions:Record<string,THREE.AnimationAction>={};
      clips.forEach(c=>{const a=mixer.clipAction(c);if(['slash','hurt','fall'].includes(c.name)){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;}actions[c.name]=a;});
      actors[i]={mixer,actions,current:'',hp:2};
    });
    scene.userData.genestealersLoaded=6;
  },undefined,error=>{scene.userData.genestealerError=String(error);console.error('Genestealer model',error);});
  const nodules=new THREE.InstancedMesh(sphere,flesh,60), matrix=new THREE.Matrix4();
  for(let i=0;i<60;i++){const x=7+(i*7.31)%31,z=i%2?.65:23.35,y=.1+(i%6)*.28;
    matrix.compose(new THREE.Vector3(x,y,z),new THREE.Quaternion(),new THREE.Vector3(.2+(i%4)*.08,.2,.25));nodules.setMatrixAt(i,matrix);}
  scene.add(nodules);
  for(const [x,z,label] of [[3,12,'SAS 01 · EXTRACTION'],[22,1,'PONT ÉVENTRÉ'],[36.5,12,'NOYAU · CHARGE']] as const){
    const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!,texture=new THREE.CanvasTexture(c);const paint=()=>{ctx.fillStyle='#101b21';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#a48c4e';ctx.strokeRect(3,3,506,90);ctx.font='24px monospace';ctx.fillStyle='#d2c58f';ctx.textAlign='center';ctx.fillText(t(label),256,57);texture.needsUpdate=true;};paint();onLocaleChange(paint);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.52),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));sign.position.set(x,3.4,z);sign.rotation.y=Math.PI/2;scene.add(sign);
  }
  return (m:Mission,time:number,tx:number,ty:number)=> {
    glow.emissive.setHex(m.phase==='escape'?0xdd3e18:0x22aabb);
    lamp.color.setHex(m.phase==='escape'?0xff5020:0x40c9dd);
    lamp.intensity=6+Math.sin(time*(m.phase==='escape'?6:2))*1.5;
    bomb.visible=m.phase==='escape'||m.phase==='extracted';
    const dt=Math.max(0,Math.min(.15,time-lastTime));const reset=time<lastTime;lastTime=time;
    m.xenos.forEach((g,i)=>{const r=bodies[i],a=actors[i];r.position.set(g.x,0,g.y);
      if(g.hp>0)r.rotation.y=Math.atan2(tx-g.x,ty-g.y);
      if(!a)return;
      if(reset){a.mixer.stopAllAction();a.current='';a.hp=2;}
      const hurt=g.hp<a.hp&&g.hp>0;a.hp=g.hp;
      let desired=g.hp<=0?'fall':g.windup>0?'slash':hurt?'hurt':g.active&&!g.cooldown?'run':'walk';
      if(a.current==='hurt'&&a.actions.hurt.isRunning()&&!hurt&&g.hp>0)desired='hurt';
      if(desired!==a.current){const old=a.actions[a.current],next=a.actions[desired];next.reset().fadeIn(.12).play();old?.fadeOut(.12);a.current=desired;}
      // Dormant creatures hold a crouched pose; paused gameplay freezes all skeletons.
      a.actions.walk.timeScale=g.active?.65:0;
      a.actions.run.timeScale=1.2;
      a.actions.slash.timeScale=1.6;
      a.mixer.update(dt);
    });
  };
}
