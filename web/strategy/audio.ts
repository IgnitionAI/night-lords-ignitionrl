import {AUDIO} from './audio-assets';
import {VoxRadio} from './vox';
import type {VoxCue} from './vox-cues';
import type {Pos} from '../../src/strategy/engine';
type Phase='planning'|'combat'|'ending';
type Channel='master'|'music'|'ambience'|'effects'|'vox';
export class ShipAudio{
  volumes:Record<Channel,number>={master:.7,music:.3,ambience:.28,effects:.65,vox:.85};
  enabled=false;phase:Phase='planning';private ctx?:AudioContext;private tracks=new Map<string,HTMLAudioElement>();private levels=new Map<string,number>();
  private fx=new Set<HTMLAudioElement>();private gain?:GainNode;private hullPan?:StereoPannerNode;private timer?:number;
  onVox:(caption:{name:string;text:string;unit:string}|null)=>void=()=>{};
  private radio?:VoxRadio;private ducked=false;private duckLevel=1;
  speak(cue:VoxCue){this.radio?.speak(cue);}
  clearVox(resetRecent=false){this.radio?.boundary(resetRecent);}
  observeVoxEnemies(ids:string[]){this.radio?.observeEnemies(ids);}
  previewNightLords(){this.radio?.previewNightLords();}
  finishVox(){this.radio?.clearPending();}
  silenceUnit(id:string){this.radio?.silenceUnit(id);}
  played:Record<string,number>={};transitions:string[]=[];errors:string[]=[];
  constructor(){try{Object.assign(this.volumes,JSON.parse(localStorage.getItem('noctis-audio')??'{}'));}catch{}for(const k of Object.keys(this.volumes) as Channel[])this.volumes[k]=Math.min(1,Math.max(0,Number(this.volumes[k])||0));}
  async start(){if(this.enabled){await this.ctx?.resume();return;}this.enabled=true;this.ctx=new AudioContext();await this.ctx.resume();this.gain=this.ctx.createGain();const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-9;limiter.ratio.value=10;limiter.attack.value=.003;limiter.release.value=.15;this.gain.connect(limiter).connect(this.ctx.destination);
    for(const name of ['planning','combat','ending','hull']){
      const a=new Audio(name==='hull'?'/web/sfx/nightlords/hull-dread.mp3':AUDIO[name]);a.loop=true;a.preload='auto';a.dataset.channel=name;document.body.append(a);this.tracks.set(name,a);this.levels.set(name,0);a.volume=0;if(name==='hull'){const source=this.ctx.createMediaElementSource(a);this.hullPan=this.ctx.createStereoPanner();source.connect(this.hullPan).connect(this.ctx.destination);}
      a.addEventListener('error',()=>this.errors.push(name+': média indisponible'));
    }
    this.radio=new VoxRadio(this.ctx,()=>this.volumes.master*this.volumes.vox,on=>this.ducked=on,c=>this.onVox(c));
    this.timer=window.setInterval(()=>this.mix(),50);this.setPhase(this.phase);this.mix();
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.radio?.suspend();for(const a of this.tracks.values())a.pause();this.ctx?.suspend();}else{this.ctx?.resume();this.setPhase(this.phase);}});
  }
  setPhase(p:Phase){if(this.phase!==p)this.transitions.push(this.phase+' → '+p);this.phase=p;if(this.enabled&&!document.hidden)for(const n of ['hull',p]){const a=this.tracks.get(n)!;a.play().catch(e=>{if(e.name!=='AbortError')this.errors.push(n+': '+e.name);});}}
  set(channel:Channel,value:number){this.volumes[channel]=Math.max(0,Math.min(1,Number(value)||0));localStorage.setItem('noctis-audio',JSON.stringify(this.volumes));this.mix();}
  private mix(){this.duckLevel+=((this.ducked && this.volumes.vox>0 ? .32 : 1)-this.duckLevel)*.3;this.radio?.mix();for(const [name,a] of this.tracks){const target=name==='hull'||name===this.phase?1:0;let level=this.levels.get(name)??0;level+=(target-level)*.075;this.levels.set(name,level);a.volume=Math.min(1,level*this.volumes.master*(name==='hull'?this.volumes.ambience:this.volumes.music*this.duckLevel));if(!target&&level<.002&&!a.paused){a.pause();a.currentTime=0;}}
    if(this.gain)this.gain.gain.value=this.volumes.master*this.volumes.effects;
  }
  effect(name:'servo'|'bolter'|'door'|'impact',p:Pos,focus:Pos){if(!this.enabled||!this.ctx||document.hidden||this.fx.size>12)return;
    const a=new Audio(AUDIO[name]);a.dataset.channel='effect-'+name;document.body.append(a);this.fx.add(a);
    const source=this.ctx.createMediaElementSource(a),pan=this.ctx.createStereoPanner(),volume=this.ctx.createGain();pan.pan.value=Math.max(-.85,Math.min(.85,((p.x-focus.x)*.887-(p.y-focus.y)*.46)/10));volume.gain.value=(name==='servo'?.4:1)/Math.max(1,Math.hypot(p.x-focus.x,p.y-focus.y)/9);
    source.connect(pan).connect(volume).connect(this.gain!);const cleanup=()=>{this.fx.delete(a);source.disconnect();pan.disconnect();volume.disconnect();a.remove();};a.onended=cleanup;a.onerror=cleanup;
    a.play().then(()=>this.played[name]=(this.played[name]??0)+1).catch(cleanup);
  }
  listener(focus:Pos){if(this.hullPan)this.hullPan.pan.value=Math.max(-.55,Math.min(.55,((14-focus.x)*.887-(10-focus.y)*.46)/20));}
  diagnostics(){return {vox:this.radio?.diagnostics()??null,duckLevel:this.duckLevel,enabled:this.enabled,phase:this.phase,volumes:{...this.volumes},played:{...this.played},transitions:[...this.transitions],errors:[...this.errors],tracks:[...this.tracks].map(([name,a])=>({name,paused:a.paused,time:a.currentTime,volume:a.volume,ready:a.readyState}))};}
}
