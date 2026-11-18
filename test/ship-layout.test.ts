import {test,expect} from 'bun:test';
import {newWorld,collide,geometry,los} from '../src/sim';
import {SHIP_LANDMARKS} from '../src/ship-layout';
import {CORE,EXTRACTION} from '../src/mission';
import {PROP_KINDS} from '../src/props';
test('mission ship is larger without changing duel geometry',()=>{
 const ship=newWorld(1,undefined,{mission:true}),duel=newWorld(1);
 expect(geometry(ship.propSolids).size.w).toBe(72);expect(geometry(duel.propSolids).size.w).toBe(40);
 const p={x:65,y:14};collide(p,.8,ship.propSolids);expect(p.x).toBe(65);
 expect(los(20,12,20,30,ship.propSolids)).toBe(false);
});
test('all ship landmarks and objectives connect with Terminator clearance, including an alternate route',()=>{
 const w=newWorld(1,undefined,{mission:true,propKinds:PROP_KINDS});
 function flood(blockAxial:boolean){const found=new Set<string>(),queue=[[3,12]];
 for(let q=0;q<queue.length;q++){const [x,y]=queue[q],key=`${x},${y}`;if(found.has(key))continue;
 const p={x,y};collide(p,.8,w.propSolids);if(Math.hypot(p.x-x,p.y-y)>.01|| (blockAxial&&x>=30&&x<=32&&y>=10&&y<=14))continue;
 found.add(key);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>0&&nx<72&&ny>0&&ny<40&&!found.has(`${nx},${ny}`))queue.push([nx,ny]);}}
 return found;}
 for(const blocked of [false,true]){const cells=flood(blocked);for(const p of [...SHIP_LANDMARKS,CORE,EXTRACTION])expect(cells.has(`${p.x},${p.y}`)).toBe(true);}
});

test('coolant wells block feet but leave bridge and sightline open',()=>{
 const w=newWorld(1,undefined,{mission:true});
 const p={x:36,y:24};collide(p,.8,w.propSolids);expect(Math.hypot(p.x-36,p.y-24)).toBeGreaterThan(.8);
 const bridge={x:40,y:24};collide(bridge,.8,w.propSolids);expect(bridge).toEqual({x:40,y:24});
 expect(los(34.5,24,40,24,w.propSolids)).toBe(true);
});
