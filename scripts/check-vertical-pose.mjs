import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='docs/captures/vertical';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18245'],{stdio:'pipe'});let browser;
try{await new Promise((res,rej)=>{const timer=setTimeout(()=>rej(Error('timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18245')){clearTimeout(timer);res();}});});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18245/web/vertical-review.html');await page.waitForFunction(()=>window.ready,{},{timeout:60000});
 const rows=[];for(const [phase,time,h]of [['climb',.5,1],['traverse',1,3],['traverse',1.4,3],['perch',2,3],['drop',2.5,1.5]]){rows.push({phase,time,h,hands:await page.evaluate(([p,t,h])=>window.pose(p,t,h),[phase,time,h])});await page.screenshot({path:`${dir}/${phase}-${time}.png`});}
 writeFileSync(dir+'/poses.json',JSON.stringify({fixture:true,errors,rows},null,2));console.log(JSON.stringify({errors,rows}));if(errors.length)throw Error(errors.join(';'));
}finally{await browser?.close();server.kill();}
