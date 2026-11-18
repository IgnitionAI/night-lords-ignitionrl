import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='docs/captures/mission';mkdirSync(dir,{recursive:true});
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});let browser;
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?seed=527&mute=1&bench=1');await page.waitForTimeout(5000);
 await page.screenshot({path:dir+'/entry.png'});
 await page.mouse.click(640,360);await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
 await page.keyboard.down('Space');await page.waitForTimeout(1800);await page.keyboard.up('Space');await page.keyboard.press('KeyP');
 await page.screenshot({path:dir+'/contact.png'});
 const state=await page.evaluate(()=>({state:window.__NL,frames:window.__benchFrames,audio:window.__AUDIO?.status()}));
 // Review creature and reactor using the shipped scene module, separate from gameplay evidence.
 await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
 const gltf=await new GLTFLoader().loadAsync('/public/assets/genex/adfc4c17-dcab-4ce1-bcf2-abe37bf253a6/a-terrifying-genestealer-alien-with-exac-cmwizjyc.glb');
 const scene=new T.Scene();scene.background=new T.Color(0x202631);const root=gltf.scene;root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root);const size=box.getSize(new T.Vector3());root.scale.setScalar(2.1/size.y);const center=box.getCenter(new T.Vector3());root.position.set(-center.x*root.scale.x,-box.min.y*root.scale.x,-center.z*root.scale.x);scene.add(root);
 const camera=new T.PerspectiveCamera(38,1280/720,.01,100);camera.position.set(3,2.1,4);camera.lookAt(0,1,0);scene.add(new T.HemisphereLight(0xbacbdf,0x25202d,3));const light=new T.DirectionalLight(0xffffff,3);light.position.set(2,4,3);scene.add(light);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(renderer.domElement);window.review=(time)=>{root.rotation.y=time*5;renderer.render(scene,camera);};window.review(0);
 });
 for(const t of [0,.2,.4]){await page.evaluate(t=>window.review(t),t);await page.screenshot({path:dir+`/generated-${t}.png`});}
 await page.evaluate(()=>window.review(.3,true));await page.screenshot({path:dir+'/generated-attack.png'});
 writeFileSync(dir+'/check.json',JSON.stringify({errors,...state},null,2));console.log(JSON.stringify({errors,state:state.state,frames:state.frames?.length}));
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser?.close();server.kill();}
