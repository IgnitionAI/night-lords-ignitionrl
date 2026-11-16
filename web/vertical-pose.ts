import * as THREE from 'three';
import type {NL} from '../src/sim';
type PoseCache={bones:Map<string,THREE.Bone>;saved:Map<THREE.Bone,THREE.Quaternion>};
const caches=new WeakMap<THREE.Object3D,PoseCache>();
function cache(root:THREE.Object3D){let c=caches.get(root);if(!c){c={bones:new Map(),saved:new Map()};root.traverse(o=>{if((o as THREE.Bone).isBone)c!.bones.set(o.name,o as THREE.Bone);});caches.set(root,c);}return c;}
/** Undo previous post-mixer overrides before animation sampling; prevents accumulating rotations. */
export function restoreVerticalPose(root:THREE.Object3D){const c=cache(root);for(const [b,q]of c.saved)b.quaternion.copy(q);c.saved.clear();}
function save(c:PoseCache,b:THREE.Bone){if(!c.saved.has(b))c.saved.set(b,b.quaternion.clone());}
function reach(root:THREE.Object3D,c:PoseCache,side:string,target:THREE.Vector3,weight:number){
 const arm=c.bones.get(side+'Arm'),fore=c.bones.get(side+'ForeArm'),hand=c.bones.get(side+'Hand');if(!arm||!fore||!hand)return;
 for(let k=0;k<4;k++)for(const joint of [fore,arm]){
  save(c,joint);root.updateWorldMatrix(true,true);
  const origin=joint.getWorldPosition(new THREE.Vector3()),tip=hand.getWorldPosition(new THREE.Vector3());
  const from=tip.sub(origin).normalize(),to=target.clone().sub(origin).normalize();
  const delta=new THREE.Quaternion().setFromUnitVectors(from,to),world=joint.getWorldQuaternion(new THREE.Quaternion());
  const parent=joint.parent!.getWorldQuaternion(new THREE.Quaternion());
  const desired=parent.invert().multiply(delta.multiply(world));joint.quaternion.slerp(desired,weight);
 }
}
/** Hands reach the actual overhead rail; knees tuck and alternate on traversals. */
export function applyVerticalPose(root:THREE.Object3D,n:NL,time:number){
 if(!n.alive||!n.vertical)return;const c=cache(root),v=n.vertical;
 const weight=v.phase==='drop'?Math.min(1,(n.height??0)/2):Math.min(1,(n.height??0)/.5);
 const moving=v.phase==='climb'||v.phase==='traverse';
 for(const [side,sign]of [['Left',1],['Right',-1]] as const){
  const cycle=moving?Math.sin(time*7+sign*Math.PI/2):0;
  const reachY=v.phase==='climb'?(n.height??0)+2.45:5.4;
  const target=new THREE.Vector3(n.x-Math.sin(n.facing)*sign*.4+Math.cos(n.facing)*cycle*.22,reachY,n.y+Math.cos(n.facing)*sign*.4+Math.sin(n.facing)*cycle*.22);
  reach(root,c,side,target,weight*.65);
  for(const [suffix,angle]of [['UpLeg',-.55+cycle*.18],['Leg',1.05-cycle*.15]] as const){const b=c.bones.get(side+suffix);if(!b)continue;save(c,b);b.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angle*weight,0,0)));}
 }
 root.updateWorldMatrix(true,true);
}
