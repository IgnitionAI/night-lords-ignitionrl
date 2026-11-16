import * as THREE from 'three';
import {SHIP_WELLS,SHIP_MACHINES} from '../src/ship-fittings';
/** A grated service bridge crosses the coolant sumps at normal deck height. */
export function installShipFittings(scene:THREE.Scene){
 const steel=new THREE.MeshStandardMaterial({color:0x53616a,metalness:.75,roughness:.4});
 const hazard=new THREE.MeshStandardMaterial({color:0xbd8839,metalness:.5,roughness:.55});
 const dark=new THREE.MeshStandardMaterial({color:0x151d24,metalness:.6,roughness:.65});
 const coolant=new THREE.MeshStandardMaterial({color:0x164748,emissive:0x12545b,emissiveIntensity:.5,metalness:.4,roughness:.25});
 const box=(x:number,y:number,z:number,sx:number,sy:number,sz:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;};
 for(const b of SHIP_WELLS){
  const x=(b.x0+b.x1)/2,z=(b.y0+b.y1)/2,w=b.x1-b.x0,d=b.y1-b.y0;
  box(x,-.9,z,w,.12,d,coolant);
  for(const side of [-1,1]){
   box(x,-.45,z+side*d/2,w,.9,.12,dark);box(x+side*w/2,-.45,z,.12,.9,d,dark);
   box(x,1.05,z+side*d/2,w,.12,.12,hazard);box(x+side*w/2,1.05,z,.12,.12,d,hazard);
   for(let k=0;k<=2;k++){box(b.x0+k*w/2,.5,z+side*d/2,.1,1,.1,steel);box(x+side*w/2,.5,b.y0+k*d/2,.1,1,.1,steel);}
  }
 }
 for(let z=22.8;z<26.3;z+=.18)box(40.4,.035,z,4.8,.055,.055,steel);
 for(const x of [38.2,42.6])box(x,.03,24.5,.12,.06,3.6,hazard);
 for(const b of SHIP_MACHINES){
  const x=(b.x0+b.x1)/2,z=(b.y0+b.y1)/2,w=b.x1-b.x0,d=b.y1-b.y0;
  box(x,b.height/2,z,w,b.height,d,dark);
  for(let h=.4;h<b.height;h+=.4)box(x,h,b.y0-.02,w*.8,.08,.05,steel);
  box(x,b.height-.3,b.y0-.05,w*.65,.08,.07,coolant);
 }
}
