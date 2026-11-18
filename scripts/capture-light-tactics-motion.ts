import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const mode=process.argv[2]??'duel',out=`docs/fps-light-tactics/motion-${mode}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try {
 const p=await browser.newPage({viewport:{width:1280,height:720}}),errors:string[]=[],trace:any[]=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`http://127.0.0.1:18231/fps.html?${mode==='duel'?'duel=1&':''}cap=1&motionlab=1&lighttacticslab=1&seed=527`);
 await p.waitForFunction(()=>!!(window as any).__motionFrame,{},{timeout:120000});
 await p.locator('#fps-deploy').click();
 // Actual play is recorded separately.
 await p.evaluate(()=>document.querySelectorAll('.game-shell,#fps-prompt,#fps-entry').forEach(e=>(e as HTMLElement).style.display='none'));
 for(let i=0;i<600;i++){
  const v=await p.evaluate(()=>(window as any).__motionFrame());
  if(i>=360&&i<=408&&i%2===0)await p.screenshot({path:`${out}/action-${i}.jpg`,type:'jpeg',quality:92,clip:{x:430,y:180,width:420,height:360}});
  if(i%6===0){trace.push(v);await p.screenshot({path:`${out}/frame-${String(i/6).padStart(3,'0')}.jpg`,type:'jpeg',quality:85});}
 }
 writeFileSync(`${out}/trace.json`,JSON.stringify({fixture:true,mode,fps:10,errors,trace},null,2));console.log(mode,errors,trace.length);
}finally{await browser.close();}
