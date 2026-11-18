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
 await page.screenshot({path:'docs/captures/armor/duel.png'});
 const report=await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js');
 const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
 const {retargetArmorClip}=await import('/web/armor-retarget.ts');
 const {finishArmorMaterial}=await import('/web/refined-armor.ts');
 const {makeCombatClips}=await import('/web/proc-clips.ts');
 const {measureHeight}=await import('/web/stride.ts');
 const scene=new T.Scene();scene.background=new T.Color(0x202631);
 const camera=new T.PerspectiveCamera(35,1280/720,.01,100);camera.position.set(0,1.65,4.7);camera.lookAt(0,1.65,0);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);renderer.setPixelRatio(1);
 renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(renderer.domElement);
 scene.add(new T.HemisphereLight(0xb3cfff,0x303039,2)); const light=new T.DirectionalLight(0xffffff,3);light.position.set(1,3,4);scene.add(light);
 const data=[];const mixers=[];const roots=[];const attacks=[];
 for(let i=1;i<=4;i++){
  const loader=new GLTFLoader();const source=await loader.loadAsync('/web/models/NL-'+i+'.glb');const gltf=await loader.loadAsync('/web/models/nightlord-refined.glb');const root=gltf.scene;
  root.scale.setScalar(2/measureHeight(root));
  root.traverse(o=>{if(o.isMesh)finishArmorMaterial(o.material)});roots.push(root);attacks.push(makeCombatClips(root,'nl',true).attack);
  root.position.x=(i-2.5)*.75;scene.add(root);root.updateMatrixWorld(true);
  const head=root.getObjectByName('Head');if(!head)throw new Error('Head bone missing');
  const walking=await loader.loadAsync('/web/models/NL-'+i+'-walk.glb');const clip=retargetArmorClip(source.scene,root,walking.animations[0]);const m=new T.AnimationMixer(root);m.clipAction(clip).play();mixers.push(m);
  let triangles=0;const textures=[];root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;const m=o.material;if(m.map)textures.push([m.map.image.width,m.map.image.height]);}});data.push({model:i,triangles,textures,tracks:clip.tracks.length,scale:root.scale.x});
 }
 window.helmetQA={scene,camera,renderer,mixers,roots,attacks};renderer.render(scene,camera);return data;
 });
 await page.screenshot({path:'docs/captures/armor/lineup.png'});
 for(const t of [0.2,0.5,0.8]){await page.evaluate(t=>{const q=window.helmetQA;q.mixers.forEach(m=>m.setTime(t));q.renderer.render(q.scene,q.camera);},t);await page.screenshot({path:'docs/captures/armor/motion-'+t+'.png'});}
 await page.evaluate(()=>{const q=window.helmetQA;q.mixers.forEach(m=>m.stopAllAction());q.roots.forEach((r,i)=>{r.visible=i===0;});q.roots[0].position.x=0;q.camera.position.set(2,1.7,3.4);q.camera.lookAt(0,1.1,0);q.renderer.render(q.scene,q.camera);});
 await page.screenshot({path:'docs/captures/armor/full-body.png'});
 await page.evaluate(()=>{const q=window.helmetQA;q.camera.position.set(.8,1.85,1.65);q.camera.lookAt(0,1.55,0);q.renderer.render(q.scene,q.camera);});
 await page.screenshot({path:'docs/captures/armor/detail.png'});
 for(const t of [.05,.15,.25]){await page.evaluate(t=>{const q=window.helmetQA;const m=q.mixers[0];m.stopAllAction();m.clipAction(q.attacks[0]).reset().play();m.setTime(t);q.renderer.render(q.scene,q.camera);},t);await page.screenshot({path:'docs/captures/armor/attack-'+t+'.png'});}
 writeFileSync('docs/captures/armor/check.json',JSON.stringify({errors,report},null,2));
 if(errors.length||report.some(r=>r.triangles<10000||r.tracks<10))throw new Error('Armor validation failed');
 console.log('Four refined armor rigs rendered with retargeted walk clips; no page errors.');

} finally {await browser?.close();server.kill();}
