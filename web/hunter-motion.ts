/** FPS presentation only. Contacts follow rendered displacement, never drive the simulation.
 * Existing armor, skeleton, equipment and death/climbing performances remain intact.
 */
import * as T from 'three';
const V=()=>new T.Vector3();
const clamp=T.MathUtils.clamp;
const smooth=(x:number)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export const hitOnCompletedTick=(damageTick:number|undefined,completedTick:number)=>damageTick!==undefined&&damageTick===completedTick-1;
export const stepDuration=(speed:number)=>clamp(.32-speed*.023,.17,.32);
export const attackEnvelope=(age:number,windup:number)=>({
  prepare:smooth(age/Math.max(.15,windup-.20)),
  strike:smooth((age-windup+.18)/.18),
  recover:smooth((age-windup-.06)/.32),
});
type Pose={bone:T.Object3D;p:T.Vector3;q:T.Quaternion};
type Foot={bone:T.Object3D;up:T.Object3D;mid:T.Object3D;side:number;anchor:T.Vector3;from:T.Vector3;to:T.Vector3;phase:number;duration:number;lift:number;orientation:T.Quaternion;contact:boolean};
export type HunterSignal={arm:number;shot:number;impact:boolean;fire:boolean;hit:boolean;windup:number;dodge:boolean};

