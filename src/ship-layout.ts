/** Authored ship topology shared by simulation, navigation and rendering. */
export const SHIP_SIZE = {w:72,h:40};
export type ShipBox = {x0:number;y0:number;x1:number;y1:number};
// Rectangles describe walkable rooms and corridors, in metres. Intersections form loops.
export const SHIP_SPACES: ShipBox[] = [
 {x0:0,y0:8,x1:10,y1:16}, // boarding lock
 {x0:6,y0:10,x1:68,y1:14}, // axial passage
 {x0:6,y0:4,x1:66,y1:8}, // port maintenance
 {x0:6,y0:30,x1:68,y1:34}, // starboard passage
 ...[8,22,40,60].map(x=>({x0:x,y0:4,x1:x+4,y1:34})),
 {x0:14,y0:18,x1:50,y1:22}, // cross passage
 {x0:16,y0:14,x1:28,y1:26}, // machinery
 {x0:34,y0:16,x1:46,y1:28}, // coolant exchange
 {x0:50,y0:8,x1:58,y1:22}, // power control
 {x0:58,y0:8,x1:72,y1:20}, // core chamber
 {x0:50,y0:24,x1:68,y1:38}, // cargo gallery
 {x0:52,y0:18,x1:56,y1:32},
];
export const SHIP_LANDMARKS=[{x:5,y:12,name:'SAS · 01'},{x:22,y:20,name:'MACHINES · 02'},{x:40,y:22,name:'REFROIDISSEMENT · 03'},{x:54,y:14,name:'CONTRÔLE · 04'},{x:65,y:14,name:'NOYAU · 05'},{x:60,y:32,name:'SOUTE · 06'}];
// Merge adjacent solid cells per row: collision boundaries match the visible bulkheads exactly.
export const SHIP_WALLS:ShipBox[]=[];
for(let y=0;y<SHIP_SIZE.h;y+=2){let start=-1;for(let x=0;x<=SHIP_SIZE.w;x+=2){
 const solid=x<SHIP_SIZE.w&&!SHIP_SPACES.some(r=>x+1>r.x0&&x+1<r.x1&&y+1>r.y0&&y+1<r.y1);
 if(solid&&start<0)start=x;
 if(!solid&&start>=0){SHIP_WALLS.push({x0:start,y0:y,x1:x,y1:y+2});start=-1;}
}}
// The array identity carries geometry context without global mutable mission state.
const missionSolids=new WeakSet<object>();
export function registerShip(solids:object){missionSolids.add(solids);}
export function isShip(solids:object){return missionSolids.has(solids);}
