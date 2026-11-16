import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='docs/captures/mission/runtime';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?seed=527&bench=1');await page.waitForFunction(()=>window.__NL?.genestealersLoaded===6&&window.__NL?.bodies?.length===4,{},{timeout:60000});
 await page.screenshot({path:dir+'/entry.png'});
 await page.mouse.click(480,300);await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
 await page.keyboard.down('Space');await page.waitForTimeout(1800);await page.keyboard.up('Space');await page.keyboard.press('KeyP');
 await page.screenshot({path:dir+'/contact.png'});
 const state=await page.evaluate(()=>({state:window.__NL,frames:window.__benchFrames,audio:window.__AUDIO?.status()}));
 writeFileSync(dir+'/check.json',JSON.stringify({errors,...state},null,2));console.log(JSON.stringify({errors,state:state.state,frames:state.frames?.length}));
 if(state.state.genestealersLoaded!==6||!state.audio?.unlocked||state.audio?.missing?.length)throw Error('Runtime assets/audio check failed');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.kill();}
