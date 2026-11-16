import {key, type Order, type Unit, type View} from '../../src/strategy/engine';
import type {Presentation} from './presentation';

export type VoxEvent='select'|`ack-${Order['kind']}`|'execute'|'moving'|'firing'|'scanning'|'working'|'guarding'|'door-open'|'door-closed'|'secured'|'blocked'|'contact'|'hurt'|'kill'|'fallen'|'recon-done'|'victory'|'defeat'|'cancel'|'invalid';
export type VoxCue={unit:string;name:string;event:VoxEvent;priority:number;scope:'ui'|'action'|'result'};
export function voiceCue(u:Pick<Unit,'id'|'name'>,event:VoxEvent,scope:VoxCue['scope']='ui'):VoxCue{
  const priority=event==='fallen'||event==='defeat'?90:event==='victory'?85:scope==='result'?60:event==='firing'?45:scope==='action'?30:event==='select'?10:20;
  return {unit:u.id,name:u.name,event,priority,scope};
}
/** Accept only the already-redacted presentation and player views. Never inspect World. */
export function resultCues(old:View,next:View,p:Presentation):VoxCue[]{
  const cues:VoxCue[]=[],speaker=next.units[0];
  const radio=speaker??{id:'command',name:'COMMANDEMENT'};
  if(old.units.some(u=>!next.units.some(n=>n.id===u.id)))cues.push(voiceCue(radio,'fallen','result'));
  // A lost contact is not a confirmed kill. Only a visible, rendered casualty qualifies.
  if(p.after.some(u=>u.side==='nightlords'&&u.x>=0&&u.hp===0&&p.visible.includes(key(u))&&p.units.some(b=>b.id===u.id&&b.hp>0)))cues.push(voiceCue(radio,'kill','result'));
  if(next.contacts.some(c=>c.seen===next.turn&&!old.contacts.some(o=>o.id===c.id&&o.seen===old.turn)))cues.push(voiceCue(radio,'contact','result'));
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
  offer(cue:VoxCue,now:number){
    const id=cue.unit+':'+cue.event,last=this.recent.get(id)??-Infinity;
    if(now-last<(cue.scope==='result'?2200:cue.event==='select'?500:350))return false;
    this.recent.set(id,now);
    this.pending=this.pending.filter(p=>p.expires>now&&(cue.scope!=='ui'||p.cue.scope!=='ui')&&!(p.cue.unit===cue.unit&&p.cue.event===cue.event));
    this.pending.push({cue,at:now,expires:now+(cue.scope==='ui'?2000:cue.scope==='action'?2000:4500)});
    this.pending.sort((a,b)=>b.cue.priority-a.cue.priority||a.at-b.at);
    this.pending=this.pending.slice(0,2);return true;
  }
  take(now:number){this.pending=this.pending.filter(p=>p.expires>now);const head=this.pending[0];if(!head||now-head.at<(head.cue.scope==='ui'?130:0))return;return this.pending.shift()!.cue;}
  clear(resetRecent=false){this.pending=[];if(resetRecent)this.recent.clear();}
}
