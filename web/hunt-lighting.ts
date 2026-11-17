import * as THREE from 'three';
import {circuitAt,isDark,type Circuit} from '../src/fps-lighting';
import type {World} from '../src/sim';

/** Existing ship lamps dim by circuit; night vision is a smooth visor gain, not enemy visibility cheating. */
export class HuntLights {
 private lamps:{light:THREE.Light;base:number}[]=[];
 private panels:{mesh:THREE.Mesh;material:THREE.MeshStandardMaterial}[]=[];
 private nv=0;private level=1;
 constructor(private scene:THREE.Scene,private helmet:THREE.PointLight|undefined){
  for(const child of scene.children)if((child as THREE.Light).isLight){const light=child as THREE.Light;this.lamps.push({light,base:light.intensity});}
 }
 update(w:World,dt:number){
  if(!w.lighting)return 0;
  if(!this.panels.length)for(const c of w.lighting.circuits){
   const material=new THREE.MeshStandardMaterial({color:0x27323a,metalness:.6,roughness:.55,emissive:0x72c6cf,emissiveIntensity:.65});
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(.22,1.25,.24),material);mesh.position.set(c.x,.625,c.y);this.scene.add(mesh);this.panels.push({mesh,material});
  }
  const factor=(c:Circuit|undefined)=>c&&c.blackoutUntil>w.tick?.06:c&&c.warningUntil>w.tick?.6:1;
  const local=factor(circuitAt(w,w.t.x,w.t.y));
  this.level+=(local-this.level)*(1-Math.exp(-9*dt));
  this.nv+=((w.lighting.nightVision?1:0)-this.nv)*(1-Math.exp(-7*dt));
  for(const {light,base} of this.lamps){
   const global=(light as THREE.AmbientLight).isAmbientLight||(light as THREE.HemisphereLight).isHemisphereLight||(light as THREE.DirectionalLight).isDirectionalLight;
   const amount=global?this.level:factor(circuitAt(w,light.position.x,light.position.z));
   light.intensity=base*Math.max(amount,global?this.nv*.72:0);
  }
  if(this.helmet){this.helmet.intensity=3.2*this.level+this.nv*4.8;this.helmet.color.setHex(this.nv>.5?0x9ed9cb:0xc8d4ee);}
  w.lighting.circuits.forEach((c,i)=>{const m=this.panels[i].material;m.emissive.setHex(c.warningUntil>w.tick?0xff8d35:c.blackoutUntil>w.tick?0x7b1a0a:0x72c6cf);m.emissiveIntensity=c.blackoutUntil>w.tick?.22:.65;});
  return this.nv;
 }
}
export function lightingMessage(w:World):string {
 const l=w.lighting;if(!l)return '';
 const c=circuitAt(w,w.t.x,w.t.y);
 if(c?.warningUntil&&c.warningUntil>w.tick)return 'SABOTAGE · COUPURE IMMINENTE';
 if(isDark(w,w.t.x,w.t.y))return l.nightVision?'VISION NOCTURNE · ACTIVE':'OBSCURITÉ · ADAPTATION DU VISEUR';
 if(c&&w.tick-c.restoredAt<28)return 'ÉCLAIRAGE RÉTABLI · ILS SE REPLIENT';
 return 'ÉCLAIRAGE STABLE · VISION NOCTURNE AUTO';
}
