import {chromium} from 'playwright';import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const out='docs/fps-motion/final/combat';mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{for(const locale of ['fr','en']){
 const c=await b.newContext({locale,viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),p=await c.newPage(),trace:any[]=[],errors:string[]=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:18231/fps.html?duel=1&seed=527');await p.locator('#fps-deploy').click({timeout:120000});
 await p.keyboard.down('KeyS');
 for(let i=0;i<45;i++){
  // Automated aim uses the exposed render diagnostics and the normal mouse-look handler; damage remains real.
  await p.evaluate(()=>{
    const n=(window as any).__NL,f=(window as any).__FPS;
    const feet=n?.bodies[0]?.motion?.feet;if(!feet||!f)return;
    const x=(feet[0].position[0]+feet[1].position[0])*.5-n.playerPosition.x;
    const z=(feet[0].position[2]+feet[1].position[2])*.5-n.playerPosition.y;
    const angle=Math.atan2(z,x),delta=Math.atan2(Math.sin(angle-f.yaw),Math.cos(angle-f.yaw));
    const pitch=Math.atan2(1.3-f.eyeY,Math.hypot(x,z));f.applyLook(delta/.00215,(f.pitch-pitch)/.00215);
  });
  await p.keyboard.press('Space');if(i===6)await p.keyboard.up('KeyS');if(i===10)await p.keyboard.down('KeyA');if(i===16)await p.keyboard.up('KeyA');
  await p.waitForTimeout(85);trace.push(await p.evaluate(()=>(window as any).__NL));
  await p.screenshot({path:`${out}/${locale}-${String(i).padStart(2,'0')}.jpg`,quality:75});
 }
 await p.keyboard.press('KeyP');await c.close();renameSync(await p.video()!.path(),`${out}/${locale}.webm`);writeFileSync(`${out}/${locale}.json`,JSON.stringify({locale,errors,trace},null,2));console.log(locale,errors,'hits',trace.filter(t=>t.bodies[0].motion?.state==='hit').length,'events',[...new Set(trace.flatMap(t=>t.seen))]);
}}finally{await b.close();}
