import {chromium} from 'playwright';
import {execute,chooseAction} from '../src/strategy/agents';
import type {View} from '../src/strategy/engine';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors:string[]=[],failed:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();await page.selectOption('#enemy','baseline');await page.click('#start');
 const trace=[];
 for(let turn=0;turn<24;turn++){
  const state=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));if(state.winner)break;
  const v:View=state.view,os=v.units.flatMap(u=>execute({...v,units:[u]},chooseAction({...v,units:[u]})));
  for(const o of os){await page.locator(`button[data-unit="${o.unit}"]`).click();await page.locator(`[data-action="${o.kind}"]`).click();if(o.target){const p=await page.evaluate(p=>(window as any).strategy_visual.project(p),o.target);await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}}
  const prepared=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()).orders);assert.deepEqual(prepared,os);
  await page.locator('#resolve').click();await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy);
  // Let result reports finish, as a player taking stock of the turn would.
  await page.waitForFunction(()=>{const a=(window as any).strategy_visual.audio().vox;return !a.active&&!a.pending.length;},null,{timeout:15000});
  const audio=await page.evaluate(()=>(window as any).strategy_visual.audio());trace.push({turn:v.turn,contacts:v.contacts.length,audio});
  if(audio.vox.history.some((h:any)=>h.unit.startsWith('n'))&&turn<12)await page.screenshot({path:'docs/vox/nightlords-combat.png'});
  console.log('Turn',v.turn,'voices',audio.vox.history.length);
  writeFileSync('docs/vox/match-progress.json',JSON.stringify({turn:v.turn,events:[...new Set(audio.vox.history.map((h:any)=>h.event))],errors,failed},null,2));
 }
 const state=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text())),audio=await page.evaluate(()=>(window as any).strategy_visual.audio());
 await page.screenshot({path:'docs/vox/complete-match.png'});
 writeFileSync('docs/vox/match-check.json',JSON.stringify({winner:state.winner,turn:state.view.turn,score:state.view.score,audio,trace,errors,failed},null,2));
 assert.ok(state.winner);assert.equal(audio.vox.maxConcurrent,1);assert.deepEqual(audio.vox.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 assert.ok(audio.vox.history.some((h:any)=>h.unit.startsWith('n')&&h.status==='ended'));
 assert.ok(audio.vox.history.some((h:any)=>h.event==='victory'||h.event==='defeat'));
 console.log('Full match completed with both factions, no overlap or audio errors.');
}finally{await browser.close();}
