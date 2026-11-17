import {chromium} from 'playwright';
import {boardingPlan,boardingAction} from '../src/strategy/boarding-agents';
import {planCost} from '../src/strategy/tactics';
import type {Order} from '../src/strategy/engine';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const language=(process.argv[2]??'fr') as 'fr'|'en';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({locale:language==='fr'?'fr-FR':'en-GB',viewport:{width:1280,height:800}}),errors:string[]=[],failed:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 await page.goto('http://127.0.0.1:18231/strategy.html');await page.locator('#start').waitFor();
 assert.equal(await page.locator('#mission option').count(),3);assert.equal(await page.locator('#configuration option').count(),3);
 await page.selectOption('#enemy','ppo');await page.click('#start');await page.click('#overview');
 await page.click('#sound');await page.click('#vox-test');await page.waitForTimeout(3500);await page.click('#vox-test-nightlords');await page.waitForTimeout(4000);await page.click('#audio-close');
 const state=()=>page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));
 const order=async(o:Order)=>{await page.locator(`button[data-unit="${o.unit}"]`).click();await page.locator(`[data-action="${o.kind}"]`).click();if(o.target){const p=await page.evaluate(p=>(window as any).strategy_visual.project(p),o.target);await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}if(o.reaction)await page.click('#reserve');};
 await page.click('[data-card="cover"]');await order({unit:'t0',kind:'special',reaction:true});await order({unit:'t1',kind:'scan'});await order({unit:'t2',kind:'scan'});
 const before=(await state()).orders;await order({unit:'t3',kind:'guard'});assert.deepEqual((await state()).orders,before);assert.equal(planCost(before,'cover'),6);assert.match(await page.locator('#message').innerText(),language==='fr'?/Budget partagé dépassé/:/Shared budget exceeded/);
 await page.screenshot({path:`docs/i18n/command-budget-${language}.png`});
 const trace:any[]=[];
 for(let turn=0;turn<18;turn++){
  const s=await state();if(s.winner)break;
  if(turn>0){const p=boardingPlan(s.view,boardingAction(s.view));if(p.card)await page.locator(`[data-card="${p.card}"]`).first().click();for(const o of p.orders)await order(o);const prepared=await state();assert.equal(planCost(prepared.orders,prepared.selectedCard),planCost(p.orders,p.card));assert.deepEqual(prepared.orders.map((o:any)=>[o.unit,o.kind,o.target,!!o.reaction]).sort(),p.orders.map(o=>[o.unit,o.kind,o.target,!!o.reaction]).sort());}
  const planned=await state();assert.ok(planCost(planned.orders,planned.selectedCard)<=planned.view.tactics.budget);
  await page.locator('#resolve').click();await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy,null,{timeout:20000});
  const after=await state();trace.push({turn:s.view.turn,orders:planned.orders,card:planned.selectedCard,score:after.view.score,threat:after.view.tactics.threat,contacts:after.view.contacts.length});
  console.log('TURN',s.view.turn,'score',after.view.score,'contacts',after.view.contacts.length);
  if(after.view.contacts.length&&turn<10)await page.screenshot({path:`docs/i18n/contact-${language}.png`});
 }
 const final=await state();
 await page.locator('.debrief-row').evaluateAll(nodes=>nodes.forEach(n=>n.setAttribute('open','')));
 const inLanguage=await page.locator('body').innerText();writeFileSync(`docs/i18n/debrief-${language}.txt`,inLanguage);
 if(language==='en')assert.ok(!/[àâçéèêëîïôùûüœ]/i.test(inLanguage),'French text remains in English debrief');
 await page.locator('.debrief-row').evaluateAll(nodes=>nodes.forEach(n=>n.removeAttribute('open')));
 // Switching the full debrief preserves history and the rendered controls.
 const saved=await state();await page.locator(`#modal [data-locale="${language==='fr'?'en':'fr'}"]`).click();assert.deepEqual(await state(),saved);assert.equal(await page.locator('html').getAttribute('lang'),language==='fr'?'en':'fr');
 await page.locator(`#modal [data-locale="${language}"]`).click();assert.ok(final.winner);await page.locator('#evaluation summary').click();assert.match(await page.locator('#evaluation').innerText(),/16064/);assert.equal(await page.locator('#evaluation tbody tr').count(),3);
 await page.screenshot({path:`docs/i18n/debrief-${language}.png`});
 const audio=await page.evaluate(()=>(window as any).strategy_visual.audio());assert.equal(audio.vox.maxConcurrent,1);assert.deepEqual(audio.vox.errors,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 assert.ok(audio.vox.history.some((h:any)=>h.event==='nl-taunt'&&h.status==='ended'));
 for(const h of audio.vox.history){assert.equal(h.locale,language);assert.equal(h.source.includes('/vox/en/'),language==='en');}
 const proof={language,winner:final.winner,turns:trace.length,mode:final.enemyMode,trace,audio,errors,failed,checks:['shared budget refuses overcommit','cards and reserve via actual buttons','unique ability via button','PPO selectable and complete match','held-out evaluation displayed','no page/audio/asset errors']};writeFileSync(`docs/i18n/ui-match-${language}.json`,JSON.stringify(proof,null,2));
 // Check setup for the remaining mission configurations and a narrow viewport.
 await page.reload();await page.locator('#start').waitFor();await page.selectOption('#mission','blackout');await page.selectOption('#configuration','28');await page.selectOption('#enemy','baseline');await page.click('#start');assert.equal((await state()).view.tactics.mission,'blackout');
 await page.reload();await page.locator('#start').waitFor();await page.selectOption('#mission','recovery');await page.selectOption('#configuration','39');await page.click('#start');assert.equal((await state()).view.tactics.mission,'recovery');
 await page.setViewportSize({width:390,height:844});await page.click('#rules');
 if(language==='en')assert.ok(!/[àâçéèêëîïôùûüœ]/i.test(await page.locator('#modal').innerText()));await page.screenshot({path:`docs/i18n/mobile-${language}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 console.log('Complete boarding match, setup variants, budget and evaluation verified.');
}finally{await browser.close();}
