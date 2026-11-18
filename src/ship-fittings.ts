import type {PropPrism} from './props';
export const SHIP_WELLS=[
 {x0:35,y0:23,x1:38,y1:26},
 {x0:42.8,y0:23,x1:45,y1:26},
];
export const SHIP_MACHINES=[
 {x0:17,y0:15,x1:19,y1:17,height:3.4},
 {x0:25,y0:23,x1:27,y1:25,height:3.4},
 {x0:56,y0:16,x1:57,y1:19,height:2.6},
 {x0:65,y0:34,x1:67,y1:36,height:2.8},
];
/** Wells are fenced, floor-level hazards; their low rails do not hide standing actors. */
export function shipFittingPrisms():PropPrism[]{
 return [...SHIP_WELLS.map(b=>({...b,height:1.1,blocksSight:false})),...SHIP_MACHINES.map(b=>({...b,blocksSight:true}))].map((b,i)=>({
  index:1000+i,kind:'pipes',cx:(b.x0+b.x1)/2,cy:(b.y0+b.y1)/2,hx:(b.x1-b.x0)/2,hy:(b.y1-b.y0)/2,
  rot:0,cos:1,sin:0,floor:true,height:b.height,y0:0,y1:b.height,blocksSight:b.blocksSight,
 }));
}
