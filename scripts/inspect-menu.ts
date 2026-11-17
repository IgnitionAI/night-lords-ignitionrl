import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']});
try{const page=await browser.newPage();page.on('console',m=>{if(m.type()==='error')console.log('ERROR',m.text());});page.on('pageerror',e=>console.log('PAGE',e.message));await page.goto('http://127.0.0.1:18231/fps.html?duel=1');await page.waitForTimeout(15000);console.log(await page.locator('body').innerText());await page.screenshot({path:'docs/menu/fps-inspect.png'});}finally{await browser.close();}
