import {newWorld,step,T_IDLE,angNorm} from '../src/sim';
import {eliteDuelAction} from '../src/fps-duel';
const results=[];
for(const elite of [false,true])for(const style of ['stationary','backpedal','strafe','fist','expert']){
 let wins=0,ticks=0,hp=0;
 for(let seed=Number(process.env.SEED_START ?? 1);seed<Number(process.env.SEED_START ?? 1)+100;seed++){
  const w=newWorld(seed,{x:4,y:12,facing:0},{fps:true,eliteDuel:elite});
  w.nls.forEach((n,i)=>{n.alive=i===0;n.x=11;n.y=12;n.facing=Math.PI;n.cd=10;});
  let aim=0;
  while(!w.done && w.tick<1200){
   const n=w.nls[0],d=Math.hypot(n.x-w.t.x,n.y-w.t.y);
   const target=Math.atan2(n.y-w.t.y,n.x-w.t.x);
   // Finite tracking speed and repeatable aim error, rather than perfect hitscan tracking.
   const err=style==='expert' ? .015 : .12;
   aim+=Math.max(-.25,Math.min(.25,angNorm(target-aim)));
   const ta={...T_IDLE,aimYaw:aim+Math.sin(w.tick*.31+seed)*err,aimPitch:-.05,
     fwd:style==='backpedal'||style==='expert' ? -1 : style==='fist' ? 1:0,
     strafe:style==='strafe'||style==='expert' ? (Math.floor(w.tick/24)%2 ? 1:-1):0,
     bolt:style!=='fist',fist:style==='fist'&&d<2.8};
   let a;
   if(elite) a=eliteDuelAction(w,0);
   else {n.belief.valid=true;n.belief.x=w.t.x;n.belief.y=w.t.y;
    a=(n.shotTicks||n.armTicks||n.stunTicks||(n.cd>0&&d<3))?0:d>4&&w.tick%100<55?(w.tick%30<8?3:0):d<1.7?7:d<5&&w.tick%36<10?3:1;}
   step(w,ta,[a,0,0,0]);
  }
  if(!w.nls[0].alive)wins++;ticks+=w.tick;hp+=w.t.hp;
 }
 results.push({elite,style,wins,rounds:100,meanSeconds:ticks/1000,meanPlayerHp:hp/100});
}
console.log(JSON.stringify(results,null,2));
