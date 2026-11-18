import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { retargetArmorClip } from './armor-retarget';

type Model={scene:THREE.Object3D;animations:THREE.AnimationClip[]};
let template:Promise<Model>|undefined;
/** Share high-resolution textures and geometry; keep skeletons and materials independent. */
export async function refinedArmor(source:Model,clips:THREE.AnimationClip[],load:(url:string)=>Promise<Model>) {
  template??=load('/web/models/nightlord-refined.glb');
  const asset=await template;const scene=clone(asset.scene);
  scene.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;mesh.material=Array.isArray(mesh.material)?mesh.material.map(m=>m.clone()):mesh.material.clone();});
  scene.userData.refinedArmor=true;
  const required=['Hips','Head','LeftHand','RightHand','LeftFoot','RightFoot'];
  for(const name of required)if(!scene.getObjectByName(name))throw new Error(`Refined armor missing ${name}`);
  return {scene,animations:clips.map(c=>retargetArmorClip(source.scene,scene,c))};
}

export function finishArmorShader(shader:{fragmentShader:string}) {
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.48);');
}

export function finishArmorMaterial(mat:THREE.MeshStandardMaterial) {
  // Keep the authored paint/metal masks; uniform metalness made paint look like foil.
  mat.onBeforeCompile=finishArmorShader;
  mat.customProgramCacheKey=()=>'refined-armor-satin-v1';
  mat.color.setHex(0xffffff);
  mat.metalness=mat.metalnessMap?1:.35;
  mat.roughness=mat.roughnessMap?.image?.width ? .9:.62;
  mat.normalScale?.setScalar(.65);
  mat.envMapIntensity=.4;
  if(mat.map)mat.map.anisotropy=4;
}
