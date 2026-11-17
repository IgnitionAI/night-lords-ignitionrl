import {loading} from '../ui/loading';
import {t,onLocaleChange,getLocale} from '../i18n';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CELLS,COVER,floor,key,path,type Unit,type View,type Order,type Pos} from '../../src/strategy/engine';
import {measureHeight} from '../stride';
import {attachWeapon} from '../weapons';
import {rounded,type Presentation} from './presentation';
import type {ShipAudio} from './audio';
import {voiceCue,hostileActionCue} from './vox-cues';

type Figure={group:T.Group;body:T.Object3D;mixer:T.AnimationMixer;actions:Record<string,T.AnimationAction>;current:string;ring:T.Mesh;label:T.Sprite;hp:T.Mesh;unit:Unit;heading:number;dead:boolean;};
const v3=(p:Pos,h=0)=>new T.Vector3(p.x+.5,h,p.y+.5);
const color={friendly:0x8bd8ca,hostile:0xdb6b75,selected:0xf2cf7b};
const material=(c:number,m=.5,r=.6)=>new T.MeshStandardMaterial({color:c,metalness:m,roughness:r});
const boxGeo=new T.BoxGeometry(1,1,1);
const ringGeo=new T.RingGeometry(.38,.42,40);
const labels=new Map<string,T.Texture>();
function textSprite(source:string,tint='#d4d1b5',size=1){
  const text=t(source);
  const id=text+tint;let texture=labels.get(id);if(!texture){const c=document.createElement('canvas');c.width=Math.max(150,text.length*24+32);c.height=64;const x=c.getContext('2d')!;x.fillStyle='rgba(5,13,17,.85)';x.fillRect(0,0,c.width,64);x.font='bold 36px monospace';x.textAlign='center';x.fillStyle=tint;x.fillText(text,c.width/2,44);texture=new T.CanvasTexture(c);labels.set(id,texture);}
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(2.5*size,.39*size,1);sprite.renderOrder=8;sprite.userData.labelPx={width:text.length*6+18,height:17};sprite.userData.i18n={source,tint,size};return sprite;
}
function meshBox(parent:T.Object3D,p:number[],s:number[],mat:T.Material){const m=new T.Mesh(boxGeo,mat);m.position.set(...p as [number,number,number]);m.scale.set(...s as [number,number,number]);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function surfaceTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d')!;x.fillStyle='#8f9898';x.fillRect(0,0,256,256);let seed=421;for(let i=0;i<7000;i++){seed=(seed*1664525+1013904223)>>>0;const px=seed%256;seed=(seed*1664525+1013904223)>>>0;x.fillStyle=i%2?'#ffffff12':'#00000013';x.fillRect(px,seed%256,2,2);}x.strokeStyle='#29363b';x.lineWidth=5;x.strokeRect(4,4,248,248);x.strokeStyle='#ccd1bf';x.lineWidth=2;x.strokeRect(9,9,238,238);for(let i=0;i<6;i++){x.fillStyle='#263238';x.fillRect(20,35+i*32,216,5);x.fillStyle='#a4aeaa';x.fillRect(20,42+i*32,216,2);}for(const a of [15,241])for(const b of [15,241]){x.fillStyle='#242a2d';x.beginPath();x.arc(a,b,4,0,Math.PI*2);x.fill();}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}

export class TacticalScene{
  readonly renderer:T.WebGLRenderer;readonly scene=new T.Scene();readonly camera=new T.OrthographicCamera(-16,16,12,-12,.1,150);
  readonly ready:Promise<void>;private loader=new GLTFLoader();private figures=new Map<string,Figure>();private templates=new Map<string,{scene:T.Group;clips:Record<string,T.AnimationClip>}>();
  private tiles:T.InstancedMesh;private routes=new T.Group();private ghosts=new T.Group();private props=new T.Group();private fx=new T.Group();private doors=new Map<string,T.Group>();private systems=new Map<string,T.Group>();
  private view?:View;private selected='t0';private orders:Order[]=[];private reveal=false;private center=new T.Vector3(14.5,0,10.5);private zoom=1;private plan=false;
  private running?:{p:Presentation;start:number;done:()=>void;fired:Set<string>};private previous=performance.now();private frames:number[]=[];private effects:{obj:T.Object3D;ttl:number;life:number;velocity?:T.Vector3}[]=[];
  private assetPaths:string[]=[];private assetErrors:string[]=[];private animated=new Set<string>();private pointerStart?:{x:number;y:number;cx:number;cz:number};dragged=false;
  private quality=0;private qualityFrames=0;
  onStatus?:(s:string)=>void;
  private localeSubscription=onLocaleChange(()=>this.scene.traverse(o=>{const info=o.userData.i18n;if(info){const translated=textSprite(info.source,info.tint,info.size);(o as T.Sprite).material.map=translated.material.map;(o as T.Sprite).material.needsUpdate=true;o.userData.labelPx=translated.userData.labelPx;translated.material.dispose();}}));
  constructor(private canvas:HTMLCanvasElement,private audio:ShipAudio){
    this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.setClearColor(0x081015);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    const pmrem=new T.PMREMGenerator(this.renderer);const room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
    this.scene.add(new T.HemisphereLight(0xc2e4f4,0x383134,1.55));const light=new T.DirectionalLight(0xffe4b8,2.5);light.position.set(7,25,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-20,right:20,top:20,bottom:-20,near:1,far:65});light.target.position.set(14,0,10);light.shadow.bias=-.0006;this.scene.add(light,light.target);
    const cool=new T.DirectionalLight(0x4e81b4,1.6);cool.position.set(28,14,-6);this.scene.add(cool);
    this.tiles=new T.InstancedMesh(new T.BoxGeometry(.97,.16,.97),new T.MeshStandardMaterial({map:surfaceTexture(),metalness:.4,roughness:.72}),CELLS.length);this.tiles.receiveShadow=true;
    const matrix=new T.Matrix4();CELLS.forEach((p,i)=>{this.tiles.setMatrixAt(i,matrix.makeTranslation(p.x+.5,-.08,p.y+.5));this.tiles.setColorAt(i,new T.Color(0x283642));});this.scene.add(this.tiles,this.routes,this.ghosts,this.props,this.fx);
    this.architecture();this.ready=this.loadAssets();new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();this.controls();requestAnimationFrame(t=>this.frame(t));
  }
  private async load(url:string){const g=await this.loader.loadAsync(url);this.assetPaths.push(url);loading?.file();return g;}
  private async loadAssets(){
    try{
      const jobs=['TERM','NL-1','NL-2','NL-3','NL-4'].map(async name=>{
        const [model,...motion]=await Promise.all([this.load(`/web/models/strategy/${name}.glb`),...['idle','walk','hit',...(name==='TERM'?['shoot']:['death'])].map(k=>this.load(`/web/models/${name}-${k}.glb`))]);
        const clips:Record<string,T.AnimationClip>={};['idle','walk','hit',...(name==='TERM'?['shoot']:['death'])].forEach((kind,i)=>{const c=motion[i].animations[0].clone();c.name=kind;c.tracks=c.tracks.filter(t=>t.name.endsWith('.quaternion'));clips[kind]=c;});this.templates.set(name,{scene:model.scene,clips});
      });
      await Promise.all(jobs);loading?.complete('models');loading?.report('Assemblage du pont…');
      const kit=await this.load('/web/models/strategy/noctis-kit.glb');const assemblies:T.Object3D[]=[];
      const place=(name:string,p:Pos,scale:number,rot=0)=>{const m=new T.Group();const offset={Relay:0,Power:3,Archives:6,Bulkhead:9,Buttress:12}[name]??0;for(const piece of kit.scene.children.filter(o=>o.name.startsWith(name+'_'))){const c=piece.clone(true);c.position.x-=offset;m.add(c);}if(!m.children.length)throw Error('Missing assembly '+name);m.position.copy(v3(p));m.scale.setScalar(scale);m.rotation.y=rot;m.traverse(o=>{if((o as T.Mesh).isMesh){o.castShadow=true;o.receiveShadow=true;}});this.props.add(m);assemblies.push(m);return m;};
      // Blender assemblies use metres; 1 tactical cell represents roughly 3 metres.
      for(const [id,name,p] of [['relay','Relay',{x:11,y:4}],['power','Power',{x:14,y:10}],['archive','Archives',{x:11,y:17}]] as const){const g=this.systems.get(id)!;const fixture=id==='relay'?{x:11,y:.9}:id==='power'?{x:14.8,y:13.5}:{x:11,y:13.4};g.add(place(name,fixture,id==='power'?.75:.64));}
      for(const [x,y] of [[7,10],[15,4],[17,10],[15,17],[24,10]])place('Bulkhead',{x,y},.34,Math.PI/2);
      for(const [x,y] of [[1,7],[6,7],[8,2],[13,2],[8,15],[13,15],[18,2],[23,2],[18,15],[23,15],[25,7]])place('Buttress',{x:x-.45,y:y-.45},.52,Math.PI);
      // Static kit parts share materials. Bake their transforms into eight meshes instead
      // of submitting every bolt, pillar and cabinet as a separate draw call.
      this.scene.updateMatrixWorld(true);const merged=new Map<T.Material,T.BufferGeometry[]>();
      for(const root of assemblies)root.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh)return;const mat=m.material as T.Material,g=m.geometry.clone().applyMatrix4(m.matrixWorld);if(!merged.has(mat))merged.set(mat,[]);merged.get(mat)!.push(g);});
      for(const root of assemblies)root.removeFromParent();
      for(const [mat,geos] of merged){const geometry=mergeGeometries(geos);if(!geometry)throw Error('Incompatible fixture geometry');const mesh=new T.Mesh(geometry,mat);mesh.name='Noctis_'+mat.name;mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);geos.forEach(g=>g.dispose());}
      const bolt=await this.load('/web/models/strategy/bolter.glb');
      // Make the four loyalists now; enemy models are instantiated only when observed.
      if(this.view)for(const u of [...this.view.units,...this.view.contacts.filter(c=>c.seen===this.view!.turn)])this.figure(u,bolt.scene);
      this.bolt=bolt.scene;loading?.complete('world');this.onStatus?.('Armures et systèmes prêts');if(this.view)this.update(this.view,this.selected,this.orders);
    }catch(e){this.assetErrors.push(String(e));this.onStatus?.('Un modèle n’a pas pu être chargé. Recharge la vue.');throw e;}
  }
  private bolt?:T.Object3D;
  private architecture(){
    const steel=material(0x293b47,.65,.45),trim=material(0x5e5545,.68,.4),black=material(0x151e26,.5,.7),red=new T.MeshStandardMaterial({color:0xaa290d,emissive:0xff3210,emissiveIntensity:1.1});
    const batches=new Map<T.Material,T.BufferGeometry[]>();const add=(mat:T.Material,p:number[],s:number[])=>{const g=boxGeo.clone();g.scale(...s as [number,number,number]);g.translate(...p as [number,number,number]);if(!batches.has(mat))batches.set(mat,[]);batches.get(mat)!.push(g);};
    for(const p of CELLS)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(!floor(p.x+dx,p.y+dy)){
      const x=p.x+.5+dx*.5,z=p.y+.5+dy*.5,height=dy===1?.28:.72;
      add(steel,[x,height/2-.04,z],dx?[.16,height,1.02]:[1.02,height,.16]);add(trim,[x,height+.01,z],dx?[.19,.045,1.04]:[1.04,.045,.19]);
      if((p.x+p.y)%3===0){add(trim,[x,.3,z],dx?[.24,.7,.11]:[.11,.7,.24]);add(red,[x-dx*.1,.28,z-dy*.1],dx?[.035,.04,.24]:[.24,.04,.035]);}
      add(black,[x,-.32,z],dx?[.12,.5,1]:[1,.5,.12]);
    }
    // Exposed hull ribs and cable runs occupy the void, never walkable cells.
    for(const y of [4,10,17])for(let x=1;x<28;x++)if(floor(x,y)&&!floor(x,y-1)){
      add(trim,[x+.5,-.12,y-.14],[.96,.06,.06]);add(black,[x+.5,-.2,y-.25],[.96,.09,.1]);
    }
    add(black,[14.5,-.8,10.5],[29.5,.8,21.3]);
    add(steel,[14.5,-.52,.2],[29.5,.22,.5]);add(steel,[14.5,-.52,20.8],[29.5,.22,.5]);
    const rib=(a:T.Vector3,b:T.Vector3,width:number,mat:T.Material)=>{const g=boxGeo.clone();g.scale(width,a.distanceTo(b),width);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());if(!batches.has(mat))batches.set(mat,[]);batches.get(mat)!.push(g);};
    for(const [x,y,width] of [[8,2,6],[18,2,6],[8,15,6],[18,15,6],[1,7,6]]){
      for(let k=0;k<3;k++){const a=x+.2+k*(width-.4)/3,z=y-.18;
        add(steel,[a,1.05,z],[.22,2.1,.32]);add(steel,[a+1.55,1.05,z],[.22,2.1,.32]);
        rib(new T.Vector3(a,1.8,z),new T.Vector3(a+.77,2.45,z),.16,steel);rib(new T.Vector3(a+1.55,1.8,z),new T.Vector3(a+.77,2.45,z),.16,steel);
        add(trim,[a,.75,z+.19],[.07,1.5,.06]);add(trim,[a+1.55,.75,z+.19],[.07,1.5,.06]);
        add(black,[a+.78,.95,z-.03],[1.4,1.6,.18]);add(red,[a+.78,1.4,z+.1],[.12,.35,.025]);
      }
    }
    // Recessed machinery and conduits connect the deck to the vessel around it.
    for(const [x,y] of [[10,7],[20,7],[10,13.7],[20,13.7],[2,16],[26,16]]){
      if(floor(Math.round(x),Math.round(y)))continue;
      add(steel,[x+.5,-.1,y],[2.5,.55,.6]);
      for(let k=-4;k<=4;k++){add(trim,[x+.5+k*.25,.21,y],[.06,.12,.7]);add(black,[x+.5+k*.25,.31,y],[.12,.11,.42]);}
      add(red,[x+.5,.24,y+.34],[1.2,.035,.03]);
    }
    for(const x of [.25,28.75])for(let z=1;z<20;z+=1.4){add(steel,[x,-.23,z],[.35,.5,1.25]);add(trim,[x,.03,z],[.4,.05,.12]);}
    for(const p of COVER){add(steel,[p.x+.5,.19,p.y+.22],[.7,.38,.32]);for(let i=-2;i<=2;i++)add(trim,[p.x+.5+i*.12,.4,p.y+.22],[.04,.04,.35]);}
    for(const [mat,geos] of batches){const m=new T.Mesh(mergeGeometries(geos),mat);m.castShadow=true;m.receiveShadow=true;this.scene.add(m);for(const g of geos)g.dispose();}
    // Cover remains walkable by the original rules: low machinery sits at its rear edge.

    for(const [id,p] of [['D1',{x:7,y:10}],['D2',{x:15,y:4}],['D3',{x:17,y:10}],['D4',{x:15,y:17}],['D5',{x:24,y:10}]] as const){const g=new T.Group();g.position.copy(v3(p));for(const s of [-1,1]){const leaf=meshBox(g,[0,.38,s*.23],[.16,.76,.44],steel);leaf.userData.side=s;meshBox(leaf,[.52,0,0],[.1,.8,.14],trim);}this.scene.add(g);this.doors.set(id,g);}
    for(const [id,name,p,tint] of [['relay','I · RELAIS',{x:11,y:4},0x3cbbdd],['power','II · ALIMENTATION',{x:14,y:10},0xe99435],['archive','III · ARCHIVES',{x:11,y:17},0xb48dc8],['extraction','SAS · EXTRACTION',{x:3,y:10},0x9dcfb8]] as const){const g=new T.Group();const r=new T.Mesh(new T.RingGeometry(.6,.66,48),new T.MeshBasicMaterial({color:tint,transparent:true,opacity:.8}));r.rotation.x=-Math.PI/2;r.position.copy(v3(p,.018));g.add(r);const label=textSprite(name,`#${tint.toString(16).padStart(6,'0')}`,.7);label.position.copy(v3(id==='extraction'?{x:2,y:14}:{x:p.x,y:p.y-1.1},.12));g.add(label);this.scene.add(g);this.systems.set(id,g);const l=new T.PointLight(tint,4,4,2);l.position.copy(v3(p,1.5));this.scene.add(l);}
  }
  private figure(u:Unit,weapon=this.bolt){let old=this.figures.get(u.id);if(old){old.unit=u;return old;}const name=u.side==='imperium'?'TERM':`NL-${(Number(u.id.slice(1))%4)+1}`,template=this.templates.get(name);if(!template)return;
    const group=new T.Group(),body=clone(template.scene);group.add(body);const scale=(u.side==='imperium'?.94:.81)/measureHeight(body);body.scale.setScalar(scale);
    body.traverse(o=>{o.frustumCulled=false;const m=o as T.Mesh;if(!m.isMesh)return;m.castShadow=true;m.receiveShadow=true;const materials=Array.isArray(m.material)?m.material:[m.material];m.material=materials.map(raw=>{const mat=(raw as T.MeshStandardMaterial).clone();mat.metalness=.38;mat.roughness=.65;mat.envMapIntensity=.4;mat.emissive=new T.Color(u.side==='imperium'?0x203028:0x15243a);mat.emissiveIntensity=.25;return mat;});if(materials.length===1)m.material=(m.material as T.Material[])[0];});
    const mixer=new T.AnimationMixer(body);const actions:Record<string,T.AnimationAction>={};for(const [k,c] of Object.entries(template.clips))actions[k]=mixer.clipAction(c);actions.idle.play();mixer.update(.8);body.updateMatrixWorld(true);
    if(weapon)attachWeapon(body,weapon.clone(true),{bone:'RightHand',length:1.4,grip:.35,dir:[0,-.1,1]});
    // Authored pose overlays on the rig's actual idle pose. No ammunition or interaction rule added.
    const poseClip=(kind:string,duration:number,changes:Record<string,[number,number,number][]>)=>{const tracks:T.KeyframeTrack[]=[];for(const [boneName,offsets] of Object.entries(changes)){const bone=body.getObjectByName(boneName);if(!bone)continue;const q=bone.quaternion.clone(),values:number[]=[];for(const a of offsets){const r=q.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(...a)));values.push(r.x,r.y,r.z,r.w);}tracks.push(new T.QuaternionKeyframeTrack(`${boneName}.quaternion`,[0,duration*.25,duration*.55,duration],values));}const action=mixer.clipAction(new T.AnimationClip(kind,duration,tracks));action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;actions[kind]=action;};
    poseClip('aim',.6,{RightArm:[[0,0,0],[-.25,0,-.15],[-.25,0,-.15],[-.25,0,-.15]],LeftArm:[[0,0,0],[-.15,.1,.2],[-.15,.1,.2],[-.15,.1,.2]]});
    poseClip('fire',.55,{Spine:[[0,0,0],[.13,0,0],[-.025,0,0],[0,0,0]],RightArm:[[-.25,0,-.15],[-.43,0,-.15],[-.27,0,-.15],[-.25,0,-.15]]});
    poseClip('reload',.9,{LeftArm:[[0,0,0],[-.35,.25,.45],[-.5,.15,.2],[0,0,0]],RightArm:[[-.25,0,-.15],[-.15,-.25,-.1],[-.15,-.25,-.1],[0,0,0]],Head:[[0,0,0],[.25,0,0],[.25,0,0],[0,0,0]]});
    poseClip('interact',1,{RightArm:[[0,0,0],[-.55,0,-.1],[-.5,.2,-.1],[0,0,0]],Head:[[0,0,0],[.2,0,0],[.2,0,0],[0,0,0]]});
    if(!actions.death)poseClip('death',1.1,{Hips:[[0,0,0],[.15,0,.1],[.6,0,.3],[1.45,0,.4]],LeftUpLeg:[[0,0,0],[-.3,0,0],[-.7,0,0],[-.7,0,0]],RightUpLeg:[[0,0,0],[-.3,0,0],[-.6,0,0],[-.6,0,0]]});
    for(const k of ['hit','death']){actions[k].setLoop(T.LoopOnce,1);actions[k].clampWhenFinished=true;}
    const ring=new T.Mesh(ringGeo,new T.MeshBasicMaterial({color:u.side==='imperium'?color.friendly:color.hostile,transparent:true,opacity:.9}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;group.add(ring);
    const label=textSprite(u.name,u.side==='imperium'?'#adede0':'#f39cab',.38);label.position.set(0,1.2,0);group.add(label);const hp=meshBox(group,[0,1.08,0],[.55,.035,.035],new T.MeshBasicMaterial({color:u.side==='imperium'?color.friendly:color.hostile}));
    const f:Figure={group,body,mixer,actions,current:'idle',ring,label,hp,unit:u,heading:u.side==='imperium'?Math.PI/2:-Math.PI/2,dead:false};group.position.copy(v3(u));body.rotation.y=f.heading;this.scene.add(group);this.figures.set(u.id,f);return f;
  }
  private action(f:Figure,name:string){if(f.current===name)return;const a=f.actions[name]??f.actions.idle,b=f.actions[f.current];a.reset().setEffectiveWeight(1).play();if(b)b.crossFadeTo(a,.16,false);f.current=name;this.animated.add(name);}
  update(v:View,selected:string,orders:Order[],override?:Unit[],reveal=false){this.view=v;this.selected=selected;this.orders=orders;this.reveal=reveal;if(this.running)return;
    const visible=new Set(v.visible),explored=new Set(v.explored);CELLS.forEach((p,i)=>this.tiles.setColorAt(i,new T.Color(reveal||visible.has(key(p))?0x81929a:explored.has(key(p))?0x455360:0x25313c)));this.tiles.instanceColor!.needsUpdate=true;
    this.audio.observeVoxEnemies(reveal?[]:v.contacts.filter(c=>c.seen===v.turn&&c.hp>0&&visible.has(key(c))).map(c=>c.id));
    for(const f of this.figures.values())f.group.visible=false;
    for(const u of override??[...v.units,...v.contacts.filter(c=>c.seen===v.turn)]){if(!reveal&&u.side!=='imperium'&&!visible.has(key(u)))continue;const f=this.figure(u);if(!f)continue;f.group.visible=true;f.group.position.copy(v3(u));f.ring.material.color.setHex(u.id===selected?color.selected:u.side==='imperium'?color.friendly:color.hostile);f.ring.scale.setScalar(u.id===selected?1.15:1);f.hp.scale.x=.55*Math.max(0,u.hp)/u.maxHp;f.dead=u.hp<=0;if(!f.dead)this.action(f,'idle');else{this.action(f,'death');f.actions.death.time=f.actions.death.getClip().duration;f.actions.death.paused=true;}f.label.visible=!f.dead;f.hp.visible=!f.dead;}
    this.renderer.shadowMap.needsUpdate=true;this.setDoors(v.doors,1);for(const o of v.objectives){const r=this.systems.get(o.id)!.children[0] as T.Mesh;(r.material as T.MeshBasicMaterial).color.setHex(o.owner==='imperium'?color.friendly:o.owner==='nightlords'?color.hostile:0xb59a60);}
    this.clearGroup(this.routes);this.clearGroup(this.ghosts);
    for(const o of orders){const u=v.units.find(u=>u.id===o.unit);if(!u||!o.target)continue;const pts=o.kind==='move'?path(u,o.target,v.doors).slice(0,3):[o.target];const geo=new T.BufferGeometry().setFromPoints([v3(u,.06),...pts.map(p=>v3(p,.06))]);const line=new T.Line(geo,new T.LineDashedMaterial({color:o.kind==='fire'?0xff986e:0xe0ca7e,dashSize:.15,gapSize:.1}));line.computeLineDistances();this.routes.add(line);for(const p of pts){const ring=new T.Mesh(ringGeo,new T.MeshBasicMaterial({color:0xe0ca7e,transparent:true,opacity:.5,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(v3(p,.04));ring.scale.setScalar(.4);this.routes.add(ring);}}
    if(!reveal)for(const c of v.contacts.filter(c=>c.seen<v.turn)){const sprite=textSprite('? '+c.name,'#a97d87',.43);sprite.position.copy(v3(c,.4));this.ghosts.add(sprite);}
  }
  private clearGroup(g:T.Group){for(const o of [...g.children]){g.remove(o);if(o instanceof T.Line)o.geometry.dispose();const m=(o as T.Mesh).material;if(m&&!Array.isArray(m))m.dispose();}}
  private setDoors(doors:View['doors'],blend:number){for(const d of doors){const g=this.doors.get(d.id)!;for(const leaf of g.children){const target=leaf.userData.side*(d.open?.69:.23);leaf.position.z+=(target-leaf.position.z)*blend;}}}
  async play(p:Presentation){await this.ready;this.clearGroup(this.routes);this.clearGroup(this.ghosts);this.audio.setPhase(p.combat?'combat':'planning');return new Promise<void>(done=>{this.running={p,start:performance.now(),done,fired:new Set()};});}
  private cue(id:string,at:number,t:number,fn:()=>void){const r=this.running!;if(t>=at&&!r.fired.has(id)){r.fired.add(id);fn();}}
  private sequence(now:number){const r=this.running!;const t=(now-r.start)/1000,p=r.p,vis=new Set(p.visible),focus={x:this.center.x,y:this.center.z};
    const visibleEnemies:string[]=[];
    this.renderer.shadowMap.needsUpdate=true;this.setDoors(p.doors,.13);
    for(const f of this.figures.values())f.group.visible=false;
    for(const u of p.units){const f=this.figure(u)!;const end=p.after.find(v=>v.id===u.id)!,route=p.movement[u.id],o=p.orders.find(o=>o.unit===u.id);let position:Pos=u;
      const motion=Math.min(3,Math.max(0,(t-.5)/.72)),seg=Math.min(2,Math.floor(motion)),local=motion-seg,a=route[seg],b=route[seg+1];const moving=key(a)!==key(b)&&t>=.5&&t<2.66;
      const fraction=u.side==='imperium'?Math.min(1,local/.94):Math.min(1,local/.68);position={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
      const allowed=u.side==='imperium'||a.x>=0&&b.x>=0&&vis.has(key(rounded(position)));if(!allowed)continue;
      if(u.side==='nightlords')visibleEnemies.push(u.id);
      f.group.visible=true;f.group.position.copy(v3(position));
      if(moving&&u.side==='imperium')this.cue('vox-moving-'+u.id,.5,t,()=>this.audio.speak(voiceCue(u,'moving','action')));
      if(u.side==='imperium'&&o?.kind==='guard')this.cue('vox-guard-'+u.id,.3,t,()=>this.audio.speak(voiceCue(u,'guarding','action')));
      if(moving){f.heading=Math.atan2(b.x-a.x,b.y-a.y);this.action(f,'walk');f.actions.walk.timeScale=u.side==='imperium'?1.5:1.8;this.cue('step-'+u.id+'-'+seg,.5+seg*.72+.12,t,()=>this.audio.effect('servo',position,focus));}
      else if(t<2.7){this.action(f,o?.kind==='interact'||o?.kind==='scan'||o?.kind==='special'&&o.unit!=='t1'?'interact':o?.kind==='fire'||o?.kind==='guard'||o?.kind==='special'&&o.unit==='t1'?'aim':'idle');if(o?.target)f.heading=Math.atan2(o.target.x-position.x,o.target.y-position.y);}
      let delta=Math.atan2(Math.sin(f.heading-f.body.rotation.y),Math.cos(f.heading-f.body.rotation.y));f.body.rotation.y+=delta*.18;
      const shot=p.shots.find(s=>s.from===u.id);if(shot){if(t>=2.7&&t<3.25){this.action(f,'fire');f.heading=Math.atan2(shot.target.x-position.x,shot.target.y-position.y);}else if(t>=3.25&&t<4.15)this.action(f,'reload');this.cue('shot-'+u.id,2.88,t,()=>{const cue=u.side==='imperium'?voiceCue(u,'firing','action'):hostileActionCue(p,u.id,'nl-attack');if(cue)this.audio.speak(cue);this.burst(f,shot.target,shot.hit);this.audio.effect('bolter',position,focus);});}
      if(end.hp<u.hp){this.cue('hit-'+u.id,3.03,t,()=>{if(end.hp<=0)this.audio.silenceUnit(u.id);const cue=u.side==='nightlords'?hostileActionCue(p,u.id,end.hp<=0?'nl-death':'nl-hurt'):end.hp>0?voiceCue(u,'hurt','action'):undefined;if(cue)this.audio.speak(cue);this.action(f,end.hp<=0?'death':'hit');this.audio.effect('impact',position,focus);this.sparks(v3(position,.45),0xffa650);});if(t>=3.03&&end.hp<=0){this.action(f,'death');f.dead=true;f.group.position.y=-.3*Math.min(1,(t-3.03));}}
      f.hp.scale.x=.55*(t>3.03?end.hp:u.hp)/u.maxHp;
      if(o?.kind==='interact')this.cue('interact-'+u.id,.22,t,()=>{if(u.side==='imperium')this.audio.speak(voiceCue(u,'working','action'));if(o.target&&p.doors.some(d=>key(d)===key(o.target!)))this.audio.effect('door',o.target,focus);});
      if(o?.kind==='scan')this.cue('scan-'+u.id,.2,t,()=>{if(u.side==='imperium')this.audio.speak(voiceCue(u,'scanning','action'));const ring=new T.Mesh(new T.RingGeometry(.43,.47,64),new T.MeshBasicMaterial({color:color.friendly,transparent:true,opacity:.6,depthWrite:false}));ring.position.copy(v3(u,.05));ring.rotation.x=-Math.PI/2;this.fx.add(ring);this.effects.push({obj:ring,ttl:1.5,life:1.5});});
    }
    this.audio.observeVoxEnemies(visibleEnemies);
    if(t>4.3){this.running=undefined;r.done();}
  }
  private burst(f:Figure,target:Pos,hit:boolean){const from=f.group.position.clone().add(new T.Vector3(0,.55,0)),to=v3(target,.5),dir=to.clone().sub(from).normalize();from.addScaledVector(dir,.3);
    const flash=new T.Mesh(new T.SphereGeometry(.15,8,6),new T.MeshBasicMaterial({color:0xffe5a0,transparent:true}));flash.position.copy(from);this.fx.add(flash);this.effects.push({obj:flash,ttl:.12,life:.12});const beam=new T.Line(new T.BufferGeometry().setFromPoints([from,to]),new T.LineBasicMaterial({color:0xffba68,transparent:true,opacity:.8}));this.fx.add(beam);this.effects.push({obj:beam,ttl:.16,life:.16});if(hit)this.sparks(to,0xff9b32);
    for(let i=0;i<3;i++){const smoke=new T.Mesh(new T.SphereGeometry(.09,8,6),new T.MeshBasicMaterial({color:0xadb2ac,transparent:true,opacity:.2,depthWrite:false}));smoke.position.copy(from);this.fx.add(smoke);this.effects.push({obj:smoke,ttl:.6,life:.6,velocity:new T.Vector3((i-1)*.08,.25,.05)});}
  }
  private sparks(p:T.Vector3,c:number){for(let i=0;i<7;i++){const m=new T.Mesh(new T.BoxGeometry(.025,.025,.07),new T.MeshBasicMaterial({color:c,transparent:true}));m.position.copy(p);this.fx.add(m);this.effects.push({obj:m,ttl:.3+i*.035,life:.55,velocity:new T.Vector3(Math.cos(i*2.4),.7+Math.sin(i),Math.sin(i*2.4)).multiplyScalar(.6)});}}
  private frame(now:number){requestAnimationFrame(t=>this.frame(t));const dt=Math.min(.15,(now-this.previous)/1000);if(!document.hidden){this.frames.push(now-this.previous);if(this.frames.length>600)this.frames.shift();}this.previous=now;if(this.running)this.sequence(now);
    for(const f of this.figures.values())if(f.group.visible){f.mixer.update(dt);if(f.dead)f.label.visible=f.hp.visible=false;}
    for(const e of [...this.effects]){if(!e.obj.userData.presented){e.obj.userData.presented=true;continue;}e.ttl-=dt;if(e.velocity)e.obj.position.addScaledVector(e.velocity,dt);const mat=(e.obj as T.Mesh).material as T.Material&{opacity:number};mat.opacity=Math.max(0,e.ttl/e.life)*.65;if(e.life===1.5)e.obj.scale.setScalar(1+(1-e.ttl/e.life)*2);if(e.ttl<=0){this.fx.remove(e.obj);(e.obj as T.Mesh).geometry.dispose();mat.dispose();this.effects.splice(this.effects.indexOf(e),1);}}
    // Keep the command interface crisp; adapt only the 3D render surface on slow GPUs.
    if(++this.qualityFrames>160&&this.frames.length>120&&this.quality<2){this.qualityFrames=0;const recent=this.frames.slice(-120).sort((a,b)=>a-b);if(recent[60]>42){this.quality++;this.renderer.setPixelRatio(this.quality===1?.8:.6);this.resize();}}
    const pixel=(this.camera.top-this.camera.bottom)/Math.max(1,this.canvas.clientHeight);this.scene.traverse(o=>{if((o as T.Sprite).isSprite&&o.userData.labelPx){const p=o.userData.labelPx;o.scale.set(p.width*pixel,p.height*pixel,1);}});
    if(!document.hidden)this.renderer.render(this.scene,this.camera);
  }
  prepare(){this.renderer.compile(this.scene,this.camera);this.renderer.render(this.scene,this.camera);}
  private resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;this.renderer.setSize(r.width,r.height,false);this.setCamera();}
  private setCamera(){const r=this.canvas.getBoundingClientRect(),aspect=r.width/r.height,half=Math.max(11.4,16/aspect)/this.zoom;Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.position.copy(this.center).add(this.plan?new T.Vector3(0,40,.01):new T.Vector3(13,32,25));this.camera.lookAt(this.center);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.audio.listener({x:this.center.x,y:this.center.z});}
  zoomBy(f:number){this.zoom=Math.max(.8,Math.min(3.8,this.zoom*f));this.setCamera();}
  overview(){this.zoom=1;this.center.set(14.5,0,10.5);this.setCamera();}
  focus(u:Pos){this.center.copy(v3(u));this.center.y=0;this.zoom=2.1;this.setCamera();}
  togglePlan(){this.plan=!this.plan;this.setCamera();return this.plan;}
  project(p:Pos){const v=v3(p).project(this.camera),r=this.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};}
  pick(x:number,y:number):Pos|null{const r=this.canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-r.left)/r.width*2-1,1-(y-r.top)/r.height*2),this.camera);const hit=new T.Vector3();if(!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),hit))return null;const p={x:Math.floor(hit.x),y:Math.floor(hit.z)};return floor(p.x,p.y)?p:null;}
  pickFriendly(x:number,y:number){if(!this.view)return;return this.view.units.find(u=>{const p=v3(u,.5).project(this.camera),r=this.canvas.getBoundingClientRect();return Math.hypot(r.left+(p.x+1)*r.width/2-x,r.top+(1-p.y)*r.height/2-y)<14;});}
  private controls(){this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoomBy(e.deltaY>0?.9:1.1);},{passive:false});this.canvas.addEventListener('pointerdown',e=>{this.dragged=false;this.pointerStart={x:e.clientX,y:e.clientY,cx:this.center.x,cz:this.center.z};});window.addEventListener('pointermove',e=>{if(!this.pointerStart)return;const d=this.pointerStart;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5){this.dragged=true;const k=(this.camera.right-this.camera.left)/this.canvas.clientWidth;this.center.x=d.cx-(e.clientX-d.x)*k;this.center.z=d.cz-(e.clientY-d.y)*k*1.2;this.setCamera();}});window.addEventListener('pointerup',()=>this.pointerStart=undefined);}
  diagnostics(){const sorted=[...this.frames].sort((a,b)=>a-b);const gl=this.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {effects:this.effects.length,pixelRatio:this.renderer.getPixelRatio(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',ready:!!this.bolt,assets:[...this.assetPaths],errors:[...this.assetErrors],drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,frameMs:{median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]},animations:[...this.animated],figures:[...this.figures.values()].filter(f=>f.group.visible).map(f=>({id:f.unit.id,clip:f.current,time:f.actions[f.current]?.time,position:f.group.position.toArray(),head:f.body.getObjectByName('Head')?.getWorldPosition(new T.Vector3()).toArray(),leftFoot:f.body.getObjectByName('LeftFoot')?.getWorldPosition(new T.Vector3()).toArray(),rightFoot:f.body.getObjectByName('RightFoot')?.getWorldPosition(new T.Vector3()).toArray()}))};}
}
