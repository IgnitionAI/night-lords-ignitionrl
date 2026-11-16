import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();await page.click('#start',{force:true});
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function order(kind,target){await page.locator('[data-unit="t1"]').click({force:true});await page.locator(`[data-action="${kind}"]`).click({force:true});if(target){const point=await page.evaluate(p=>window.strategy_visual.project(p),target);await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y);await page.keyboard.up('Shift');}const before=await state();if(!before.orders.some(o=>o.unit==='t1'&&o.kind===kind))throw Error('Order not assigned');await page.click('#resolve',{force:true});await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).busy);}
await order('move',{x:6,y:10});await order('move',{x:6,y:10});await order('interact',{x:7,y:10});
if((await state()).view.doors.find(d=>d.id==='D1').open)throw Error('Door did not close');
await order('scan');const audio=await page.evaluate(()=>window.strategy_visual.audio());if(!audio.played.door)throw Error('Door sound not played');
await page.click('#focus',{force:true});await page.screenshot({path:'docs/immersion/final/door-scan.png'});await page.waitForTimeout(4000);
const visual=await page.evaluate(()=>window.strategy_visual.diagnostics());
writeFileSync('docs/immersion/final/door-scan.json',JSON.stringify({errors,audio,visual,state:await state()},null,2));
await page.click('#plan',{force:true});await page.screenshot({path:'docs/immersion/final/plan.png'});await page.click('#sound',{force:true});await page.screenshot({path:'docs/immersion/final/audio-settings.png'});
await page.setViewportSize({width:390,height:844});await page.click('#audio-close',{force:true});await page.screenshot({path:'docs/immersion/final/mobile.png',fullPage:true});
await browser.close();console.log('Porte, reconnaissance, vue plan et formats vérifiés',visual.frameMs,visual.gpu,visual.pixelRatio,errors);
