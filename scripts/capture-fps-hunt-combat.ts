import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const out=process.argv[3]??'docs/fps-hunt/combat';mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{for(const mode of (process.argv[2]?[process.argv[2]]:['duel','mission']))for(const locale of (mode==='duel'?['fr']:['fr','en'])){
 const name=`${mode}-${locale}`,c=await b.newContext({locale,viewport:{width:960,height:600},recordVideo:{dir:out,size:{width:960,height:600}}}),p=await c.newPage(),trace:any[]=[],errors:string[]=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:18231/fps.html?seed=527&bench=1${mode==='duel'?'&duel=1':''}`);await p.locator('#fps-deploy').click({timeout:120000});
 const start=Date.now();
 for(let k=0;k<500;k++){
  const seconds=(Date.now()-start)/1000;
  const info=await p.evaluate(({seconds,mode})=>{
   const s=(window as any).__NL,f=(window as any).__FPS;if(!s?.agents||!f)return {d:99,recovery:0,cut:false};
   const ns=s.agents.filter((n:any)=>n.alive).sort((a:any,b:any)=>Math.hypot(a.x-s.playerPosition.x,a.y-s.playerPosition.y)-Math.hypot(b.x-s.playerPosition.x,b.y-s.playerPosition.y));
   const n=ns[0];if(!n)return {d:99,recovery:0,cut:s.seen.includes('lightsOut')};
   const dx=n.x-s.playerPosition.x,dz=n.y-s.playerPosition.y,d=Math.hypot(dx,dz);
   // Test player: aim via the normal mouse handler, with no simulation overrides.
   if(mode==='duel'||seconds>5){const a=Math.atan2(dz,dx),delta=Math.atan2(Math.sin(a-f.yaw),Math.cos(a-f.yaw));const pitch=Math.atan2(1.3-f.eyeY,d);f.applyLook(delta/.00215,(f.pitch-pitch)/.00215);}
   return {d,recovery:n.recovery??0,cut:s.seen.includes('lightsOut')};
  },{seconds,mode});
  const keys={KeyW:mode==='mission'&&seconds<5,KeyS:info.d<3,KeyA:seconds>5&&info.d<7&&Math.floor(seconds/3)%2===0,KeyD:seconds>5&&info.d<7&&Math.floor(seconds/3)%2===1,Space:info.cut&&(mode==='mission'||info.recovery>0)};
  for(const [key,on] of Object.entries(keys)){if(on)await p.keyboard.down(key);else await p.keyboard.up(key);}
  await p.waitForTimeout(100);const snap=await p.evaluate(()=>(window as any).__NL);trace.push({seconds,...snap});
  if(k%12===0)await p.screenshot({path:`${out}/${name}-${String(k).padStart(3,'0')}.jpg`,quality:80});
  if(snap.done||seconds>(mode==='duel'?55:35))break;
 }
 await p.keyboard.press('KeyP');const frames=await p.evaluate(()=>(window as any).__benchFrames);await c.close();renameSync(await p.video()!.path(),`${out}/${name}.webm`);
 writeFileSync(`${out}/${name}.json`,JSON.stringify({mode,locale,automatedPlayer:true,errors,frames,trace},null,2));console.log(name,errors,trace.at(-1)?.tick,trace.at(-1)?.hp,trace.at(-1)?.seen);
}}finally{await b.close();}
