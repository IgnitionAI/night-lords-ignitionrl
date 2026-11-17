import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const tag=process.argv[2]??'before',out=`docs/fps-motion/${tag}`;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 for(const mode of ['duel','mission']){
  const ctx=await browser.newContext({viewport:{width:1280,height:720},locale:'fr',recordVideo:{dir:out,size:{width:1280,height:720}}});const p=await ctx.newPage(),errors:string[]=[],trace:any[]=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:18231/fps.html?seed=527${mode==='duel'?'&duel=1':''}`);await p.locator('#fps-deploy').click({timeout:120000});
  if(mode==='mission')await p.keyboard.down('KeyW');
  for(let i=0;i<36;i++){
   await p.waitForTimeout(220);
   if(mode==='mission'&&i===11)await p.keyboard.up('KeyW');
   if(mode==='duel'&&i===15)await p.keyboard.down('KeyD');
   if(mode==='duel'&&i===21)await p.keyboard.up('KeyD');
   trace.push(await p.evaluate(()=>(window as any).__NL));
   if(mode==='duel'||i%3===0)await p.screenshot({path:`${out}/${mode}-${String(i).padStart(2,'0')}.jpg`,type:'jpeg',quality:78});
  }
  await p.keyboard.press('KeyP');await ctx.close();renameSync(await p.video()!.path(),`${out}/${mode}.webm`);
  writeFileSync(`${out}/${mode}.json`,JSON.stringify({tag,mode,seed:527,errors,trace},null,2));console.log(mode,errors,trace.map(t=>[t.tick,t.hp,t.bodies?.[0]?.kind]));
 }
}finally{await browser.close();}
