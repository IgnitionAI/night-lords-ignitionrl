import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
const rounds=JSON.parse(readFileSync('docs/immersion/final/debrief.json','utf8')).history.slice(0,4);
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:18231/');await page.locator('#start').waitFor();await page.selectOption('#enemy','ppo');await page.click('#start',{force:true});
for(const r of rounds){for(const o of r.orders.filter(o=>o.unit.startsWith('t'))){await page.locator(`[data-unit="${o.unit}"]`).click({force:true});await page.locator(`[data-action="${o.kind}"]`).click({force:true});if(o.target){const p=await page.evaluate(p=>window.strategy_visual.project(p),o.target);await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');}}
  if(r.turn===4){await page.click('#focus',{force:true});await page.evaluate(()=>{window.fxFrames=[];let start=0;const tick=()=>{const s=JSON.parse(window.render_game_to_text()),d=window.strategy_visual.diagnostics();if(s.busy&&!start)start=performance.now();if(start&&d.effects&&window.fxFrames.length<6)window.fxFrames.push({ms:performance.now()-start,visual:d,image:document.querySelector('#map').toDataURL()});if(!start||s.busy)requestAnimationFrame(tick);};requestAnimationFrame(tick);});}
  await page.click('#resolve',{force:true});await page.waitForFunction(()=>!JSON.parse(window.render_game_to_text()).busy);
}
const frames=await page.evaluate(()=>window.fxFrames);for(const [i,f] of frames.entries()){writeFileSync(`docs/immersion/final/impact-visible-${i}.png`,Buffer.from(f.image.split(',')[1],'base64'));delete f.image;}
if(frames.length===0)throw Error('No visible impact frames');await page.click('#overview',{force:true});await page.waitForTimeout(6000);const visual=await page.evaluate(()=>window.strategy_visual.diagnostics());await page.screenshot({path:'docs/immersion/final/optimized-battle.png'});
writeFileSync('docs/immersion/final/impact-proof.json',JSON.stringify({errors,frames,visual,audio:await page.evaluate(()=>window.strategy_visual.audio())},null,2));console.log('Effets visibles',frames.length,visual.gpu,visual.frameMs,visual.drawCalls);await browser.close();
