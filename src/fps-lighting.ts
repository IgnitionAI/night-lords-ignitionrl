import {collide,los,geometry,type World} from './sim';
import {travel} from './fps-navigation';

export interface Circuit {x:number;y:number;blackoutUntil:number;warningUntil:number;cooldownUntil:number;saboteur:number;restoredAt:number;}
export interface HuntLighting {circuits:Circuit[];nightVision:boolean;darkTicks:number;brightTicks:number;}
export function makeLighting(mission:boolean):HuntLighting {
 const points=mission?[[8,11],[24,11],[40,11],[54,11],[64,29]]:[[8,11],[22,12],[34,12]];
 return {circuits:points.map(([x,y])=>({x,y,blackoutUntil:0,warningUntil:0,cooldownUntil:15,saboteur:-1,restoredAt:-999})),nightVision:false,darkTicks:0,brightTicks:0};
}
export function circuitAt(w:World,x:number,y:number):Circuit|undefined {
 let best: Circuit|undefined,d=Infinity;
 for(const c of w.lighting?.circuits??[]){const v=Math.hypot(x-c.x,y-c.y);if(v<d){best=c;d=v;}}
 return best;
}
export function isDark(w:World,x:number,y:number){return (circuitAt(w,x,y)?.blackoutUntil??0)>w.tick;}

/** Tick-owned timers. A dead, displaced or interrupted saboteur cannot finish a cut. */
export function updateLighting(w:World){
 const light=w.lighting;if(!light)return;
 for(const c of light.circuits){
  if(c.warningUntil){
   if(w.tick===c.warningUntil-11)w.events.push({type:'lightsWarning',zone:light.circuits.indexOf(c)});
   const n=w.nls[c.saboteur];
   if(!n?.alive||n.stunTicks||w.tick-(n.lastDamageTick??-999)<2||Math.hypot(n.x-c.x,n.y-c.y)>1.4){
    c.warningUntil=0;c.saboteur=-1;c.cooldownUntil=w.tick+35;
   }else if(w.tick>=c.warningUntil){
    c.warningUntil=0;c.blackoutUntil=w.tick+65;c.cooldownUntil=w.tick+185;
    w.events.push({type:'lightsOut',zone:light.circuits.indexOf(c)});
   }
  }
  if(c.blackoutUntil>0&&w.tick>=c.blackoutUntil){
   c.blackoutUntil=0;c.restoredAt=w.tick;c.saboteur=-1;
   w.events.push({type:'lightsRestored',zone:light.circuits.indexOf(c)});
   for(const n of w.nls)if(n.alive&&circuitAt(w,n.x,n.y)===c){n.lightRetreatUntil=w.tick+28;n.lightCover=undefined;}
  }
 }
 if(isDark(w,w.t.x,w.t.y)){light.darkTicks++;light.brightTicks=0;if(light.darkTicks>=4)light.nightVision=true;}
 else{light.brightTicks++;light.darkTicks=0;if(light.brightTicks>=5)light.nightVision=false;}
}

/** Returns an override only for sabotage/withdrawal; normal learned tactics continue otherwise. */
export function lightAction(w:World,i:number):number|undefined {
 const n=w.nls[i],b=n.belief,light=w.lighting;if(!light||n.vertical)return;
 if(n.armTicks||n.shotTicks||n.stunTicks||(n.recoveryTicks??0)>0)return;
 const active=light.circuits.find(c=>c.saboteur===i&&c.warningUntil>w.tick);
 if(active)return 0;
 if((n.lightRetreatUntil??0)>w.tick&&b.valid){
  if(!n.lightCover){
   let best=Infinity;const size=geometry(w.propSolids).size;
   // Choose nearby cover behind actual geometry. Never hide or teleport the mesh.
   for(let dy=-8;dy<=8;dy+=1)for(let dx=-8;dx<=8;dx+=1){
    const x=n.x+dx,y=n.y+dy;if(x<.6||y<.6||x>size.w-.6||y>size.h-.6||Math.hypot(x-b.x,y-b.y)<3)continue;
    const p={x,y};collide(p,.55,w.propSolids);if(Math.hypot(p.x-x,p.y-y)>.02||los(x,y,b.x,b.y,w.propSolids))continue;
    const cost=Math.hypot(dx,dy)+Math.abs(Math.hypot(x-b.x,y-b.y)-6)*.2;
    if(cost<best){best=cost;n.lightCover={x,y};}
   }
  }
  if(n.lightCover)return travel(w,i,n.lightCover.x,n.lightCover.y,.35);
  const d=Math.hypot(n.x-b.x,n.y-b.y)||1;
  const p={x:n.x+(n.x-b.x)/d*3,y:n.y+(n.y-b.y)/d*3};collide(p,.55,w.propSolids);
  return travel(w,i,p.x,p.y,.3);
 }
 if(!b.valid||b.age>12||isDark(w,n.x,n.y)||Math.hypot(n.x-b.x,n.y-b.y)<2.8)return;
 // One hunter per local circuit; a distant switch is not worth abandoning the hunt.
 const c=circuitAt(w,n.x,n.y);
 if(!c||c.blackoutUntil||c.warningUntil||c.cooldownUntil>w.tick||Math.hypot(c.x-b.x,c.y-b.y)>11||Math.hypot(n.x-c.x,n.y-c.y)>6)return;
 const other=light.circuits.some(c=>c.warningUntil>0);if(other)return;
 if(Math.hypot(n.x-c.x,n.y-c.y)>1.15)return travel(w,i,c.x,c.y,.7);
 c.saboteur=i;c.warningUntil=w.tick+12;
 return 0;
}
