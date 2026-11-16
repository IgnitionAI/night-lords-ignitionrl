import {VOX_LINES} from './vox-assets';
import {VoxQueue,type VoxCue} from './vox-cues';

type Caption={name:string;text:string;unit:string}|null;
export class VoxRadio{
  private queue=new VoxQueue();private active?:{cue:VoxCue;line:string;audio:HTMLAudioElement;stop:()=>void;since:number};
  private cursor=new Map<string,number>();private timer:number;private gapUntil=0;private bus:GainNode;
  history:{unit:string;event:string;line:string;source:string;time:number;status:string}[]=[];errors:string[]=[];maxConcurrent=0;caption:Caption=null;
  constructor(private ctx:AudioContext,private volume:()=>number,private duck:(on:boolean)=>void,private subtitle:(caption:Caption)=>void){
    this.bus=ctx.createGain();this.bus.connect(ctx.destination);this.mix();this.timer=window.setInterval(()=>this.tick(),40);
    // Warm short, local clips after the deployment gesture. Browser cache is reused.
    for(const line of VOX_LINES){const a=new Audio(line.sources[line.unit??'t0']??line.sources.command);a.preload='auto';a.load();}
  }
  speak(cue:VoxCue){if(document.hidden)return;if(!this.queue.offer(cue,performance.now()))return;
    // Orders supersede selection chatter; urgent reports supersede routine chatter.
    if(this.active&&(cue.scope==='ui'&&this.active.cue.event==='select'||cue.priority>=85&&this.active.cue.priority<85))this.stop();
  }
  clearPending(){this.queue.clear();}
  boundary(){this.queue.clear(true);this.stop();this.gapUntil=performance.now()+70;}
  suspend(){this.boundary();}
  silenceUnit(id:string){this.queue.pending=this.queue.pending.filter(p=>p.cue.unit!==id);if(this.active?.cue.unit===id)this.stop();}
  private stop(){this.active?.stop();}
  mix(){this.bus.gain.value=Math.max(0,Math.min(1,this.volume()));}
  private tick(){this.mix();if(this.active||document.hidden||performance.now()<this.gapUntil)return;const cue=this.queue.take(performance.now());if(cue)this.play(cue);}
  private play(cue:VoxCue){
    const choices=VOX_LINES.filter(l=>l.event===cue.event&&(!l.unit||l.unit===cue.unit));if(!choices.length)return;
    const k=cue.unit+':'+cue.event,index=(this.cursor.get(k)??(Number(cue.unit.slice(1))||0))%choices.length;
    const line=choices[index];this.cursor.set(k,index+1);
    const a=new Audio(line.sources[cue.unit]??line.sources.command??line.sources.t0);a.preload='auto';a.dataset.channel='vox';a.dataset.unit=cue.unit;a.dataset.line=line.id;document.body.append(a);
    // Helmet sound is baked into the delivered local MP3, including squelch.
    const source=this.ctx.createMediaElementSource(a);source.connect(this.bus);
    let closed=false;const record={unit:cue.unit,event:cue.event,line:line.id,source:a.src,time:performance.now(),status:'loading'};this.history.push(record);if(this.history.length>300)this.history.shift();
    const close=()=>{if(closed)return;closed=true;clearTimeout(watchdog);if(!a.ended)a.pause();source.disconnect();a.remove();this.active=undefined;this.caption=null;this.subtitle(null);this.duck(false);this.gapUntil=performance.now()+110;};
    const watchdog=window.setTimeout(()=>{record.status='timeout';this.errors.push(line.id+': délai de lecture');close();},9000);
    this.active={cue,line:line.id,audio:a,stop:()=>{record.status=record.status==='playing'?'interrupted':record.status;close();},since:performance.now()};
    a.onended=()=>{record.status='ended';close();};a.onerror=()=>{record.status='error';this.errors.push(line.id+': média indisponible');close();};
    a.onplaying=()=>{if(closed)return;record.status='playing';this.maxConcurrent=Math.max(this.maxConcurrent,document.querySelectorAll('audio[data-channel="vox"]').length);this.caption={name:cue.name,unit:cue.unit,text:line.text};this.subtitle(this.caption);this.duck(this.volume()>0);};
    a.play().catch(e=>{if(closed)return;record.status='error';this.errors.push(line.id+': '+e.name);close();});
  }
  diagnostics(){const a=this.active;return {active:a?{unit:a.cue.unit,event:a.cue.event,line:a.line,source:a.audio.currentSrc,time:a.audio.currentTime,paused:a.audio.paused,ready:a.audio.readyState}:null,caption:this.caption,pending:this.queue.pending.map(p=>p.cue),gain:this.bus.gain.value,maxConcurrent:this.maxConcurrent,history:[...this.history],errors:[...this.errors]};}
}
