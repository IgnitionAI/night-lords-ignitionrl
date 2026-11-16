import {chromium} from 'playwright';
import {boardingPlan,boardingAction} from '../src/strategy/boarding-agents';
import {planCost} from '../src/strategy/tactics';
import type {Order} from '../src/strategy/engine';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors:string[]=[],failed:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();
 assert.equal(await page.locator('#mission option').count(),3);assert.equal(await page.locator('#configuration option').count(),3);
 await page.selectOption('#enemy','ppo');await page.click('#start');await page.click('#overview');
 const state=()=>page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));
 const order=async(o:Order)=>{await page.locator(`button[data-unit="${o.unit}"]`).click();await page.locator(`[data-action="${o.kind}"]`).click();if(o.target){const p=await page.evaluate(p=>(window as any).strategy_visual.project(p),o.target);await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}if(o.reaction)await page.click('#reserve');};
 await page.click('[data-card="cover"]');await order({unit:'t0',kind:'special',reaction:true});await order({unit:'t1',kind:'scan'});await order({unit:'t2',kind:'scan'});
 const before=(await state()).orders;await order({unit:'t3',kind:'guard'});assert.deepEqual((await state()).orders,before);assert.equal(planCost(before,'cover'),6);assert.match(await page.locator('#message').innerText(),/Budget partagé dépassé/);
 await page.screenshot({path:'docs/boarding/command-budget.png'});
 const trace:any[]=[];
 for(let turn=0;turn<18;turn++){
  const s=await state();if(s.winner)break;
  if(turn>0){const p=boardingPlan(s.view,boardingAction(s.view));if(p.card)await page.locator(`[data-card="${p.card}"]`).first().click();for(const o of p.orders)await order(o);const prepared=await state();assert.equal(planCost(prepared.orders,prepared.selectedCard),planCost(p.orders,p.card));assert.deepEqual(prepared.orders.map((o:any)=>[o.unit,o.kind,o.target,!!o.reaction]).sort(),p.orders.map(o=>[o.unit,o.kind,o.target,!!o.reaction]).sort());}
  const planned=await state();assert.ok(planCost(planned.orders,planned.selectedCard)<=planned.view.tactics.budget);
  await page.locator('#resolve').click();await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy,null,{timeout:20000});
  const after=await state();trace.push({turn:s.view.turn,orders:planned.orders,card:planned.selectedCard,score:after.view.score,threat:after.view.tactics.threat,contacts:after.view.contacts.length});
  console.log('TURN',s.view.turn,'score',after.view.score,'contacts',after.view.contacts.length);
  if(after.view.contacts.length&&turn<10)await page.screenshot({path:'docs/boarding/contact.png'});
 }
 const final=await state();assert.ok(final.winner);await page.locator('#evaluation summary').click();assert.match(await page.locator('#evaluation').innerText(),/16064/);assert.equal(await page.locator('#evaluation tbody tr').count(),3);
 await page.screenshot({path:'docs/boarding/debrief.png'});
 const audio=await page.evaluate(()=>(window as any).strategy_visual.audio());assert.equal(audio.vox.maxConcurrent,1);assert.deepEqual(audio.vox.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const proof={winner:final.winner,turns:trace.length,mode:final.enemyMode,trace,audio,errors,failed,checks:['shared budget refuses overcommit','cards and reserve via actual buttons','unique ability via button','PPO selectable and complete match','held-out evaluation displayed','no page/audio/asset errors']};writeFileSync('docs/boarding/ui-match.json',JSON.stringify(proof,null,2));
 // Check setup for the remaining mission configurations and a narrow viewport.
 await page.reload();await page.locator('#start').waitFor();await page.selectOption('#mission','blackout');await page.selectOption('#configuration','28');await page.selectOption('#enemy','baseline');await page.click('#start');assert.equal((await state()).view.tactics.mission,'blackout');
 await page.reload();await page.locator('#start').waitFor();await page.selectOption('#mission','recovery');await page.selectOption('#configuration','39');await page.click('#start');assert.equal((await state()).view.tactics.mission,'recovery');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/boarding/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 console.log('Complete boarding match, setup variants, budget and evaluation verified.');
}finally{await browser.close();}
