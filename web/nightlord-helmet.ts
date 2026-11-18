import * as THREE from 'three';
import { wornMetalMap } from './camera/weapon-detail';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Metre-sized helmet, forward +Z. All details move as one rigid head attachment. */
export function buildNightLordHelmet() {
  const group=new THREE.Group();group.name='nightlord-bat-helmet';
  const blue=new THREE.MeshStandardMaterial({color:0x16366a,metalness:.65,roughness:.43});
  const trim=new THREE.MeshStandardMaterial({color:0x747b88,metalness:.82,roughness:.4});
  const dark=new THREE.MeshStandardMaterial({color:0x090e18,metalness:.5,roughness:.65});
  const crimson=new THREE.MeshStandardMaterial({color:0x64172b,metalness:.4,roughness:.53});
  const rib=new THREE.MeshStandardMaterial({color:0x30101e,metalness:.6,roughness:.45});
  const wear=wornMetalMap();if(wear){blue.map=wear;trim.map=wear;crimson.map=wear;}
  const eye=new THREE.MeshStandardMaterial({color:0xff2618,emissive:0xff1004,emissiveIntensity:2.8,roughness:.25});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;};
  const box=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number)=>add(new RoundedBoxGeometry(w,h,d,2,.009),mat,x,y,z);
  const shell=add(new THREE.SphereGeometry(1,24,16),blue,0,.12,0);shell.scale.set(.145,.185,.135);
  box(.13,.20,.035,blue,0,.185,.117); // central armoured brow and crown
  for(const s of [-1,1]) {
    const cheek=box(.085,.145,.075,blue,s*.105,.04,.095);cheek.rotation.z=s*.19;
    box(.105,.052,.042,dark,s*.068,.135,.126).rotation.z=s*.18;
    box(.079,.017,.012,eye,s*.067,.137,.151).rotation.z=s*.18;
    box(.112,.024,.044,trim,s*.07,.17,.13).rotation.z=s*.2;
    const ear=add(new THREE.CylinderGeometry(.046,.046,.04,16),trim,s*.143,.105,0);ear.rotation.z=Math.PI/2;
    // Swept, scalloped bat fins: a broad membrane, not a pair of thin horns.
    const shape=new THREE.Shape();shape.moveTo(.11,.17);shape.lineTo(.15,.34);shape.lineTo(.25,.55);shape.quadraticCurveTo(.21,.39,.30,.34);shape.lineTo(.34,.30);shape.quadraticCurveTo(.235,.31,.24,.23);shape.quadraticCurveTo(.18,.25,.18,.12);shape.closePath();
    const wing=add(new THREE.ExtrudeGeometry(shape,{depth:.024,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2,steps:1}),crimson,0,0,-.025);wing.scale.x=s;
    for(const points of [[[.12,.17],[.15,.34],[.25,.55]],[[.15,.26],[.21,.32],[.30,.34]],[[.14,.20],[.19,.25],[.24,.23]]]) {
      const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(s*x,y,.006)));
      add(new THREE.TubeGeometry(curve,12,.007,6,false),rib,0,0,0);
    }
    for(const y of [.02,.075])add(new THREE.SphereGeometry(.009,8,6),trim,s*.119,y,.139);
  }
  box(.11,.10,.075,trim,0,.045,.135); // armoured respirator
  box(.078,.061,.012,dark,0,.039,.177);
  for(let i=-2;i<=2;i++)box(.006,.052,.014,trim,i*.014,.039,.185);
  box(.045,.068,.04,trim,0,.108,.153).rotation.x=-.25;
  box(.12,.035,.07,blue,0,-.018,.1);
  const collar=add(new THREE.CylinderGeometry(.105,.12,.05,20),dark,0,-.045,0);
  collar.name='helmet-neck-seal';return group;
}

export function replaceNightLordHelmet(root:THREE.Object3D) {
  const head=root.getObjectByName('Head');if(!head)throw new Error('Night Lord head joint missing');
  root.updateMatrixWorld(true);
  let removed=0;
  const origin=head.getWorldPosition(new THREE.Vector3());
  const axes=root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const point=new THREE.Vector3();
  root.traverse(o=>{
    const mesh=o as THREE.SkinnedMesh;if(!mesh.isSkinnedMesh)return;
    const geo=mesh.geometry.clone(), joints=geo.getAttribute('skinIndex'),weights=geo.getAttribute('skinWeight');
    const headIds=new Set(mesh.skeleton.bones.map((b,i)=>/^(Head|head_end|headfront)$/i.test(b.name)?i:-1));headIds.delete(-1);
    const neckId=mesh.skeleton.bones.findIndex(b=>b.name.toLowerCase()==='neck');
    const isHead=(v:number)=>{let neckWeight=0;for(let k=0;k<4;k++)if(joints.getComponent(v,k)===neckId)neckWeight+=weights.getComponent(v,k);let weight=0;for(let k=0;k<4;k++)if(headIds.has(joints.getComponent(v,k)))weight+=weights.getComponent(v,k);if(weight>=.5)return true;
      // Some original crest membranes were weighted to neck, not Head.
      mesh.getVertexPosition(v,point);point.applyMatrix4(mesh.matrixWorld).sub(origin).applyQuaternion(axes);
      return weight+neckWeight>.15 && point.y>.13 && Math.abs(point.x)<.37 && Math.abs(point.z)<.23;};
    const old=geo.index;const count=old?.count??geo.getAttribute('position').count;const keep:number[]=[];
    for(let i=0;i<count;i+=3){const tri=[0,1,2].map(k=>old?old.getX(i+k):i+k);if(tri.filter(isHead).length>=2)removed++;else keep.push(...tri);}
    geo.setIndex(keep);mesh.geometry=geo;
  });
  if(!removed)throw new Error('No old helmet faces identified');
  const helmet=buildNightLordHelmet();
  // Use the model's forward/up axes in its bind pose, then inherit all head motion.
  helmet.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())));
  helmet.scale.setScalar(1/head.getWorldScale(new THREE.Vector3()).x);
  head.add(helmet);helmet.userData.removedFaces=removed;
  return helmet;
}
