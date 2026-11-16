import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function wornMetalMap(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b4b8bb';ctx.fillRect(0,0,512,512);
  let seed=87;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<2400;i++) {
    const x=rand()*512,y=rand()*512;
    ctx.strokeStyle=i%4===0?'rgba(240,245,250,.30)':'rgba(12,16,21,.25)';
    ctx.lineWidth=.5+rand();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2+rand()*17,y+rand()*3);ctx.stroke();
  }
  for(let i=0;i<90;i++){ctx.fillStyle='rgba(20,16,12,.10)';ctx.fillRect(rand()*512,rand()*512,5+rand()*30,2+rand()*8);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}

// Geometry in viewmodel metres, barrels looking down -Z. Distinct moving components.
export function buildSiegeBolter() {
  const root = new THREE.Group(); root.name = 'siege-bolter-machined';
  const steel = new THREE.MeshStandardMaterial({color:0x454951,metalness:.82,roughness:.34});
  const black = new THREE.MeshStandardMaterial({color:0x11151b,metalness:.65,roughness:.5});
  const blue = new THREE.MeshStandardMaterial({color:0x26374a,metalness:.72,roughness:.38});
  const brass = new THREE.MeshStandardMaterial({color:0x89734a,metalness:.8,roughness:.4});
  const wear=wornMetalMap();
  for(const material of [steel,blue,brass]) material.map=wear;
  const bore = new THREE.MeshBasicMaterial({color:0x020305});
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material)=>{
    const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,.006),m);o.position.set(x,y,z);root.add(o);return o;
  };
  const cylinder=(r:number,len:number,x:number,y:number,z:number,m:THREE.Material)=>{
    const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,20),m);o.rotation.x=Math.PI/2;o.position.set(x,y,z);root.add(o);return o;
  };
  box(.155,.12,.265,0,.015,-.035,black);
  box(.16,.048,.23,0,.071,-.035,blue);
  for(const s of [-1,1]) {
    box(.012,.088,.19,s*.084,.012,-.025,blue);
    box(.014,.012,.21,s*.087,.06,-.035,brass);
    for(let i=0;i<5;i++) box(.016,.042,.006,s*.09,.015,-.11+i*.032,steel);
    cylinder(.027,.21,s*.039,.017,-.25,steel);
    for(let j=0;j<5;j++) cylinder(.031,.009,s*.039,.017,-.19-j*.025,black);
    cylinder(.037,.045,s*.039,.017,-.377,steel);
    cylinder(.026,.002,s*.039,.017,-.401,bore);
    cylinder(.018,.003,s*.039,.017,-.403,black);
    cylinder(.014,.004,s*.039,.017,-.405,bore);
    for(let i=0;i<3;i++) box(.006,.014,.019,s*.075,.017,-.365-i*.012,black);
    for(let i=0;i<4;i++) {
      const bolt=new THREE.Mesh(new THREE.SphereGeometry(.0045,6,4),brass);
      bolt.position.set(s*.094,.047,-.10+i*.047); root.add(bolt);
    }
  }
  box(.10,.02,.20,0,-.054,-.025,steel);
  const magazine=box(.075,.15,.092,0,-.125,.01,black);magazine.name='removable-magazine';
  for(let i=0;i<4;i++) { const rib=new THREE.Mesh(new RoundedBoxGeometry(.079,.008,.096,2,.002),steel);rib.position.y=-.05+i*.032;magazine.add(rib); }
  box(.056,.014,.13,0,.104,-.04,black);
  for(let i=0;i<8;i++) box(.064,.008,.008,0,.115,-.10+i*.017,steel);
  box(.043,.043,.016,0,.125,.047,black);
  box(.022,.018,.018,0,.145,.047,brass);
  box(.018,.035,.018,0,.10,-.17,steel);
  box(.01,.005,.008,0,.121,-.17,new THREE.MeshBasicMaterial({color:0x9ca989}));
  const slide=box(.025,.038,.062,.094,.01,.08,steel);slide.name='cycling-bolt';
  box(.046,.105,.055,.012,-.1,.115,black);
  // Breach hazard inlay and fine machined wear, modelled rather than a flat icon.
  for(let i=0;i<5;i++) {const a=box(.003,.002,.028,-.055+i*.012,.098,.022,brass);a.rotation.y=-.3;}
  return {root,magazine,slide};
}

export function detailGauntlet(fist:THREE.Group) {
  const metal=new THREE.MeshStandardMaterial({color:0x737b84,metalness:.85,roughness:.3});
  const rubber=new THREE.MeshStandardMaterial({color:0x0c1016,metalness:.1,roughness:.85});
  const brass=new THREE.MeshStandardMaterial({color:0x85714b,metalness:.8,roughness:.38});
  for(const x of [-.077,.077]) {
    for(let i=0;i<8;i++) {
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.014,.003,6,12),rubber);
      ring.rotation.x=Math.PI/2;ring.position.set(x,-.1-i*.013,.075);fist.add(ring);
    }
    const piston=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.14,12),metal);
    piston.position.set(x,-.15,-.023);fist.add(piston);
    for(const y of [-.22,-.085]) {const end=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.025,12),brass);end.position.set(x,y,-.023);fist.add(end);}
  }
  fist.traverse(o=>{
    if(!o.name.startsWith('finger-'))return;
    for(const x of [-.021,.021]) {
      const axle=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.004,12),metal);
      axle.rotation.z=Math.PI/2;axle.position.set(x,0,0);o.add(axle);
    }
  });
  for(let i=0;i<5;i++) {
    const rib=new THREE.Mesh(new RoundedBoxGeometry(.12,.006,.008,2,.002),metal);
    rib.position.set(0,-.12-i*.023,.133);fist.add(rib);
  }
}
