import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const tag=process.argv[2]??'before',out=`docs/fps-hunt/${tag}`;
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try {
 for(const mode of ['duel','mission']) {
  const c=await browser.newContext({locale:'fr',viewport:{width:960,height:600},recordVideo:{dir:out,size:{width:960,height:600}}});
  const p=await c.newPage(),errors:string[]=[],trace:any[]=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:18231/fps.html?seed=527&bench=1${mode==='duel'?'&duel=1':''}`);
  await p.locator('#fps-deploy').click({timeout:120000});
  const start=Date.now();
  // Identical player inputs in each version; no position/health/AI overrides.
  for(let i=0;i<(mode==='duel'?60:140);i++) {
   const s=(Date.now()-start)/1000;
   for(const [key,on] of Object.entries({KeyW:mode==='mission'&&s<5,KeyS:mode==='duel'&&s<2,KeyD:s>6&&s<8,Space:mode==='duel'&&s>3&&s<6,KeyF:mode==='duel'&&s>8&&s<9})) {
    if(on)await p.keyboard.down(key);else await p.keyboard.up(key);
   }
   await p.waitForTimeout(150);
   const snap=await p.evaluate(()=>(window as any).__NL);trace.push({seconds:s,...snap});
   if(i%8===0)await p.screenshot({path:`${out}/${mode}-${String(i).padStart(3,'0')}.jpg`,quality:80});
   if(snap?.done)break;
  }
  await p.keyboard.press('KeyP');
  const frames=await p.evaluate(()=>(window as any).__benchFrames??[]);
  await c.close();renameSync(await p.video()!.path(),`${out}/${mode}.webm`);
  writeFileSync(`${out}/${mode}.json`,JSON.stringify({tag,mode,seed:527,errors,frames,trace},null,2));
  console.log(JSON.stringify({mode,errors,tick:trace.at(-1)?.tick,hp:trace.at(-1)?.hp,samples:trace.length}));
 }
} finally {await browser.close();}
