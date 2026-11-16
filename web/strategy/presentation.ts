import {key,type Pos,type Unit,type View,type Round,type Order} from '../../src/strategy/engine';

export type VisibleShot={from:string;target:Pos;hit:boolean};
export type Presentation={units:Unit[];after:Unit[];movement:Record<string,Pos[]>;orders:Order[];shots:VisibleShot[];doors:View['doors'];visible:string[];combat:boolean};
export const rounded=(p:Pos)=>({x:Math.round(p.x),y:Math.round(p.y)});
/** The renderer and audio receive only observations available before resolution.
 * A newly discovered enemy appears with the next View, never early along its hidden route. */
export function presentRound(r:Round,v:View):Presentation{
  const vis=new Set(v.visible),known=new Set(v.contacts.filter(c=>c.seen===v.turn).map(c=>c.id));
  const units=r.before.filter(u=>u.hp>0&&(u.side==='imperium'||known.has(u.id)&&vis.has(key(u))));
  const ids=new Set(units.map(u=>u.id));
  const movement=Object.fromEntries(units.map(u=>[u.id,r.movement[u.id].map(p=>({...p}))]));
  // Do not pass unknown destinations even for a previously visible contact. Clip its route
  // at the visibility boundary; subsequent frames hide it (the sentinel has no world meaning).
  for(const u of units.filter(u=>u.side==='nightlords')){
    let gone=false;movement[u.id]=movement[u.id].map(p=>{gone ||= !vis.has(key(p));return gone?{x:-100,y:-100}:p;});
  }
  const orders=r.orders.filter(o=>ids.has(o.unit)).filter(o=>!o.target||vis.has(key(o.target))||o.unit.startsWith('t')).map(o=>structuredClone(o));
  const after=r.after.filter(u=>ids.has(u.id)).map(u=>u.side==='imperium'||vis.has(key(u))?{...u}:{...units.find(x=>x.id===u.id)!,x:-100,y:-100});
  const shots:VisibleShot[]=[];
  for(const o of orders.filter(o=>o.kind==='fire')){
    const u=after.find(u=>u.id===o.unit);if(!u||!o.target||!vis.has(key(o.target))||u.x<0)continue;
    shots.push({from:u.id,target:{...o.target},hit:r.playerEvents.some(e=>e.startsWith(u.name+' touche '))});
  }
  // Reaction fire is shown only when BOTH participants were observable. Hidden shooters
  // can cause a visible hit reaction, but give away no muzzle flash, tracer or sound origin.
  for(const e of r.playerEvents){const m=e.match(/^(\S+) touche (\S+) /);if(!m)continue;
    const a=after.find(u=>u.name===m[1]),b=after.find(u=>u.name===m[2]);
    if(a&&b&&a.x>=0&&b.x>=0&&vis.has(key(a))&&vis.has(key(b))&&!shots.some(s=>s.from===a.id))shots.push({from:a.id,target:{x:b.x,y:b.y},hit:true});
  }
  return {units,after,movement,orders,shots,visible:[...vis],doors:v.doors.map(d=>vis.has(key(d))?{...r.doors.find(x=>x.id===d.id)!}:{...d}),combat:shots.length>0||after.some(u=>u.side==='imperium'&&u.hp<units.find(x=>x.id===u.id)!.hp)};
}
