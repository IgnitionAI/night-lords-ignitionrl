import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const server=spawn('bun',['x','vite','--host','127.0.0.1','--port','18244'],{stdio:'pipe'});
let browser;
try {
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Vite timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('18244')){clearTimeout(timeout);resolve();}});server.on('exit',()=>reject(new Error('Vite exited')));});
 browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18244/web/index.html?cam=fps&mute=1');
 await page.waitForTimeout(5000);
 await page.screenshot({path:'docs/captures/helmets/duel.png'});
 const report=await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');
 const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
 const {replaceNightLordHelmet}=await import('/web/nightlord-helmet.ts');
 const {measureHeight}=await import('/web/stride.ts');
 const scene=new T.Scene();scene.background=new T.Color(0x202631);
 const camera=new T.PerspectiveCamera(35,1280/720,.01,100);camera.position.set(0,1.65,4.7);camera.lookAt(0,1.65,0);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.setPixelRatio(1);
 renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(renderer.domElement);
 scene.add(new T.HemisphereLight(0xb3cfff,0x303039,2)); const light=new T.DirectionalLight(0xffffff,3);light.position.set(1,3,4);scene.add(light);
 const data=[];const mixers=[];
 for(let i=1;i<=4;i++){
  const gltf=await new GLTFLoader().loadAsync('/web/models/NL-'+i+'.glb');const root=gltf.scene;
  root.scale.setScalar(2/measureHeight(root));
  root.position.x=(i-2.5)*.75;scene.add(root);root.updateMatrixWorld(true);
  const helmet=replaceNightLordHelmet(root);const head=root.getObjectByName('Head');
  const m=new T.AnimationMixer(root);if(gltf.animations[0])m.clipAction(gltf.animations[0]).play();mixers.push(m);
  data.push({model:i,removedFaces:helmet.userData.removedFaces,parent:helmet.parent.name,scale:root.scale.x});
 }
 window.helmetQA={scene,camera,renderer,mixers};renderer.render(scene,camera);return data;
 });
 await page.screenshot({path:'docs/captures/helmets/lineup.png'});
 for(const t of [0.2,0.5,0.8]){await page.evaluate(t=>{const q=window.helmetQA;q.mixers.forEach(m=>m.setTime(t));q.renderer.render(q.scene,q.camera);},t);await page.screenshot({path:'docs/captures/helmets/motion-'+t+'.png'});}
 const attachment=await page.evaluate(()=>{const out=[];window.helmetQA.scene.traverse(o=>{if(o.name==='nightlord-bat-helmet'){o.updateWorldMatrix(true,false);const h=o.parent;out.push({parent:h.name,error:o.getWorldPosition(new (h.position.constructor)()).distanceTo(h.getWorldPosition(new (h.position.constructor)()))});}});return out;});
 writeFileSync('docs/captures/helmets/check.json',JSON.stringify({errors,report,attachment},null,2));
 if(errors.length||report.some(r=>r.removedFaces<1||r.parent!=='Head')||attachment.some(a=>a.error>1e-6))throw new Error('Helmet validation failed');
 console.log('Four helmets replace original faces and stay attached through animation; no page errors.');

} finally {await browser?.close();server.kill();}
