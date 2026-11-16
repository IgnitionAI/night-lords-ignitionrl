import {test,expect} from 'bun:test';
import {createWorld,getView,resolve,observeAll,key} from '../src/strategy/engine';
import {presentRound} from '../web/strategy/presentation';
import {VoxQueue,voiceCue,resultCues,hostileActionCue} from '../web/strategy/vox-cues';
const unit=(id='t0')=>({id,name:id});
test('rapid UI requests coalesce to the latest selected unit and debounce',()=>{const q=new VoxQueue();for(let i=0;i<4;i++)q.offer(voiceCue(unit('t'+i),'select'),i*60);expect(q.pending.length).toBe(1);expect(q.take(250)).toBeUndefined();expect(q.take(320)?.unit).toBe('t3');});
test('orders replace pending selections, duplicates and expired barks do not accumulate',()=>{const q=new VoxQueue();q.offer(voiceCue(unit(),'select'),0);q.offer(voiceCue(unit(),'ack-move'),100);expect(q.take(250)?.event).toBe('ack-move');expect(q.offer(voiceCue(unit(),'ack-move'),200)).toBe(false);q.offer(voiceCue(unit(),'moving','action'),400);expect(q.take(2500)).toBeUndefined();});
test('critical reports take priority and queue stays bounded',()=>{const q=new VoxQueue();q.offer(voiceCue(unit(),'moving','action'),0);q.offer(voiceCue(unit('t1'),'scanning','action'),0);q.offer(voiceCue(unit('t2'),'fallen','result'),1);expect(q.pending.length).toBe(2);expect(q.take(2)?.event).toBe('fallen');q.clear();expect(q.pending.length).toBe(0);});
test('hidden enemy mutations cannot change VOX reports',()=>{const w=createWorld(),v=getView(w,-1),r=resolve(w,[]),next=getView(w,-1),p=presentRound(r,v);const before=resultCues(v,next,p);for(const u of [...r.before,...r.after])if(u.side==='nightlords'){u.hp=0;u.x=22;u.y=17;}r.events.push('NYX hors combat');expect(resultCues(v,next,presentRound(r,v))).toEqual(before);expect(before.some(c=>c.event==='kill'||c.event==='contact')).toBe(false);});
test('a disappearing contact is not a confirmed casualty',()=>{const w=createWorld();const n=w.units.find(u=>u.id==='n0')!;Object.assign(n,{x:6,y:10});observeAll(w);const v=getView(w,-1),r=resolve(w,[]),next=getView(w,-1),p=presentRound(r,v);next.contacts=[];p.after=p.after.filter(u=>u.id!=='n0');expect(resultCues(v,next,p).some(c=>c.event==='kill')).toBe(false);});
test('completion only follows observed ownership or door changes',()=>{const w=createWorld(),old=getView(w,-1),r=resolve(w,[]),next=getView(w,-1),p=presentRound(r,old);const obj=next.objectives[0];p.orders=[{unit:'t0',kind:'interact',target:obj}];next.visible.push(key(obj));expect(resultCues(old,next,p).some(c=>c.event==='secured')).toBe(false);obj.owner='imperium';expect(resultCues(old,next,p).some(c=>c.event==='secured')).toBe(true);next.visible=[];expect(resultCues(old,next,p).some(c=>c.event==='secured')).toBe(false);});
test('only actual immobility reports a blocked move; lost allies report through a survivor',()=>{const w=createWorld(),old=getView(w,-1),r=resolve(w,[]),next=getView(w,-1),p=presentRound(r,old);p.orders=[{unit:'t0',kind:'move',target:{x:8,y:10}}];expect(resultCues(old,next,p).some(c=>c.event==='blocked')).toBe(true);p.movement.t0[3]={x:5,y:10};expect(resultCues(old,next,p).some(c=>c.event==='blocked')).toBe(false);next.units=next.units.filter(u=>u.id!=='t0');const cues=resultCues(old,next,p);expect(cues.some(c=>c.event==='fallen')).toBe(true);expect(cues.every(c=>c.unit!=='t0')).toBe(true);});