/** Analytical two-bone solve, using world-space poles instead of assumptions about imported bone axes. */
export function solveLimb(up:T.Object3D,mid:T.Object3D,end:T.Object3D,target:T.Vector3,pole:T.Vector3){
  const a=up.getWorldPosition(V()),b=mid.getWorldPosition(V()),c=end.getWorldPosition(V());
  const l1=a.distanceTo(b),l2=b.distanceTo(c),axis=target.clone().sub(a),raw=axis.length();
  if(raw<1e-6||l1<1e-6||l2<1e-6)return;
  axis.normalize();const d=clamp(raw,Math.abs(l1-l2)+.001,l1+l2-.001);
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=pole.clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-6)bend.set(0,0,1).addScaledVector(axis,-axis.z);
  bend.normalize();const knee=a.clone().addScaledVector(axis,along).addScaledVector(bend,height);
  const aim=(bone:T.Object3D,child:T.Object3D,dest:T.Vector3)=>{
    const origin=bone.getWorldPosition(V());const from=child.getWorldPosition(V()).sub(origin).normalize();
    const to=dest.clone().sub(origin).normalize();
    const world=bone.getWorldQuaternion(new T.Quaternion()).premultiply(new T.Quaternion().setFromUnitVectors(from,to));
    const parent=bone.parent!.getWorldQuaternion(new T.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(world));bone.updateWorldMatrix(false,true);
  };
  aim(up,mid,knee);aim(mid,end,a.addScaledVector(axis,d));
}
function setWorldQ(bone:T.Object3D,q:T.Quaternion){bone.quaternion.copy(bone.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}

export class HunterMotion {
  private rest:Pose[]=[]; private mixed:Pose[]=[];
  private feet:Foot[]=[]; private hips:T.Object3D;private spine:T.Object3D;private head:T.Object3D;
  private origin=V();private rotation=new T.Quaternion();private last=V();private velocity=V();
  private initialized=false;private elapsed=0;private activeFoot=-1;private nextFoot=0;
  private canceledAt:number|null=null;private cancelAge=0;
  private attackAge=99;private shotAge=99;private hitAge=99;private windup=.4;
  private preparing=false;private aiming=false;private dodge=0;private distance=0;
  private aimBlend=0;private dodgeBlend=0;private yaw:number|null=null;
  private arms:{up:T.Object3D;mid:T.Object3D;hand:T.Object3D;side:number;orientation:T.Quaternion}[]=[];
  public state='idle';public contactError=0;
  constructor(private root:T.Object3D,private ranged:boolean,readyClip?:T.AnimationClip){
    root.updateWorldMatrix(true,true);
    const q=root.getWorldQuaternion(new T.Quaternion()).invert();
    root.traverse(bone=>{if((bone as T.Bone).isBone)this.rest.push({bone,p:bone.position.clone(),q:bone.quaternion.clone()});});
    const bone=(name:string)=>root.getObjectByName(name)!;
    this.hips=bone('Hips');this.spine=bone('Spine02');this.head=bone('Head');
    for(const [name,side] of [['Left',1],['Right',-1]] as const){
      const foot=bone(name+'Foot'),hand=bone(name+'Hand');
      this.feet.push({bone:foot,up:bone(name+'UpLeg'),mid:bone(name+'Leg'),side,anchor:V(),from:V(),to:V(),phase:1,duration:.25,lift:.08,orientation:q.clone().multiply(foot.getWorldQuaternion(new T.Quaternion())),contact:true});
      this.arms.push({up:bone(name+'Arm'),mid:bone(name+'ForeArm'),hand,side,orientation:q.clone().multiply(hand.getWorldQuaternion(new T.Quaternion()))});
    }
    // Match the equipment's authored grip reference, not its unrelated bind pose.
    if(readyClip){
      const mixer=new T.AnimationMixer(root);mixer.clipAction(readyClip).play();mixer.update(1.2);root.updateWorldMatrix(true,true);
      for(const arm of this.arms)arm.orientation.copy(q).multiply(arm.hand.getWorldQuaternion(new T.Quaternion()));
      mixer.stopAllAction();mixer.uncacheRoot(root);
      for(const p of this.rest){p.bone.position.copy(p.p);p.bone.quaternion.copy(p.q);}
    }
  }
  facing(target:number,dt:number){
    if(this.yaw===null)this.yaw=target;
    const error=Math.atan2(Math.sin(target-this.yaw),Math.cos(target-this.yaw));
    this.yaw+=clamp(error,-6*dt,6*dt);return this.yaw;
  }
  reset(){this.restore();this.initialized=false;this.elapsed=0;this.attackAge=this.shotAge=this.hitAge=99;this.canceledAt=null;this.cancelAge=0;this.preparing=this.aiming=false;this.activeFoot=-1;this.nextFoot=0;this.yaw=null;this.aimBlend=this.dodgeBlend=0;this.contactError=0;}
  signal(s:HunterSignal){
    if(s.arm>0&&!this.preparing){this.attackAge=0;this.canceledAt=null;this.cancelAge=0;this.windup=s.windup;}
    if(this.preparing&&s.arm===0&&!s.impact&&s.hit){this.canceledAt=this.attackAge;this.cancelAge=0;}
    this.preparing=s.arm>0;this.aiming=s.shot>0;
    // Impact is authoritative: the visual swing cannot run early or postpone damage.
    if(s.impact)this.attackAge=this.windup;
    if(s.fire)this.shotAge=0;
    if(s.hit)this.hitAge=0;
    this.dodge=s.dodge?1:0;
  }
  restore(){for(const p of this.mixed){p.bone.position.copy(p.p);p.bone.quaternion.copy(p.q);}this.mixed=[];}
  suspend(){this.restore();this.initialized=false;}
  private point(x:number,y:number,z:number){return new T.Vector3(x,y,z).applyQuaternion(this.rotation).add(this.origin);}
  apply(dt:number){
    if(dt<=0&&this.initialized)return;
    this.mixed=this.rest.map(p=>({bone:p.bone,p:p.bone.position.clone(),q:p.bone.quaternion.clone()}));
    for(const p of this.rest){p.bone.position.copy(p.p);p.bone.quaternion.copy(p.q);}
    this.root.updateWorldMatrix(true,true);this.root.getWorldPosition(this.origin);this.root.getWorldQuaternion(this.rotation);
    const delta=this.origin.clone().sub(this.last);delta.y=0;
    if(!this.initialized||delta.length()>2){
      this.velocity.set(0,0,0);this.last.copy(this.origin);this.activeFoot=-1;
      for(const f of this.feet){f.anchor.copy(this.point(f.side*.24,.20,f.side*.05));f.phase=1;}
      this.initialized=true;
    }else if(dt>0){this.velocity.copy(delta).divideScalar(dt);this.distance+=delta.length();}
    this.last.copy(this.origin);this.elapsed+=dt;this.attackAge+=dt;this.cancelAge+=dt;this.shotAge+=dt;this.hitAge+=dt;
    if(this.preparing)this.attackAge=Math.min(this.attackAge,this.windup-.001);
    const aimTarget=this.aiming||this.shotAge<.2?1:0;
    this.aimBlend+=(aimTarget-this.aimBlend)*(1-Math.exp(-14*dt));
    this.dodgeBlend+=(this.dodge-this.dodgeBlend)*(1-Math.exp(-18*dt));
    const hit=this.hitAge<.32?Math.sin(Math.PI*clamp(this.hitAge/.07,0,1)/2)*(1-smooth((this.hitAge-.07)/.25)):0;
    const recoil=this.shotAge<.22?(1-smooth(this.shotAge/.22))*.065:0;
    const attack=attackEnvelope(this.canceledAt??this.attackAge,this.windup),weight=(1-attack.recover)*(this.canceledAt===null?1:1-smooth(this.cancelAge/.16));
    const coil=attack.prepare*(1-attack.strike)*weight,cut=attack.strike*weight;
    const speed=this.velocity.length();const localV=this.velocity.clone().applyQuaternion(this.rotation.clone().invert());
    const moving=speed>.12;
    this.state=hit>.1?'hit':weight>.01&&this.attackAge<2?'attack':this.aimBlend>.5?'shoot':moving?(speed>3?'run':'walk'):'idle';
    const hipsWorld=this.hips.getWorldPosition(V());
    // One pelvis reference for every grounded state. Only a restrained weight transfer changes its height.
    const settle=moving?.014*Math.cos(this.distance*6):.003*Math.sin(this.elapsed*2.1);
    hipsWorld.copy(this.point(0,1.04+settle-.022*hit-.035*this.dodgeBlend-.02*coil,.025*cut));
    this.hips.position.copy(this.hips.parent!.worldToLocal(hipsWorld));
    this.spine.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(clamp(localV.z*.009,-.035,.06)-hit*.14+cut*.07-recoil*.7,coil*-.20+cut*.24,clamp(-localV.x*.009,-.045,.045))));
    this.head.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(hit*.07,-coil*-.14-cut*.16,0)));
    this.root.updateWorldMatrix(true,true);
    // Feet remain in world space through translations and facing changes. Only the swinging foot moves.
    const duration=stepDuration(speed);
    const homes=this.feet.map(f=>this.point(f.side*.24,.20,f.side*.05));
    this.activeFoot=this.feet.findIndex(f=>f.phase<1);
    if(this.activeFoot<0){
      const errors=this.feet.map((f,i)=>Math.hypot(f.anchor.x-homes[i].x,f.anchor.z-homes[i].z));
      let pick=this.nextFoot;
      if(errors[pick]<.09&&errors[1-pick]>errors[pick])pick=1-pick;
      if(errors[pick]>(moving?.12:.10)){
        const f=this.feet[pick];f.from.copy(f.anchor);f.to.copy(homes[pick]);
        const support=this.feet[1-pick].anchor.clone().sub(this.origin);
        const ahead=moving?support.dot(this.velocity.clone().normalize()):0;
        const available=moving?clamp((.48+ahead)/speed,.065,duration):duration;
        if(moving)f.to.addScaledVector(this.velocity,available*1.45);
        f.phase=0;f.duration=available;f.lift=clamp(.055+speed*.012,.055,.13);this.activeFoot=pick;this.nextFoot=1-pick;
      }
    }
    for(let i=0;i<2;i++){
      const f=this.feet[i];let target=f.anchor.clone();
      // At sprint speed or an abrupt evasive turn, release a loaded foot before the leg overextends.
      // This permits a short flight phase; an airborne foot must never be reported as planted.
      if(f.phase>=1&&Math.hypot(f.anchor.x-homes[i].x,f.anchor.z-homes[i].z)>.44){
        f.from.copy(f.anchor);f.to.copy(homes[i]).addScaledVector(this.velocity,.13);
        f.phase=0;f.duration=Math.min(.14,duration);f.lift=.10;
      }
      if(f.phase<1){
        f.phase=Math.min(1,f.phase+dt/f.duration);
        // Replan the landing during a reversal; never finish a stride in the old travel direction.
        const landing=homes[i].clone();
        if(moving)landing.addScaledVector(this.velocity,f.duration*(1-f.phase+.45));
        f.to.lerp(landing,1-Math.exp(-24*dt));
        target.copy(f.from).lerp(f.to,smooth(f.phase));target.y+=Math.sin(Math.PI*f.phase)*f.lift;
        if(f.phase>=1){f.anchor.copy(f.to);this.activeFoot=-1;}
      }
      f.contact=f.phase>=1;
      solveLimb(f.up,f.mid,f.bone,target,this.point(f.side*.27,.65,.8));
      setWorldQ(f.bone,this.rotation.clone().multiply(f.orientation));
      this.contactError=Math.max(this.contactError,f.contact?f.bone.getWorldPosition(V()).distanceTo(target):0);
    }
    // Guard: small counter-motion, elbows controlled, gaze level. Weapons keep their imported grip.
    const bob=moving?Math.sin(this.distance*4.8)*.022:Math.sin(this.elapsed*1.8)*.004;
    for(const arm of this.arms){
      const hand=new T.Vector3(arm.side*.36,1.28,.23+arm.side*bob);
      if(arm.side===-1){
        // Right weapon: draw back, committed diagonal cut, then recover into the same guard.
        hand.lerp(new T.Vector3(-.42,1.59,.02),coil);
        hand.lerp(new T.Vector3(-.05,1.24,.46),cut);
        if(this.ranged)hand.lerp(new T.Vector3(-.27,1.43,.53-recoil),this.aimBlend*(1-weight));
      }else{
        hand.lerp(new T.Vector3(.28,1.39,.30),Math.min(1,coil+cut)*.6);
        hand.lerp(this.ranged?new T.Vector3(.16,1.34,.49-recoil):new T.Vector3(.26,1.43,.53-recoil),this.aimBlend*(1-weight));
      }
      hand.z-=hit*.055;
      const target=this.point(hand.x,hand.y,hand.z);
      solveLimb(arm.up,arm.mid,arm.hand,target,this.point(arm.side*.65,1.18,-.08));
      const wrist=new T.Quaternion().setFromEuler(new T.Euler(arm.side===-1?-.38*coil+.6*cut:0,0,arm.side===-1?.15*coil-.3*cut:0));
      setWorldQ(arm.hand,this.rotation.clone().multiply(wrist).multiply(arm.orientation));
    }
    this.root.updateWorldMatrix(true,true);
  }
  report(){return {state:this.state,speed:this.velocity.length(),contactError:this.contactError,feet:this.feet.map(f=>({contact:f.contact,position:f.bone.getWorldPosition(V()).toArray(),anchor:f.anchor.toArray()}))};}
}
