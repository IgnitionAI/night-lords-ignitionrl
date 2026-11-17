import { geometry, collide, los, type World } from './sim';
// Shared flood field for creatures; no allocations per creature and no diagonal corner cutting.
const fields=new WeakMap<World,Map<string,Int16Array>>();
const masks=new WeakMap<World,Map<number,Uint8Array>>();
export function shipHeading(w:World,x:number,y:number,tx:number,ty:number,radius=.55):number {
 if(clearPath(w,x,y,tx,ty,radius))return Math.atan2(ty-y,tx-x);
 const {w:W,h:H}=geometry(w.propSolids).size;
 let sizes=masks.get(w);if(!sizes){sizes=new Map();masks.set(w,sizes);}let blocked=sizes.get(radius);
 if(!blocked){blocked=new Uint8Array(W*H);for(let j=0;j<H;j++)for(let i=0;i<W;i++){const p={x:i+.5,y:j+.5};collide(p,radius,w.propSolids);blocked[j*W+i]=Math.abs(p.x-i-.5)+Math.abs(p.y-j-.5)>.01?1:0;}sizes.set(radius,blocked);}
 let gx=Math.min(W-1,Math.max(0,Math.floor(tx))),gy=Math.min(H-1,Math.max(0,Math.floor(ty)));
 // A noisy observation may fall inside machinery. Seed the field on a walkable cell.
 if(blocked[gy*W+gx]){let best=Infinity;for(let j=0;j<H;j++)for(let i=0;i<W;i++){if(blocked[j*W+i])continue;const d=Math.hypot(i+.5-tx,j+.5-ty);if(d<best){best=d;gx=i;gy=j;}}}
 const key=`${radius}:${gx},${gy}`;
 let cache=fields.get(w);if(!cache){cache=new Map();fields.set(w,cache);}
 let dist=cache.get(key);
 if(!dist){
  dist=new Int16Array(W*H).fill(-1);
  const queue=[gy*W+gx];dist[queue[0]]=0;
  for(let q=0;q<queue.length;q++){const at=queue[q],ax=at%W,ay=Math.floor(at/W);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=ax+dx,ny=ay+dy,idx=ny*W+nx;if(nx<0||ny<0||nx>=W||ny>=H||blocked[idx]||dist[idx]>=0)continue;dist[idx]=dist[at]+1;queue.push(idx);}}
  if(cache.size>=16)cache.delete(cache.keys().next().value!);cache.set(key,dist);
 }
 const cx=Math.floor(x),cy=Math.floor(y);let best=Infinity,bx=tx,by=ty;
 for(let j=-3;j<=3;j++)for(let i=-3;i<=3;i++){const px=cx+i+.5,py=cy+j+.5;if(px<0||py<0||px>=W||py>=H)continue;const d=dist[Math.floor(py)*W+Math.floor(px)];if(d<0||!clearPath(w,x,y,px,py,radius))continue;const score=d+Math.hypot(px-x,py-y)*.1;if(score<best){best=score;bx=px;by=py;}}
 return Math.atan2(by-y,bx-x);
}

export function clearPath(w:World,x:number,y:number,tx:number,ty:number,radius:number):boolean {
 if(!los(x,y,tx,ty,w.propSolids))return false;
 const count=Math.ceil(Math.hypot(tx-x,ty-y)/.3);
 for(let i=1;i<=count;i++) {
  const px=x+(tx-x)*i/count,py=y+(ty-y)*i/count,p={x:px,y:py};
  collide(p,radius,w.propSolids);
  if(Math.hypot(p.x-px,p.y-py)>.03)return false;
 }
 return true;
}
