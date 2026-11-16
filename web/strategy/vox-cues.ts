import {key, type Order, type Unit, type View} from '../../src/strategy/engine';
import type {Presentation} from './presentation';

export type VoxEvent='select'|`ack-${Order['kind']}`|'execute'|'moving'|'firing'|'scanning'|'working'|'guarding'|'door-open'|'door-closed'|'secured'|'blocked'|'contact'|'hurt'|'kill'|'fallen'|'recon-done'|'victory'|'defeat'|'cancel'|'invalid'|'nl-taunt'|'nl-attack'|'nl-hurt'|'nl-death';
export type VoxCue={unit:string;name:string;faction:Unit['side'];event:VoxEvent;priority:number;scope:'ui'|'action'|'result'};
export function voiceCue(u:Pick<Unit,'id'|'name'>&Partial<Pick<Unit,'side'>>,event:VoxEvent,scope:VoxCue['scope']='ui'):VoxCue{
  const priority=event==='defeat'||event==='victory'?100:event==='fallen'?95:event==='nl-death'?90:event==='hurt'||event==='nl-hurt'?80:event==='kill'?75:event==='contact'?70:scope==='result'&&!event.startsWith('nl-')?65:event==='nl-attack'?55:event==='nl-taunt'?50:event==='firing'?45:event==='execute'?40:scope==='action'?30:event==='select'?10:20;
  return {unit:u.id,name:u.name,faction:u.side??(u.id.startsWith('n')?'nightlords':'imperium'),event,priority,scope};
}
/** All hostile cues require an observed actor and an observed event. */
export function hostileActionCue(p:Presentation,id:string,event:'nl-attack'|'nl-hurt'|'nl-death'):VoxCue|undefined{
  const before=p.units.find(u=>u.id===id&&u.side==='nightlords'&&u.hp>0);
  const after=p.after.find(u=>u.id===id);
  if(!before||!after||after.x<0||!p.visible.includes(key(after)))return;
  if(event==='nl-attack'&&!p.shots.some(s=>s.from===id))return;
  if(event==='nl-hurt'&&!(after.hp>0&&after.hp<before.hp))return;
  if(event==='nl-death'&&after.hp>0)return;
  return voiceCue(before,event,'action');
}
/** Accept only the already-redacted presentation and player views. Never inspect World. */
export function resultCues(old:View,next:View,p:Presentation):VoxCue[]{
  const cues:VoxCue[]=[],speaker=next.units[0];
  const radio=speaker??{id:'command',name:'COMMANDEMENT'};
  if(old.units.some(u=>!next.units.some(n=>n.id===u.id)))cues.push(voiceCue(radio,'fallen','result'));
  // A lost contact is not a confirmed kill. Only a visible, rendered casualty qualifies.
  if(p.after.some(u=>u.side==='nightlords'&&u.x>=0&&u.hp===0&&p.visible.includes(key(u))&&p.units.some(b=>b.id===u.id&&b.hp>0)))cues.push(voiceCue(radio,'kill','result'));
  const fresh=next.contacts.filter(c=>c.hp>0&&c.seen===next.turn&&next.visible.includes(key(c))&&!old.contacts.some(o=>o.id===c.id&&o.seen===old.turn));
  if(fresh.length){cues.push(voiceCue(radio,'contact','result'));cues.push(voiceCue(fresh[0],'nl-taunt','result'));}
  for(const o of p.orders){const u=next.units.find(u=>u.id===o.unit);if(!u)continue;
    if(o.kind==='interact'&&o.target){
      const target=o.target,d=next.doors.find(d=>key(d)===key(target));
      if(d&&next.visible.includes(key(d))&&d.open!==old.doors.find(b=>b.id===d.id)?.open)cues.push(voiceCue(u,d.open?'door-open':'door-closed','result'));
      const obj=next.objectives.find(x=>key(x)===key(target));
      if(obj&&next.visible.includes(key(obj))&&obj.owner==='imperium'&&old.objectives.find(b=>b.id===obj.id)?.owner!=='imperium')cues.push(voiceCue(u,'secured','result'));
    }
    if(o.kind==='scan')cues.push(voiceCue(u,'recon-done','result'));
    if(o.kind==='move'&&o.target){const route=p.movement[u.id];if(route&&route.every(q=>key(q)===key(route[0]))&&key(o.target)!==key(route[0]))cues.push(voiceCue(u,'blocked','result'));}
  }
  return cues;
}

/** One radio channel, bounded backlog. UI requests replace obsolete UI requests;
 * round boundaries invalidate unplayed acknowledgements and actions. */
export class VoxQueue{
  pending:{cue:VoxCue;at:number;expires:number}[]=[];
  private recent=new Map<string,number>();
  private shared=new Map<string,number>();
  offer(cue:VoxCue,now:number){
    const id=cue.unit+':'+cue.event,last=this.recent.get(id)??-Infinity;
    const cooldown=cue.event==='nl-taunt'?15000:cue.event==='nl-attack'?5500:cue.event==='nl-hurt'?4000:cue.scope==='result'?2200:cue.event==='select'?500:350;
    const sharedDelay=cue.event==='nl-taunt'?12000:cue.event==='nl-attack'?3000:['moving','guarding','working','scanning','firing'].includes(cue.event)?1800:0;
    if(now-last<cooldown||now-(this.shared.get(cue.event)??-Infinity)<sharedDelay)return false;
    this.pending=this.pending.filter(p=>p.expires>now&&(cue.scope!=='ui'||p.cue.scope!=='ui')&&!(p.cue.unit===cue.unit&&p.cue.event===cue.event));
    const entry={cue,at:now,expires:now+(cue.priority>=75?8000:cue.scope==='result'?6500:2000)};
    this.pending.push(entry);
    this.pending.sort((a,b)=>b.cue.priority-a.cue.priority||a.at-b.at);
    this.pending=this.pending.slice(0,2);
    if(!this.pending.includes(entry))return false;
    this.recent.set(id,now);this.shared.set(cue.event,now);return true;
  }
  take(now:number){this.pending=this.pending.filter(p=>p.expires>now);const head=this.pending[0];if(!head||now-head.at<(head.cue.scope==='ui'?130:0))return;return this.pending.shift()!.cue;}
  clear(resetRecent=false){this.pending=[];if(resetRecent){this.recent.clear();this.shared.clear();}}
}
