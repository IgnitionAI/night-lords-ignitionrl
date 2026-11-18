import {test,expect} from 'bun:test';
import * as T from 'three';
import {retargetArmorClip} from '../web/armor-retarget';
test('armor retarget preserves target rest pose, limb lengths and source clip',()=>{
 const source=new T.Group(),target=new T.Group();
 for(const name of ['Hips','LeftArm']){const a=new T.Bone(),b=new T.Bone();a.name=b.name=name;a.position.y=2;b.position.y=3;a.rotation.z=.2;b.rotation.z=.6;source.add(a);target.add(b);}
 const a=source.getObjectByName('LeftArm')!,b=target.getObjectByName('LeftArm')!;
 const clip=new T.AnimationClip('walk',1,[new T.QuaternionKeyframeTrack('LeftArm.quaternion',[0,1],[...a.quaternion.toArray(),...a.quaternion.toArray()]),new T.VectorKeyframeTrack('LeftArm.position',[0,1],[0,2,0,0,2.1,0]),new T.VectorKeyframeTrack('Hips.position',[0,1],[0,2,0,1,2,0])]);
 const converted=retargetArmorClip(source,target,clip);
 const q=new T.Quaternion().fromArray(converted.tracks[0].values);
 expect(q.angleTo(b.quaternion)).toBeLessThan(.001);
 expect(Array.from(converted.tracks[1].values)).toEqual([0,3,0,0,3,0]);
 expect(Array.from(converted.tracks[2].values)).toEqual([0,3,0,1.5,3,0]);
 expect(clip.tracks[1].values[1]).toBe(2);
});
