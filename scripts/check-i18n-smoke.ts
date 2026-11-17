import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{
 const context=await browser.newContext({locale:'en-GB',viewport:{width:1280,height:800}}),page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.screenshot({path:'docs/i18n/welcome-en.png'});writeFileSync('docs/i18n/welcome-en.txt',await page.locator('body').innerText());
 await page.locator('#modal [data-locale="fr"]').click();assert.match(await page.locator('#start').innerText(),/DÉPLOYER/);
 await page.locator('#modal [data-locale="en"]').click();await page.click('#start');
 const before=await page.evaluate(()=>(window as any).render_game_to_text());
 await page.click('#sound');await page.locator('#modal [data-locale="fr"]').click();
 assert.equal(before,await page.evaluate(()=>(window as any).render_game_to_text()));
 await page.click('#audio-close');await page.reload();await page.locator('#start').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 await page.locator('#modal [data-locale="en"]').click();await page.click('#start');
 await page.screenshot({path:'docs/i18n/tactical-en.png'});writeFileSync('docs/i18n/tactical-en.txt',await page.locator('body').innerText());
 await page.goto('http://127.0.0.1:18231/fps.html');await page.waitForFunction(()=>(window as any).__NL?.genestealersLoaded===6);await page.screenshot({path:'docs/i18n/fps-en.png'});writeFileSync('docs/i18n/fps-en.txt',await page.locator('body').innerText());
 await page.click('#fps-settings');await page.locator('#fps-settings-panel [data-locale="fr"]').click();await page.click('#fps-settings-close');assert.equal(await page.locator('html').getAttribute('lang'),'fr');
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();
 for(const lang of ['fr','en']){await page.locator(`#modal [data-locale="${lang}"]`).click();await page.locator('#start').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('#start').isVisible());}
 await page.selectOption('#mission','blackout');await page.locator('#start').click();assert.equal(JSON.parse(await page.evaluate(()=>(window as any).render_game_to_text())).view.tactics.mission,'blackout');
 assert.deepEqual(errors,[]);console.log('Locale detection, controls, live switching and persistence passed.');
}finally{await browser.close();}
