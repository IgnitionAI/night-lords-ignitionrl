// Play a complete operation through normal controls. The debrief reveals the
// enemy decisions only after the game is over.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {boardingAction,BOARD_OBS,BOARD_VERSION} from '../src/strategy/boarding-agents';
import type {Decision} from '../src/strategy/engine';
const root=resolve('web/dist');
const sha=(s:Buffer)=>createHash('sha256').update(s).digest('hex');
const disk=readFileSync('policies/boarding-actor.json');
const actor=JSON.parse(disk.toString());
const control=JSON.parse(readFileSync('docs/boarding/ppo-control-v1.json','utf8'));
const browser=await chromium.launch({args:['--use-angle=metal']});
try{
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1280,height:800}});
 await page.route('http://noctis.test/**',async route=>{
  const url=new URL(route.request().url());
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));
  assert.ok(path.startsWith(root+sep));
  try{await route.fulfill({path});}catch{await route.fulfill({status:404});}
 });
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/policy/boarding-actor.json');
 await page.goto('http://noctis.test/strategy.html');
 const response=await loaded;
 assert.equal(response.status(),200);
 const servedHash=sha(await response.body());
 assert.equal(servedHash,sha(disk));
 assert.equal(actor.obsDim,BOARD_OBS);
 assert.equal(actor.version,BOARD_VERSION);
 await page.selectOption('#enemy','ppo');
 await page.click('#start');
 let rounds=0;
 while(rounds<18){
  const state=await page.evaluate(()=>JSON.parse((window as any).render_game_to_text()));
  if(state.winner)break;
  assert.equal(state.enemyMode,'ppo');
  // Assign the first surviving Terminator a recon or guard order, then resolve.
  await page.locator('button[data-unit]').first().click();
  await page.locator(rounds%3===0?'[data-action="scan"]':'[data-action="guard"]').click();
  await page.click('#resolve');
  await page.waitForFunction(()=>!JSON.parse((window as any).render_game_to_text()).busy,null,{timeout:30000});
  rounds++;
 }
 await page.locator('#evaluation summary').click();
 assert.equal(await page.locator('#evaluation tbody tr').count(),3);
 assert.ok((await page.locator('#evaluation').innerText()).includes(String(actor.meta.transitions)));
 const pending=page.waitForEvent('download');
 await page.click('#export');
 const download=await pending;
 const trace=JSON.parse(readFileSync((await download.path())!,'utf8'));
 assert.equal(trace.mode,'ppo');assert.equal(trace.abandon,false);assert.equal(trace.history.length,rounds);
 let previous=[-1,-1],verified=0,differentFromOld=0;
 for(const round of trace.history){
  assert.equal(round.decisions.length,2);
  for(const d of round.decisions as Decision[]){
   const ally=previous[1-d.commander];
   assert.equal(d.action,boardingAction(d.view,ally,actor));
   differentFromOld+=Number(d.action!==boardingAction(d.view,ally,control));
   verified++;
  }
  previous=round.decisions.map((d:Decision)=>d.action);
 }
 assert.ok(verified>0);assert.deepEqual(errors,[]);
 const result={mode:trace.mode,version:actor.version,observations:actor.obsDim,servedActorSha256:servedHash,
  input:'Chromium UI, standard mission, alternating recon and guard; full match',winner:trace.winner,rounds,
  score:trace.history.at(-1).score,verified,differentFromOld,pageErrors:errors};
 writeFileSync('docs/boarding/ppo-match.json',JSON.stringify(result,null,2));
 console.log(result);
}finally{await browser.close();}