test('a fresh visible contact can taunt, but stale and hidden contacts cannot',()=>{
 const w=createWorld(),old=getView(w,-1);Object.assign(w.units.find(u=>u.id==='n0')!,{x:6,y:10});w.turn++;observeAll(w);
 const next=getView(w,-1),p=presentRound(resolve(createWorld(),[]),old);
 expect(resultCues(old,next,p).filter(c=>c.event==='nl-taunt')).toEqual([voiceCue(next.contacts[0],'nl-taunt','result')]);
 next.contacts[0].seen--;expect(resultCues(old,next,p).some(c=>c.event==='nl-taunt')).toBe(false);
 next.contacts[0].seen++;next.visible=[];expect(resultCues(old,next,p).some(c=>c.event==='nl-taunt')).toBe(false);
});
test('hostile attack, wound and death lines require a visible matching event',()=>{
 const w=createWorld();Object.assign(w.units.find(u=>u.id==='n0')!,{x:6,y:10});observeAll(w);
 const v=getView(w,-1),p=presentRound(resolve(w,[]),v),n=p.after.find(u=>u.id==='n0')!;
 expect(hostileActionCue(p,'n0','nl-attack')).toBeUndefined();
 p.shots.push({from:'n0',target:{x:3,y:9},hit:true});
 expect(hostileActionCue(p,'n0','nl-attack')?.faction).toBe('nightlords');
 expect(hostileActionCue(p,'n0','nl-hurt')).toBeUndefined();n.hp--;
 expect(hostileActionCue(p,'n0','nl-hurt')?.unit).toBe('n0');
 expect(hostileActionCue(p,'n0','nl-death')).toBeUndefined();n.hp=0;
 expect(hostileActionCue(p,'n0','nl-death')?.event).toBe('nl-death');
 expect(hostileActionCue(p,'n0','nl-hurt')).toBeUndefined();
 n.x=-100;for(const event of ['nl-attack','nl-hurt','nl-death'] as const)expect(hostileActionCue(p,'n0',event)).toBeUndefined();
 expect(hostileActionCue(p,'n1','nl-death')).toBeUndefined();
});
test('unseen enemy activity produces neither hostile speech nor a kill report',()=>{
 const w=createWorld(),v=getView(w,-1),r=resolve(w,[]);
 for(const n of r.after.filter(u=>u.side==='nightlords')){n.hp=0;r.orders.push({unit:n.id,kind:'fire',target:v.units[0]});}
 const p=presentRound(r,v);
 for(const id of ['n0','n1','n2','n3','n4','n5'])for(const event of ['nl-attack','nl-hurt','nl-death'] as const)expect(hostileActionCue(p,id,event)).toBeUndefined();
 expect(resultCues(v,getView(w,-1),p).some(c=>c.faction==='nightlords'||c.event==='kill')).toBe(false);
});
test('hostile taunts and simultaneous action chatter have shared cooldowns across rounds',()=>{
 const q=new VoxQueue();expect(q.offer(voiceCue(unit('n0'),'nl-taunt','result'),0)).toBe(true);
 q.clear();expect(q.offer(voiceCue(unit('n1'),'nl-taunt','result'),5000)).toBe(false);
 expect(q.offer(voiceCue(unit('n1'),'nl-taunt','result'),13000)).toBe(true);
 expect(q.offer(voiceCue(unit(),'moving','action'),14000)).toBe(true);
 expect(q.offer(voiceCue(unit('t1'),'moving','action'),14001)).toBe(false);
});
test('casualties outrank hostile taunts and routine acknowledgements',()=>{
 const q=new VoxQueue();q.offer(voiceCue(unit('n0'),'nl-taunt','result'),0);q.offer(voiceCue(unit(),'hurt','action'),0);
 q.offer(voiceCue(unit('t1'),'fallen','result'),0);expect(q.pending.length).toBe(2);
 expect(q.take(1)?.event).toBe('fallen');expect(q.take(2)?.event).toBe('hurt');
});
