import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const alternate=process.env.SHIP_ROUTE==='port';
const combat=process.env.SHIP_COMBAT==='1';
const dir=combat?(process.env.SHIP_GPU==='1'?(alternate?'docs/captures/ship-route-gpu-port':'docs/captures/ship-route-gpu'):'docs/captures/ship-route-combat'):alternate?'docs/captures/ship-route-port':'docs/captures/ship-route';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:process.env.SHIP_GPU==='1'?['--use-angle=metal']:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:640,height:400}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?seed=527&bench=1');await page.waitForFunction(()=>window.__NL?.genestealersLoaded===6&&window.__NL?.bodies?.length===4,{},{timeout:60000});
 await page.screenshot({path:dir+'/entry.png'});
 await page.mouse.click(320,200);
 // Test observer reads public geometry and visible target coordinates only.
 // The game is still driven through keyboard inputs and its mouse-look handler.
 await page.evaluate(async()=>{
  const sim=await import('/src/sim.ts'), nav=await import('/src/ship-path.ts'), props=await import('/src/props.ts');
  let lastHP=30,lastContact=null,scanUntil=0;
  const map=sim.newWorld(527,undefined,{mission:true,fps:true,propKinds:props.PROP_KINDS});
  window.__routeObserver=(target,combat)=>{
   const s=window.__NL,p=s.playerPosition,look=window.__FPS;
   const candidates=[...s.hunt.agents.filter(n=>n.alive).map(n=>({...n,z:(n.height??0)+1.5})),...s.mission.xenos.filter(n=>n.hp>0).map(n=>({...n,z:1.2}))];
   const visible=candidates.filter(n=>Math.hypot(n.x-p.x,n.y-p.y)<18&&Math.abs(sim.angNorm(Math.atan2(n.y-p.y,n.x-p.x)-look.yaw))<.65&&sim.los(p.x,p.y,n.x,n.y,map.propSolids)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
   let foe=combat?visible[0]:null;
   if(foe)lastContact={...foe,until:s.tick+12};
   else if(combat&&lastContact&&s.tick<lastContact.until)foe=lastContact;
   const hurt=s.hp<lastHP;lastHP=s.hp;
   if(combat&&hurt&&!visible[0]){lastContact=null;foe=null;scanUntil=s.tick+15;look.applyLook(Math.PI/.00215,0);return {error:Math.PI,fire:false,fist:false,back:false,move:false};}
   if(combat&&!foe&&s.tick<scanUntil){look.applyLook(.16/.00215,0);return {error:.16,fire:false,fist:false,back:false,move:false};}
   const yaw=foe?Math.atan2(foe.y-p.y,foe.x-p.x):nav.shipHeading(map,p.x,p.y,target[0],target[1],.85);
   const d=foe?Math.hypot(foe.x-p.x,foe.y-p.y):Infinity;
   const pitch=foe?Math.atan2(foe.z-look.eyeY,d):-.06;
   const error=sim.angNorm(yaw-look.yaw);look.applyLook(error/.00215,(look.pitch-pitch)/.00215);
   return {error:Math.abs(error),fire:!!foe,fist:d<2.8,back:false,move:(!foe||d>14)&&Math.abs(error)<.25,target:foe?{x:foe.x,y:foe.y,d}:null};
  };
 });
 const pressed=new Set();
 const setKey=async(key,down)=>{if(down===pressed.has(key))return;await page.keyboard[down?'down':'up'](key);if(down)pressed.add(key);else pressed.delete(key);};
 const sequence=[];let reportedTick=-30;
 const route=alternate?[[10,12],[10,6],[62,6],[62,14],[67,14],[62,14],[62,6],[10,6],[10,12],[3,12]]:[[62,12],[67,14],[62,12],[3,12]];
 for(const target of route){
  const deadline=Date.now()+120000;
  await setKey('KeyW',true);if(!alternate&&!combat)await setKey('Space',true);
  while(Date.now()<deadline){
   const state=await page.evaluate(()=>window.__NL);if(state.done)break;
   const report=state.tick-reportedTick>=30;
   const p=state.playerPosition;if(Math.hypot(target[0]-p.x,target[1]-p.y)<.8)break;
   const intent=await page.evaluate(([target,combat])=>window.__routeObserver(target,combat),[target,combat]);
   if(report){reportedTick=state.tick;console.log(JSON.stringify({tick:state.tick,hp:state.hp,at:state.playerPosition,alive:state.nlsAlive,intent}));}
   for(const [key,down] of [['KeyW',intent.move],['KeyS',intent.back],['Space',intent.fire||!alternate&&!combat],['KeyF',intent.fist]])await setKey(key,down);
   await page.waitForTimeout(150);
  }
  for(const key of ['KeyW','KeyS','Space','KeyF'])await setKey(key,false);
  const state=await page.evaluate(()=>window.__NL);sequence.push({target,state});console.log(JSON.stringify({target,tick:state.tick,position:state.playerPosition,hp:state.hp,done:state.done}));
  await page.screenshot({path:dir+'/'+target.join('-')+'.png'});if(state.done)break;
  if(target[0]===67||target[0]===3){await page.keyboard.down('KeyE');await page.waitForTimeout(target[0]===67?8000:5000);await page.keyboard.up('KeyE');}
 }
 writeFileSync(dir+'/sequence.json',JSON.stringify(sequence,null,2));
 await page.keyboard.press('KeyP');
 const state=await page.evaluate(()=>({state:window.__NL,frames:window.__benchFrames,audio:window.__AUDIO?.status()}));
 await page.screenshot({path:dir+'/outcome.png'});
 writeFileSync(dir+'/check.json',JSON.stringify({errors,...state},null,2));console.log(JSON.stringify({errors,state:state.state,frames:state.frames?.length}));
 if(state.state.genestealersLoaded!==6||!state.audio?.unlocked||state.audio?.missing?.length)throw Error('Runtime assets/audio check failed');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.kill();}
