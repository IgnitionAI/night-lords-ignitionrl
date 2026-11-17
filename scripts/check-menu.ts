import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const base='http://127.0.0.1:18231';mkdirSync('docs/menu',{recursive:true});
const report:any={languages:[],errors:[],failed:[]};
try{
 for(const lang of ['fr','en']){
  const context=await browser.newContext({locale:lang,viewport:{width:960,height:600}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('music-local/manifest'))report.failed.push(r.url());});
  await page.goto(base);await page.locator('#menu-play').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),lang);await page.screenshot({animations:'disabled',path:`docs/menu/home-${lang}.png`});
  await page.click('#menu-settings');await page.locator('#menu-master').fill('35');await page.keyboard.press('Escape');
  await page.click('#menu-controls');await page.keyboard.press('Escape');
  await page.click('#menu-transmission');await page.locator('video').waitFor();await page.waitForFunction(()=>document.querySelector('video')!.currentTime>0);await page.screenshot({animations:'disabled',path:`docs/menu/transmission-${lang}.png`});await page.keyboard.press('Escape');assert.equal(await page.locator('video').count(),0);
  await page.click('#menu-play');await page.screenshot({animations:'disabled',path:`docs/menu/modes-${lang}.png`});await page.click('#mode-tactical');await page.locator('#start').waitFor({timeout:90000});
  assert.equal(await page.locator('.load-screen').count(),0);await page.click('#start');
  await page.click('[data-action="guard"]');const before=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));
  await page.keyboard.press('Escape');await page.locator('#pause-resume').waitFor();
  await page.locator(`.shell-modal [data-locale="${lang==='fr'?'en':'fr'}"]`).click();await page.locator(`.shell-modal [data-locale="${lang}"]`).click();
  await page.click('#pause-controls');await page.keyboard.press('Escape');await page.click('#pause-settings');await page.click('#audio-close');
  await page.screenshot({animations:'disabled',path:`docs/menu/pause-tactical-${lang}.png`});await page.click('#pause-resume');
  const after=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));assert.deepEqual(after.orders,before.orders);assert.equal(after.view.turn,before.view.turn);assert.equal(after.paused,false);
  await page.click('#resolve');await page.waitForFunction(()=>JSON.parse((window as any).render_game_to_text()).busy);await page.keyboard.press('Escape');await page.locator('#pause-resume').waitFor();
  await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()).busy),true);await page.click('#pause-resume');await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy,null,{timeout:30000});
  await page.click('#pause-menu');await page.click('#pause-home');await page.click('#pause-stay');await page.click('#pause-home');await page.locator('.shell-modal a').click();await page.locator('#menu-play').waitFor();
  await page.click('#menu-play');await page.click('#mode-duel');await page.locator('#fps-deploy').waitFor({timeout:120000});await page.click('#fps-deploy');await page.waitForTimeout(800);await page.keyboard.press('KeyP');await page.locator('#fps-resume').waitFor();
  const state=await page.evaluate(()=>(window as any).__NL);await page.waitForTimeout(1000);const paused=await page.evaluate(()=>(window as any).__NL);assert.equal(state.tick,paused.tick);assert.deepEqual(state.playerPosition,paused.playerPosition);assert.equal(paused.paused,true);
  await page.click('#fps-pause-settings');await page.locator('#fps-master').fill('45');await page.locator(`.shell-modal [data-locale="${lang==='fr'?'en':'fr'}"]`).click();await page.locator(`.shell-modal [data-locale="${lang}"]`).click();await page.keyboard.press('Escape');
  await page.click('#fps-controls');await page.keyboard.press('Escape');await page.screenshot({animations:'disabled',path:`docs/menu/pause-fps-${lang}.png`});await page.click('#fps-resume');await page.waitForTimeout(500);assert.ok((await page.evaluate(()=>(window as any).__NL.tick))>paused.tick);
  await page.keyboard.press('KeyP');await page.click('#fps-home');await page.click('#fps-stay');await page.click('#fps-home');await page.locator('.shell-modal a').click();await page.locator('#menu-play').waitFor();
  await page.click('#menu-play');await page.click('#mode-fps');await page.locator('#fps-deploy').waitFor({timeout:120000});await page.screenshot({animations:'disabled',path:`docs/menu/ready-fps-${lang}.png`});await page.click('#fps-deploy');await page.keyboard.down('KeyW');await page.waitForTimeout(600);await page.keyboard.up('KeyW');await page.keyboard.press('KeyP');await page.locator('#fps-resume').waitFor();assert.equal(await page.evaluate(()=>(window as any).__NL.genestealersLoaded),6);
  await page.goto(base);await page.setViewportSize({width:390,height:844});await page.locator('#menu-play').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.click('#menu-play');await page.screenshot({animations:'disabled',path:`docs/menu/mobile-${lang}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  report.languages.push({lang,tacticalOrdersPreserved:true,tacticalResolutionPaused:true,fpsTickFrozen:true,fpsResumed:true,missionReady:true,videoPlayed:true,mobileFits:true});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);
 writeFileSync('docs/menu/navigation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
