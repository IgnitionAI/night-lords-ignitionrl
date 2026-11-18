import {chromium} from 'playwright';
import {execute,chooseAction} from '../src/strategy/agents';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.env.IMMERSION_OUT??'docs/immersion/final';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors:string[]=[],failed:string[]=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+' '+r.status());});
await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();await page.selectOption('#enemy','ppo');await page.click('#start',{force:true});
await page.click('#sound',{force:true});
for(const [channel,value] of [['master','55'],['music','20'],['ambience','18'],['effects','60']])await page.locator(`[data-volume="${channel}"]`).fill(value);
await page.locator('[data-volume="master"]').fill('0');await page.waitForTimeout(200);const muted=await page.evaluate(()=>(window as any).strategy_visual.audio());
if(muted.tracks.some(t=>t.volume!==0))throw Error('Mute failed');
await page.locator('[data-volume="master"]').fill('55');await page.click('#audio-close',{force:true});
const trace:any[]=[],motion:any[]=[],performance:any[]=[];
const state=()=>page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));
let capturedCombat=false;
for(let turn=0;turn<24;turn++){
  const s=await state();if(s.winner)break;
  const v=s.view,orders=v.units.flatMap((u:any)=>execute({...v,units:[u]},chooseAction({...v,units:[u]})));
  for(const o of orders){await page.locator(`[data-unit="${o.unit}"]`).click({force:true});await page.locator(`[data-action="${o.kind}"]`).click({force:true});if(o.target){const p=await page.evaluate(p=>(window as any).strategy_visual.project(p),o.target);await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}}
  if(JSON.stringify((await state()).orders)!==JSON.stringify(orders))throw Error('Orders differ at '+turn);
  const combat=!capturedCombat&&orders.some(o=>o.kind==='fire');
  if(turn===0||combat){await page.locator(`[data-unit="${orders.find(o=>o.kind==='fire')?.unit??'t0'}"]`).click({force:true});await page.click('#focus',{force:true});}
  if(turn===0||combat)await page.evaluate(()=>{
    (window as any).__frames=[];let start=0,index=0;const times=[600,1000,1400,1900,2400,2800,2900,3000,3200,3550,3950];
    const sample=()=>{const s=JSON.parse((window as any).render_game_to_text());if(s.busy){if(!start)start=performance.now();const elapsed=performance.now()-start;if(index<times.length&&elapsed>=times[index]){(window as any).__frames.push({ms:elapsed,requested:times[index++],image:(document.querySelector('#map') as HTMLCanvasElement).toDataURL(),visual:(window as any).strategy_visual.diagnostics()});}}if(!start||s.busy)requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  await page.click('#resolve',{force:true});
  await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy);
  if(turn===0||combat){const frames=await page.evaluate(()=>(window as any).__frames);for(const f of frames){const file=`${out}/${turn===0?'walk':'combat'}-frame-${Math.round(f.ms)}.png`;writeFileSync(file,Buffer.from(f.image.split(',')[1],'base64'));motion.push({kind:turn===0?'walk':'combat',actualMs:f.ms,file,figures:f.visual.figures});}if(combat)capturedCombat=true;}
  const d=await page.evaluate(()=>(window as any).strategy_visual.diagnostics());performance.push({turn:turn+1,...d.frameMs,drawCalls:d.drawCalls,triangles:d.triangles});trace.push({turn:turn+1,animations:d.animations});
  if(!(await state()).winner){await page.click('#overview',{force:true});if(turn===6)await page.screenshot({path:out+'/battle.png'});}
  writeFileSync(out+'/progress.json',JSON.stringify({performance,trace,motion,errors,failed},null,2));
  console.log('Tour',turn+1,'vérifié');
}
const end=await state();if(!end.winner)throw Error('No complete match');await page.waitForTimeout(1800);await page.screenshot({path:out+'/debrief.png'});
const audio=await page.evaluate(()=>(window as any).strategy_visual.audio());
if(!audio.tracks.find(t=>t.name==='ending'&&!t.paused&&t.time>0&&t.volume>0))throw Error('End music not playing');
if(!audio.played.servo||!audio.played.bolter||!audio.played.impact)throw Error('Missing audible effects');
await page.locator('.debrief-row summary').first().click({force:true});const download=page.waitForEvent('download');await page.click('#export',{force:true});await (await download).saveAs(out+'/debrief.json');
await page.locator('.debrief-row summary').last().click();await page.locator('[data-replay]').last().click();await page.screenshot({path:out+'/replay.png'});
writeFileSync(out+'/report.json',JSON.stringify({errors,failed,winner:end.winner,turns:end.view.turn-1,score:end.view.score,audio,performance,trace,motion,visual:await page.evaluate(()=>(window as any).strategy_visual.diagnostics())},null,2));
await page.setViewportSize({width:960,height:600});await page.screenshot({path:out+'/compact.png'});
await page.reload();await page.locator('#start').waitFor();const persisted=await page.evaluate(()=>(window as any).strategy_visual.audio());if(persisted.volumes.master!==.55||persisted.volumes.music!==.2)throw Error('Audio settings not preserved');
writeFileSync(out+'/settings.json',JSON.stringify({muted,persisted},null,2));await browser.close();console.log('Partie complète et réglages vérifiés',end.winner,errors,failed);
