import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const language=(process.argv[2]??'fr') as 'fr'|'en';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage({locale:language==='fr'?'fr-FR':'en-GB',viewport:{width:1280,height:800}}),errors:string[]=[],failed:string[]=[],optionalMissing:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)(r.url().endsWith('/music-local/manifest.json')?optionalMissing:failed).push(r.url());});
 await page.goto('http://127.0.0.1:18231/fps.html?duel=1&seed=527');
 await page.waitForFunction(()=>(window as any).__NL?.bodies?.length===4);
 await page.click('#fps-settings');await page.click('#fps-vox-test');await page.waitForTimeout(3500);await page.click('#fps-vox-nightlords');await page.waitForTimeout(4500);await page.click('#fps-settings-close');
 await page.mouse.click(640,400);await page.waitForTimeout(3500);
 await page.keyboard.down('Space');
 for(let i=0;i<20;i++){await page.waitForTimeout(1000);if(await page.evaluate(()=>(window as any).__NL?.done))break;}
 await page.keyboard.up('Space');
 // The duel reaches an actual outcome through player input, without injecting state.
 await page.waitForFunction(()=>(window as any).__NL?.done,null,{timeout:90000});await page.waitForTimeout(4000);
 const duel=await page.evaluate(()=>(window as any).__NL);assert.ok(duel.done);assert.ok(duel.vox?.history.some((h:any)=>h.status==='ended'));assert.deepEqual(duel.vox.errors,[]);
 assert.ok(duel.vox.history.some((h:any)=>h.event==='nl-taunt'&&h.status==='ended'));
 assert.ok(duel.vox.history.every((h:any)=>h.source.includes('/vox/en/')===(language==='en')));
 await page.screenshot({path:`docs/i18n/fps-duel-${language}.png`});
 assert.match(await page.locator('#msg').innerText(),language==='fr'?/Duel remporté|Armure détruite/:/Duel won|Armour destroyed/);
 await page.goto('http://127.0.0.1:18231/fps.html?seed=527');await page.waitForFunction(()=>(window as any).__NL?.genestealersLoaded===6);
 await page.mouse.click(640,400);await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');await page.keyboard.down('Space');await page.waitForTimeout(1200);await page.keyboard.up('Space');await page.keyboard.press('KeyP');await page.keyboard.press('Escape');
 await page.click('#fps-settings');await page.locator(`#fps-settings-panel [data-locale="${language==='fr'?'en':'fr'}"]`).click();
 const before=await page.evaluate(()=>(window as any).__NL.playerPosition);await page.locator(`#fps-settings-panel [data-locale="${language}"]`).click();assert.deepEqual(await page.evaluate(()=>(window as any).__NL.playerPosition),before);await page.click('#fps-settings-close');
 const text=await page.locator('body').innerText();if(language==='en')assert.ok(!/[àâçéèêëîïôùûüœ]/i.test(text));
 await page.screenshot({path:`docs/i18n/fps-mission-${language}.png`});
 const mission=await page.evaluate(()=>(window as any).__NL);assert.ok(mission.tick>0);assert.equal(mission.genestealersLoaded,6);
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 writeFileSync(`docs/i18n/fps-${language}.json`,JSON.stringify({language,duel,mission,text,errors,failed,optionalMissing},null,2));
 console.log(language,'FPS duel completed:',duel.winner,'mission controls and text passed.');
}finally{await browser.close();}
