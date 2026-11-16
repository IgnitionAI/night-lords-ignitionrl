// Browser verification of every delivered clip and the real radio queue.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`import {VoxRadio} from './web/strategy/vox';import {voiceCue} from './web/strategy/vox-cues';import {VOX_LINES} from './web/strategy/vox-assets';window.voxTest={VoxRadio,voiceCue,lines:VOX_LINES};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',platform:'browser'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/vox-runtime-test',r=>r.fulfill({contentType:'text/html',body:'<button id="enable">Enable audio</button>'}));
 await page.goto('http://127.0.0.1:18231/vox-runtime-test');
 await page.addScriptTag({content:bundle.outputFiles[0].text.replaceAll('/web/sfx/','/assets/sfx/')});
 await page.evaluate(()=>{
  document.querySelector('#enable').onclick=async()=>{
   const t=window.voxTest;t.ctx=new AudioContext();await t.ctx.resume();t.gain=.7;t.ducked=false;
   t.radio=new t.VoxRadio(t.ctx,()=>t.gain,on=>t.ducked=on,()=>{});
  };
 });
 await page.click('#enable');await page.waitForFunction(()=>window.voxTest.radio);
 const decoded=await page.evaluate(async()=>{
  const t=window.voxTest,urls=[...new Set(t.lines.flatMap(l=>Object.values(l.sources)))],result=[];
  for(const url of urls){const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);const b=await t.ctx.decodeAudioData(await r.arrayBuffer());const data=b.getChannelData(0);let peak=0,energy=0;for(const x of data){if(!Number.isFinite(x))throw Error('Invalid sample '+url);peak=Math.max(peak,Math.abs(x));energy+=x*x;}if(b.duration<=.1||b.duration>=8||peak<.01||peak>1)throw Error('Invalid clip '+url);result.push({url,duration:b.duration,peak,rms:Math.sqrt(energy/data.length)});}
  return result;
 });
 const clips=await page.evaluate(()=>window.voxTest.lines.map(l=>({id:l.id,unit:l.unit??(l.faction==='nightlords'?'n0':'t0'),event:l.event})));
 const played=[];
 for(const clip of clips){
  await page.evaluate(c=>{const t=window.voxTest;t.radio.boundary(true);t.radio.observeEnemies(['n0']);t.radio.speak(t.voiceCue({id:c.unit,name:c.unit},c.event,'ui'));},clip);
  await page.waitForFunction(()=>{const a=window.voxTest.radio.diagnostics().active;return a&&!a.paused&&a.time>.06;},null,{timeout:10000});
  played.push(await page.evaluate(()=>window.voxTest.radio.diagnostics().active.line));
 }
 assert.equal(new Set(played).size,clips.length);
 // A hidden enemy cannot start, and a disappearing one stops immediately.
 const privacy=await page.evaluate(async()=>{
  const t=window.voxTest;t.radio.boundary(true);t.radio.observeEnemies([]);t.radio.speak(t.voiceCue({id:'n0',name:'VRAK'},'nl-taunt','result'));
  await new Promise(r=>setTimeout(r,200));return t.radio.diagnostics();
 });assert.equal(privacy.active,null);assert.equal(privacy.pending.length,0);
 await page.evaluate(()=>{const t=window.voxTest;t.radio.boundary(true);t.radio.observeEnemies(['n0']);t.radio.speak(t.voiceCue({id:'n0',name:'VRAK'},'nl-taunt','result'));});
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active?.time>.06);
 const vanished=await page.evaluate(()=>{window.voxTest.radio.observeEnemies([]);return window.voxTest.radio.diagnostics();});assert.equal(vanished.active,null);
 // Only a death already witnessed may finish after the corpse leaves the view.
 await page.evaluate(()=>{const t=window.voxTest;t.radio.boundary(true);t.radio.observeEnemies([]);t.radio.speak(t.voiceCue({id:'n0',name:'VRAK'},'nl-death','action'));});
 await page.waitForTimeout(180);assert.equal((await page.evaluate(()=>window.voxTest.radio.diagnostics())).active,null);
 await page.evaluate(()=>{const t=window.voxTest;t.radio.observeEnemies(['n0']);t.radio.speak(t.voiceCue({id:'n0',name:'VRAK'},'nl-death','action'));});
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active?.time>.06);
 const witnessedDeath=await page.evaluate(()=>{window.voxTest.radio.observeEnemies([]);return window.voxTest.radio.diagnostics();});assert.equal(witnessedDeath.active.event,'nl-death');
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active===null);
 // A casualty interrupts routine chatter, but only one media element may play.
 await page.evaluate(()=>{const t=window.voxTest;t.radio.boundary(true);t.radio.speak(t.voiceCue({id:'t0',name:'VAEL'},'select'));});
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active?.time>.06);
 await page.evaluate(()=>{const t=window.voxTest;t.radio.speak(t.voiceCue({id:'t1',name:'TOR'},'fallen','result'));});
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active?.line==='fallen');
 await page.waitForFunction(()=>window.voxTest.radio.diagnostics().active===null);
 const final=await page.evaluate(()=>({radio:window.voxTest.radio.diagnostics(),ducked:window.voxTest.ducked}));
 assert.equal(final.radio.maxConcurrent,1);assert.equal(final.ducked,false);assert.deepEqual(final.radio.errors,[]);assert.deepEqual(errors,[]);
 writeFileSync('docs/vox/runtime-check.json',JSON.stringify({decoded,played,privacy:{active:privacy.active,pending:privacy.pending},vanished:{active:vanished.active},witnessedDeath:{active:witnessedDeath.active},final,errors},null,2));
 console.log(`${played.length} vocalisations played; ${decoded.length} clips decoded; visibility and priority verified.`);
}finally{await browser.close();}
