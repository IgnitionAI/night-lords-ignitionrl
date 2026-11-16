import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Wall and overhead dressing only: keep the duel's walking space unobstructed.
export function installDreadHull(scene:THREE.Scene,w:number,h:number) {
  const metal=new THREE.MeshStandardMaterial({color:0x303942,metalness:.75,roughness:.42});
  const rust=new THREE.MeshStandardMaterial({color:0x443329,metalness:.5,roughness:.72});
  const steel=new THREE.MeshStandardMaterial({color:0x687279,metalness:.85,roughness:.3});
  const meshes:THREE.Mesh[]=[];
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{
    const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;meshes.push(o);return o;
  };
  // Long pressure mains and bolted flanges, below the roof, at the perimeter.
  for(const z of [.48,h-.48]) for(let k=0;k<3;k++) {
    const pipe=add(new THREE.CylinderGeometry(.08+k*.025,.08+k*.025,w,12),metal,w/2,4.25+k*.24,z);
    pipe.rotation.z=Math.PI/2;
    for(let x=2;x<w;x+=4) {
      const flange=add(new THREE.CylinderGeometry(.14+k*.025,.14+k*.025,.09,12),rust,x,4.25+k*.24,z);flange.rotation.z=Math.PI/2;
    }
  }
  for(let x=2;x<w;x+=5) for(const z of [.18,h-.18]) {
    // Recessed service hatches, armored frames, vents and tactile warning strips.
    add(new THREE.BoxGeometry(1.65,2.5,.14),metal,x,1.7,z);
    add(new THREE.BoxGeometry(1.4,2.22,.17),rust,x,1.7,z);
    for(let j=0;j<7;j++) add(new THREE.BoxGeometry(1.16,.032,.23),metal,x,.95+j*.14,z);
    for(const dx of [-.67,.67]) for(const y of [.63,2.77]) add(new THREE.SphereGeometry(.035,6,4),steel,x+dx,y,z+(z<h/2?.12:-.12));
    const lamp=add(new THREE.BoxGeometry(.16,.05,.19),new THREE.MeshStandardMaterial({color:0x683521,emissive:0xff5724,emissiveIntensity:.65}),x+.48,2.6,z);
    lamp.name='service-indicator';
  }
  // Cable trays overhead, with loose curved leads. No screen-space smoke veil.
  for(const z of [h/2-2.3,h/2+2.3]) {
    add(new THREE.BoxGeometry(w,.12,.42),metal,w/2,5.15,z);
    for(let x=3;x<w;x+=7) {
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,5.12,z),new THREE.Vector3(x+.5,4.3,z+.15),new THREE.Vector3(x+1.3,4.05,z-.2),new THREE.Vector3(x+2,5.12,z)]);
      add(new THREE.TubeGeometry(curve,18,.022,6,false),rust,0,0,0);
    }
  }
  // Batch all static details by material to avoid hundreds of draw calls.
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const mesh of meshes) {
    mesh.updateMatrix(); const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const material=mesh.material as THREE.Material;
    const list=batches.get(material) ?? [];list.push(geometry);batches.set(material,list);
    mesh.geometry.dispose();
  }
  const group=new THREE.Group();group.name='dread-hull';
  for(const [material,parts] of batches) {
    const merged=mergeGeometries(parts);parts.forEach(p=>p.dispose());
    if(merged) {const mesh=new THREE.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
  }
  scene.add(group);
}

export function addNightLordTrophies(root:THREE.Object3D) {
  // Bone-local mounts keep the silhouette coherent through every imported clip.
  root.updateMatrixWorld(true);
  const iron=new THREE.MeshStandardMaterial({color:0x333b47,metalness:.8,roughness:.38});
  const ivory=new THREE.MeshStandardMaterial({color:0x948778,metalness:.08,roughness:.74});
  for(const name of ['LeftShoulder','RightShoulder']) {
    const bone=root.getObjectByName(name);if(!bone)continue;
    const scale=bone.getWorldScale(new THREE.Vector3()).x;
    const mount=new THREE.Group();mount.name='trophy-rack';mount.scale.setScalar(1/Math.max(.001,scale));
    mount.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())));
    for(let i=0;i<3;i++) {
      const spike=new THREE.Mesh(new THREE.ConeGeometry(.028,.19+i*.035,8),iron);
      spike.position.set((name==='LeftShoulder'?-1:1)*(.1+i*.065),.12,.015);spike.rotation.z=(name==='LeftShoulder'?1:-1)*(.2+i*.2);mount.add(spike);
    }
    const trophy=new THREE.Mesh(new THREE.SphereGeometry(.047,10,8),ivory);trophy.scale.set(.8,1, .8);trophy.position.set(0,-.10,.10);mount.add(trophy);
    for(const x of [-.017,.017]) {const eye=new THREE.Mesh(new THREE.SphereGeometry(.012,6,4),iron);eye.position.set(x,-.092,.135);mount.add(eye);}
    bone.add(mount);
  }
}
