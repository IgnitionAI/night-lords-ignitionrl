import * as THREE from 'three';

/** Transfer the existing performance, correcting for the new armor's rest pose and bone lengths. */
export function retargetArmorClip(source:THREE.Object3D,target:THREE.Object3D,clip:THREE.AnimationClip) {
  const tracks:THREE.KeyframeTrack[]=[];
  for(const input of clip.tracks) {
    const dot=input.name.lastIndexOf('.');const name=input.name.slice(0,dot),property=input.name.slice(dot+1);
    const from=source.getObjectByName(name),to=target.getObjectByName(name);
    if(!from||!to||(from as THREE.Bone).isBone!==true||(to as THREE.Bone).isBone!==true)continue;
    const track=input.clone();
    if(property==='quaternion') {
      const correction=to.quaternion.clone().multiply(from.quaternion.clone().invert());
      const q=new THREE.Quaternion();
      for(let i=0;i<track.values.length;i+=4){q.fromArray(track.values,i).premultiply(correction).normalize().toArray(track.values,i);}
    } else if(property==='position') {
      // Limbs keep their target lengths; only the pelvis carries translational motion.
      const ratio=from.position.length()>1e-5?to.position.length()/from.position.length():1;
      for(let i=0;i<track.values.length;i+=3)for(let k=0;k<3;k++)track.values[i+k]=to.position.getComponent(k)+(name==='Hips'?(input.values[i+k]-from.position.getComponent(k))*ratio:0);
    } else if(property==='scale')continue;
    tracks.push(track);
  }
  return new THREE.AnimationClip(clip.name,clip.duration,tracks,clip.blendMode);
}
