import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});const report:any[]=[];
try{
 for(const [mode,url,pattern,ready] of [
  ['tactical','strategy.html','**/assets/models/strategy/TERM.glb','#start'],
  ['fps','fps.html?duel=1','**/assets/models/NL-1.glb','#fps-deploy'],
  ['mission','fps.html','**/assets/models/genestealer.glb','#fps-deploy'],
 ]){
  const context=await browser.newContext({locale:'en',viewport:{width:960,height:600},reducedMotion:'reduce'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let release!:()=>void;const blocked=new Promise<void>(resolve=>release=resolve);let intercepted=false;
  await page.route(pattern,async route=>{intercepted=true;await blocked;await route.continue();});
  await page.goto('http://127.0.0.1:18231/'+url,{waitUntil:'domcontentloaded'});await page.locator('.load-screen').waitFor();
  while(!intercepted)await page.waitForTimeout(50);
  await page.waitForTimeout(500);assert.equal(await page.locator(ready).isVisible(),false);assert.equal(await page.locator('.load-screen').getAttribute('aria-busy'),'true');assert.equal(await page.locator('progress').getAttribute('value'),null);
  await page.screenshot({path:`docs/menu/loading-${mode}.png`});release();await page.locator(ready).waitFor({timeout:120000});assert.equal(await page.locator('.load-screen').count(),0);
  await page.unroute(pattern);await page.route(pattern,route=>route.fulfill({status:503,body:'Unavailable'}));await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#load-error').waitFor({timeout:120000});assert.equal(await page.locator(ready).isVisible(),false);assert.equal(await page.locator('#load-retry').isVisible(),true);await page.screenshot({path:`docs/menu/error-${mode}.png`});
  await page.unroute(pattern);await page.click('#load-retry');await page.locator(ready).waitFor({timeout:120000});assert.equal(await page.locator('.load-screen').count(),0);
  assert.deepEqual(errors,[]);report.push({mode,delayedAssetHeldGate:true,requiredFailureRecoverable:true,retryPassed:true,errors});await context.close();
 }
 writeFileSync('docs/menu/loading.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
