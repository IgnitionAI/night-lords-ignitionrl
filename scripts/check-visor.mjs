import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(new Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:390,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?cam=fps&mute=1');
 await page.waitForSelector('#hud .armor');await page.waitForTimeout(4500);
 await page.screenshot({path:'docs/captures/phosphor/narrow.png'});
 const panels=await page.locator('#hud .cell, #hud .meta').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {class:e.className,x:r.x,y:r.y,width:r.width,height:r.height,inBounds:r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight};}));
 writeFileSync('docs/captures/phosphor/layout.json',JSON.stringify({viewport:{width:390,height:720},errors,panels},null,2));
 if(errors.length||panels.some(p=>!p.inBounds))throw new Error('Viewport checks failed');
 console.log('Narrow viewport rendered; panels fit; no page errors.');
} finally {await browser?.close();server.kill();}
