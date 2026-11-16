import {nlFrame,angNorm,rayFree,type World} from './sim';
export const TACTICAL_DIM=16,TACTICAL_ACTIONS=6;
export const TACTICAL_NAMES=['assault','flank-left','flank-right','cover','dodge','ceiling'];
/** Actor inputs contain only own state, finite memory, perceived mates and public geometry. */
export function tacticalObservation(w:World,i:number):Float32Array{
 const n=w.nls[i],b=n.belief,f=nlFrame(n);
 const mates=n.mates.filter((m,j)=>j!==i&&m.known&&m.alive&&m.age<20);
 return Float32Array.from([+b.valid,+b.seen,Math.min(b.age,50)/50,Math.min(f.d,20)/20,
 b.facing===null?0:Math.cos(angNorm(Math.atan2(n.y-b.y,n.x-b.x)-b.facing)),
 (n.hp??7)/7,n.cd/8,n.stunTicks/6,Math.max(0,(n.reloadHeardUntil??0)-w.tick)/20,
 mates.length/3,mates.filter(m=>Math.hypot(m.x-b.x,m.y-b.y)<9).length/3,
 (n.dodgeRest??0)/28,(n.height??0)/3,
 rayFree(n.x,n.y,f.vx,f.vy,4,w.propSolids)/4,rayFree(n.x,n.y,-f.vx,-f.vy,4,w.propSolids)/4,
 n.role/3]);
}
