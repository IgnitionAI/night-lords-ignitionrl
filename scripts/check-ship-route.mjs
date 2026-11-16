import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='docs/captures/ship-route';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?seed=527&bench=1');await page.waitForFunction(()=>window.__NL?.genestealersLoaded===6&&window.__NL?.bodies?.length===4,{},{timeout:60000});
 await page.screenshot({path:dir+'/entry.png'});
 await page.mouse.click(480,300);
 const sequence=[];
 for(const target of [[62,12],[67,14],[62,12],[3,12]]){
  const deadline=Date.now()+120000;
  await page.keyboard.down('KeyW');await page.keyboard.down('Space');
  while(Date.now()<deadline){
   const state=await page.evaluate(()=>window.__NL);if(state.done)break;
   const p=state.playerPosition;if(Math.hypot(target[0]-p.x,target[1]-p.y)<.8)break;
   await page.evaluate(([x,y])=>{const p=window.__NL.playerPosition,look=window.__FPS;let delta=Math.atan2(y-p.y,x-p.x)-look.yaw;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;look.applyLook(delta/.00215,0);},target);
   await page.waitForTimeout(150);
  }
  await page.keyboard.up('KeyW');await page.keyboard.up('Space');
  const state=await page.evaluate(()=>window.__NL);sequence.push({target,state});
  await page.screenshot({path:dir+'/'+target.join('-')+'.png'});if(state.done)break;
  if(target[0]===67||target[0]===3){await page.keyboard.down('KeyE');await page.waitForTimeout(target[0]===67?8000:5000);await page.keyboard.up('KeyE');}
 }
 writeFileSync(dir+'/sequence.json',JSON.stringify(sequence,null,2));
 await page.keyboard.press('KeyP');
 const state=await page.evaluate(()=>({state:window.__NL,frames:window.__benchFrames,audio:window.__AUDIO?.status()}));
 writeFileSync(dir+'/check.json',JSON.stringify({errors,...state},null,2));console.log(JSON.stringify({errors,state:state.state,frames:state.frames?.length}));
 if(state.state.genestealersLoaded!==6||!state.audio?.unlocked||state.audio?.missing?.length)throw Error('Runtime assets/audio check failed');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.kill();}
