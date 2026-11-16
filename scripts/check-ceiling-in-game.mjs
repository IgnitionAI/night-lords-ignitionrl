import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='docs/captures/ceiling-in-game';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18246'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18246')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18246/web/index.html?demo=ceiling&cap=1&seed=527');
 await page.waitForFunction(()=>window.__capStep,{},{timeout:60000});await page.waitForLoadState('networkidle');await page.mouse.click(480,300);
 const frames=[];
 for(let k=0;k<90;k++){
  await page.evaluate(()=>window.__capStep(1));
  if([0,7,13,24,38,48,52,56,60,65,72,85].includes(k)){
   const state=await page.evaluate(()=>window.__NL);const path=`${dir}/${String(k+1).padStart(3,'0')}.png`;await page.screenshot({path});frames.push({time:(k+1)*.1,path,state});
  }
 }
 writeFileSync(dir+'/frames.json',JSON.stringify({scope:'Staged initial encounter; real simulation and equipped in-game rigs; not mission completion',errors,frames},null,2));console.log(JSON.stringify({errors,phases:frames.map(f=>({time:f.time,n:f.state.hunt.agents[0],hp:f.state.hp}))}));
 await page.goto('http://127.0.0.1:18246/web/index.html?demo=coolant&cap=1&seed=527');await page.waitForFunction(()=>window.__capStep,{},{timeout:60000});await page.waitForLoadState('networkidle');await page.mouse.click(480,300);await page.evaluate(()=>window.__capStep(1));await page.screenshot({path:dir+'/coolant-room.png'});
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.kill();}
