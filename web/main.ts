// Prototype gris : rendu Three.js (cubes et capsules) d'une sim pure à pas fixe (src/sim.ts).
import * as THREE from 'three';
import { newWorld, step, observe, nlFrame, terminatorPerceives, DT, MAX_TICKS, ARENA, PILLARS, BEACON, ROLES, T_CFG, NL_CFG, NL_ACTIONS, type World, type TAction } from '../src/sim';
import { POOL, UNSEEN, type Tactic } from '../src/tactics';
import { Recorder } from '../src/recorder';
import { forward, softmax, sample, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const qs = new URLSearchParams(location.search);
const autoplay = qs.get('autoplay'); const shot = Number(qs.get('shot') ?? 0);
let debug = qs.get('debug') === '1'; let seed = Number(qs.get('seed') ?? (Date.now() % 800000) + 1);
let actor: ActorJSON | null = null; let policyLabel = 'meute naïve (aucune politique chargée)';
const ROLE_COL = [0xd8d8ff, 0xff3030, 0xffa020, 0x30d0ff];
const ROLE_CSS = ['#d8d8ff', '#ff3030', '#ffa020', '#30d0ff'];

// ---------- scène
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
// palette filmique : sans tone mapping les hautes lumières écrasent le reste du cadre
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.6;
// Brouillard : FogExp2 par defaut, ~25 m de visibilite utile. `?fog=linear` revient a la rampe 8 -> 38 m,
// disponible tant que la camera de couloir (P1) n'est pas mergee. Meme couleur que le fond, sinon une ligne
// d'horizon se dessine la ou la geometrie s'efface.
const FOG_COLOR = 0x0b0d13, FOG_MODE = qs.get('fog') ?? 'exp2';
const scene = new THREE.Scene(); scene.background = new THREE.Color(FOG_COLOR);
scene.fog = FOG_MODE === 'linear' ? new THREE.Fog(FOG_COLOR, 8, 38) : new THREE.FogExp2(FOG_COLOR, 0.052);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
// Une seule lumière de remplissage, froide et rasante : les formes se lisent par leur bord, pas par leur face.
scene.add(new THREE.AmbientLight(0x1b2130, 0.30));
const keyLight = new THREE.DirectionalLight(0x8fb4e8, 1.5); keyLight.position.set(50, 34, 6); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x5f7fd0, 1.1); rimLight.position.set(38, 12, 24); scene.add(rimLight);
const poolLight = new THREE.PointLight(0x8fb0e0, 26, 16, 2); poolLight.position.set(20, 5.5, BEACON.y); scene.add(poolLight);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), new THREE.MeshStandardMaterial({ color: 0x0e1014, metalness: 0.25, roughness: 0.5 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(ARENA.w / 2, 0, ARENA.h / 2); floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0x2a2f3a, 0x15181f); grid.position.set(20, 0.01, 20); grid.scale.set(1, 1, 0.6); scene.add(grid);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.5, roughness: 0.6 });
for (const b of PILLARS) { const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 4, b.y1 - b.y0), wallMat); m.position.set((b.x0 + b.x1) / 2, 2, (b.y0 + b.y1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
  const lamp = new THREE.PointLight(0xff2a1a, 11, 11, 2); lamp.position.set((b.x0 + b.x1) / 2, 3.6, b.y0 - 0.3); scene.add(lamp); }
for (const [w, d, x, z] of [[ARENA.w, 0.4, ARENA.w / 2, -0.2], [ARENA.w, 0.4, ARENA.w / 2, ARENA.h + 0.2], [0.4, ARENA.h, -0.2, ARENA.h / 2], [0.4, ARENA.h, ARENA.w + 0.2, ARENA.h / 2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat); m.position.set(x, 0.6, z); scene.add(m); }
// Rayon de téléportation : une braise, pas un néon. Le vert saturait à 255 et devenait l'objet le plus attractif du plateau.
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(BEACON.r, BEACON.r, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xc24a12, emissiveIntensity: 0.85 }));
beacon.position.set(BEACON.x, 0.05, BEACON.y); scene.add(beacon); const bl = new THREE.PointLight(0xff7a3a, 7, 9, 2); bl.position.set(BEACON.x, 2, BEACON.y); scene.add(bl);

// ---------- modeles rigges (assets/rigged-opt, 1,21-1,78 Mo piece, 24 os, 1,70 m, face +Z)
// Le facteur d'echelle est cale sur la hauteur du collider, pas sur un gout : NL radius 0,45 -> 2,0 m de haut,
// Terminator radius 0,8 -> 2,6 m. Sinon le visuel deborde de la boite de collision et traverse les murs.
const NL_HEIGHT = 2.0, TERM_HEIGHT = 2.6;
const gltfLoader = new GLTFLoader();
const loadGLB = (url: string) => new Promise<any>((res, rej) => gltfLoader.load(url, res, undefined, rej));
interface Rig { root: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction | null; run: THREE.AnimationAction | null; idle: THREE.AnimationAction | null; current: THREE.AnimationAction | null; }
// Box3.setFromObject ignore le skinning : sur un maillage quantifié (KHR_mesh_quantization) il rend 0,02 m
// au lieu de 1,70 m, et l'échelle devient ×100. On mesure donc la boîte calculée par le skin, transformée
// par la matrice monde du maillage (qui porte le facteur 0,01).
function measureHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let h = 0;
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    if (o.isSkinnedMesh) o.computeBoundingBox();
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const src = o.isSkinnedMesh ? o.boundingBox : o.geometry.boundingBox;
    if (!src) return;
    const box = src.clone().applyMatrix4(o.matrixWorld);
    h = Math.max(h, box.max.y - Math.min(0, box.min.y));
  });
  return h > 0.01 ? h : 1.7;
}
const rigOf = (model: any, clips: any[], targetHeight: number, dim = 1): Rig => {
  const root = model.scene;
  const h = measureHeight(root);
  root.scale.setScalar(targetHeight / h);
  root.rotation.y = Math.PI / 2; // le modele regarde +Z, la simulation regarde +X
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    // Les textures sortent de Genex calibrees pour un studio, pas pour un couloir a 10 lux : on baisse
    // l'albedo pour que la forme passe devant le detail, et on garde le liseré de Fresnel de P2.
    const m = o.material as THREE.MeshStandardMaterial;
    if (m && m.color) { m.color.multiplyScalar(dim); m.envMapIntensity = 0.25; m.metalness *= 0.3; m.roughness = Math.max(m.roughness, 0.72); }
    if (m && m.onBeforeCompile) m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
       float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 4.2);
       gl_FragColor.rgb += vec3(0.26, 0.35, 0.55) * fres * 0.55;`);
    };
  });
  const mixer = new THREE.AnimationMixer(root);
  const pick = (n: string) => clips.find(c => c.name.toLowerCase().includes(n)) ?? null;
  const mk = (c: any) => (c ? mixer.clipAction(c) : null);
  return { root, mixer, walk: mk(pick('walk')), run: mk(pick('run')), idle: mk(model.animations?.[0] ?? null), current: null };
};
const playRig = (rig: Rig, want: 'walk' | 'run' | 'idle', dt: number) => {
  const next = want === 'run' ? (rig.run ?? rig.walk) : want === 'walk' ? (rig.walk ?? rig.run) : rig.idle;
  if (next && next !== rig.current) { rig.current?.fadeOut(0.15); next.reset().fadeIn(0.15).play(); rig.current = next; }
  rig.mixer.update(dt);
};

// Terminator : cubes (os/or loyaliste), front marqué par le visor et le storm bolter
const term = new THREE.Group(); const bone = new THREE.MeshStandardMaterial({ color: 0x2a2418, metalness: 0.5, roughness: 0.45 });
const add = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
add(term, new THREE.BoxGeometry(1.3, 1.7, 1.6), bone, 0, 1.25, 0);
add(term, new THREE.BoxGeometry(0.9, 0.9, 2.6), bone, -0.1, 2.05, 0); // épaulières
add(term, new THREE.BoxGeometry(0.55, 0.5, 0.55), bone, 0.35, 2.35, 0);
add(term, new THREE.BoxGeometry(0.12, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.64, 2.38, 0);
add(term, new THREE.BoxGeometry(1.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x333 }), 0.75, 1.5, 0.9); // storm bolter
const fistM = add(term, new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x1122aa }), 0.55, 1.1, -0.95);
const spot = new THREE.SpotLight(0xfff2d0, 34, T_CFG.visionRange + 4, T_CFG.visionHalf * 0.75, 0.5, 1.4); spot.position.set(0.7, 2.4, 0); spot.castShadow = true;
term.add(spot); const tLamp = new THREE.PointLight(0xffe8c0, 6, 4, 2); tLamp.position.set(-1.2, 4, 0); term.add(tLamp); const spotTarget = new THREE.Object3D(); spotTarget.position.set(8, 0, 0); term.add(spotTarget); spot.target = spotTarget; scene.add(term);

// Un Night Lord : un corps noir qu'on devine à son liseré, et deux yeux. Aucun marqueur de rôle au sol
// ni au-dessus de la tête en vue de jeu — anneau et étiquette restent disponibles en vue de contrôle (V).
const nlBodyMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.85, metalness: 0.05 });
nlBodyMat.onBeforeCompile = (sh) => { // liseré de Fresnel : la silhouette se dessine par son bord
  sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
     float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 4.2);
     gl_FragColor.rgb += vec3(0.26, 0.35, 0.55) * fres * 0.55;`);
};
const nlMarkers: THREE.Object3D[] = []; // anneau + étiquette, visibles seulement en vue de contrôle
const nlProxy: THREE.Object3D[] = []; // capsule + yeux procéduraux : cachés dès que le modèle riggé est chargé
const nlRigs: (Rig | null)[] = [null, null, null, null];
let termRig: Rig | null = null;
const nlLabels: { sprite: THREE.Sprite; name: string }[] = [];
let labelsBuilt = false;
function buildLabels() { // différé : aucune texture de nom allouée tant que la vue de contrôle n'est pas ouverte
  if (labelsBuilt) return; labelsBuilt = true;
  for (const { sprite, name } of nlLabels) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d')!; x.font = 'bold 40px system-ui'; x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.fillText(name, 128, 46);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = sprite.material as THREE.SpriteMaterial; mat.map = t; mat.needsUpdate = true;
  }
}
const nlMeshes = ROLES.map((name, i) => {
  const g = new THREE.Group();
  nlProxy.push(add(g, new THREE.CapsuleGeometry(NL_CFG.radius, 1.1, 6, 12), nlBodyMat, 0, 1.0, 0));
  for (const z of [-0.11, 0.11]) nlProxy.push(add(g, new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff1a08 }), 0.42, 1.66, z)); // yeux, seule source chaude
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24), new THREE.MeshBasicMaterial({ color: ROLE_COL[i], transparent: true, opacity: 0.5, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.visible = false; g.add(ring); nlMarkers.push(ring);
  // Etiquette : le canvas n'est peint qu'a la premiere ouverture de la vue de controle, et le sprite teste la
  // profondeur (il s'affichait a travers les piliers). La teinte vient du materiau, le texte est blanc.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: ROLE_COL[i], depthTest: true, transparent: true, opacity: 0.9 }));
  s.scale.set(2.4, 0.6, 1); s.position.y = 2.5; s.visible = false; g.add(s); nlMarkers.push(s); nlLabels.push({ sprite: s, name });
  scene.add(g); return g;
});
// vue de contrôle : cônes, croyances, bruit
const dbgGroup = new THREE.Group(); scene.add(dbgGroup);
function fan(half: number, r: number, color: number, op: number) {
  const geo = new THREE.CircleGeometry(r, 24, -half, 2 * half); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); g.position.y = 0.05; return g;
}
const cones = ROLES.map((_, i) => { const c = fan(NL_CFG.visionHalf, NL_CFG.visionRange, ROLE_COL[i], 0.08); dbgGroup.add(c); return c; });
const beliefs = ROLES.map((_, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), new THREE.MeshBasicMaterial({ color: ROLE_COL[i], transparent: true, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.08; dbgGroup.add(m); return m; });
const links = ROLES.map((_, i) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: ROLE_COL[i], dashSize: 0.4, gapSize: 0.3 })); dbgGroup.add(l); return l; });
const noiseRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); noiseRing.rotation.x = -Math.PI / 2; noiseRing.position.y = 0.06; dbgGroup.add(noiseRing);
const tCone = fan(T_CFG.visionHalf, T_CFG.visionRange, 0xfff0c0, 0.05); dbgGroup.add(tCone);
const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe080 })); scene.add(tracer); tracer.visible = false;

// Passe plein écran : vignette + grain. Un quad et un shader, aucun addon ; la render target est linéaire
// et c'est ce shader qui encode en sRGB (sinon l'image est deux fois trop sombre).
const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
const postScene = new THREE.Scene(); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uTime: { value: 0 }, uVignette: { value: 0.95 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * uVignette * 1.9, 0.0, 1.0);
      c += (hash(vUv * 1024.0 + uTime) - 0.5) * 0.014;
      gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(0.4545)), 1.0);
    }`,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ---------- état de jeu
let w: World, prev: { t: [number, number, number]; n: [number, number, number][] }, rec: Recorder, rng: () => number, tactic: Tactic | null;
let roundNo = 0, score = { pack: 0, term: 0 }, paused = false, acc = 0, hitstop = 0, shake = 0, lastActs: number[] = [0, 0, 0, 0], lastP: number[] = [0, 0, 0, 0], tracerT = 0;
let roundOver = false, lastSummary = '';
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV') { debug = !debug; if (debug) buildLabels(); } if (e.code === 'KeyP') paused = !paused; if (e.code === 'Enter' && roundOver) startRound(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const snap = () => ({ t: [w.t.x, w.t.y, w.t.facing] as [number, number, number], n: w.nls.map(n => [n.x, n.y, n.facing] as [number, number, number]) });
function startRound() {
  roundNo++; roundOver = false; seed = seed + 1; w = newWorld(seed); prev = snap(); rec = new Recorder(autoplay ? `autoplay ${autoplay}` : 'joueur'); rng = mulberry32(seed ^ 0x9e3779b9);
  tactic = autoplay ? (POOL[autoplay] ?? UNSEEN[autoplay] ?? POOL.march)() : null;
  nlMeshes.forEach(m => { m.rotation.set(0, 0, 0); m.visible = true; });
  (document.getElementById('msg') as HTMLElement).style.display = 'none';
}
function playerAction(): TAction {
  const k = (c: string) => keys.has(c);
  return { fwd: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), strafe: (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0), turn: (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0), bolt: k('Space'), fist: k('KeyF') || k('ShiftLeft') };
}
function floatText(x: number, y: number, text: string, color: string) {
  const v = new THREE.Vector3(x, 2.5, y).project(camera); const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color;
  el.style.left = `${(v.x + 1) / 2 * innerWidth}px`; el.style.top = `${(1 - v.y) / 2 * innerHeight}px`; document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(-40px)'; el.style.opacity = '0'; }); setTimeout(() => el.remove(), 800);
}
function updateRigs(dt: number) { // avance d'un pas de simulation, pas du temps réel : le mode capture reste déterministe
  for (let i = 0; i < nlRigs.length; i++) {
    const rig = nlRigs[i]; if (!rig) continue;
    const n = w.nls[i];
    if (!n.alive) { playRig(rig, 'idle', dt); continue; }
    const moved = Math.hypot(n.x - prev.n[i][0], n.y - prev.n[i][1]) > 0.01;
    playRig(rig, moved ? 'run' : 'idle', dt);
  }
  if (termRig) playRig(termRig, w.t.moving ? 'walk' : 'idle', dt);
}
function tick() {
  prev = snap();
  const ta = tactic ? tactic(w) : playerAction(); rec.record(w, ta);
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    if (!actor) { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; }
    const p = softmax(forward(actor, observe(w, i))); const a = sample(p, rng); lastP[i] = p[a]; return a;
  }); lastActs = acts;
  step(w, ta, acts);
  for (const e of w.events) {
    if (e.type === 'bolt') { tracer.geometry.setFromPoints([new THREE.Vector3(e.x, 1.5, e.y), new THREE.Vector3(e.tx, 1.2, e.ty)]); tracer.visible = true; tracerT = 0.08; shake = Math.max(shake, 0.15); }
    if ((e.type === 'bolt' || e.type === 'fist') && e.kill >= 0) { hitstop = 0.09; shake = 0.5; const n = w.nls[e.kill]; floatText(n.x, n.y, `${ROLES[e.kill]} abattu`, '#ffd27a'); flash(0.25); }
    if (e.type === 'claw') { const n = w.nls[e.who]; if (e.dmg === 0) floatText(n.x, n.y, 'ARMURE', '#9cf'); else { floatText(w.t.x, w.t.y, `-${e.dmg} ${e.zone === 'rear' ? 'DOS' : 'FLANC'}`, '#f44'); shake = Math.max(shake, 0.3); } }
  }
  updateRigs(DT);
  if (w.done) endRound();
}
function flash(o: number) { const f = document.getElementById('flash')!; f.style.transition = 'none'; f.style.opacity = String(o); requestAnimationFrame(() => { f.style.transition = 'opacity .25s'; f.style.opacity = '0'; }); }
async function endRound() {
  roundOver = true; if (w.winner === 'pack') score.pack++; else score.term++;
  const msg = document.getElementById('msg')!; msg.style.display = 'block';
  msg.innerHTML = `<b>Manche ${roundNo} : ${w.winner === 'pack' ? 'la meute gagne' : 'le Terminator gagne'}</b> (${w.reason})<br>La meute étudie ta tactique…`;
  if (shot) return;
  try {
    const r = await fetch('/api/round', { method: 'POST', body: JSON.stringify(rec.toJSON(`${w.winner} — ${w.reason}`)) }).then(r => r.json());
    lastSummary = r.summary;
    if (r.ok) { await loadPolicy(); msg.innerHTML += `<br>Ce qu'elle a lu : ${r.summary}.<br>Fantôme appris par imitation sur tes ${r.roundsUsed} dernière(s) manche(s), meute ré-entraînée contre lui (${r.updates} mises à jour PPO, ${r.seconds.toFixed(0)} s).`; }
    else msg.innerHTML += `<br>Ce qu'elle a lu : ${r.summary}.<br>Pas de ré-entraînement : ${r.reason ?? 'échec'}.`;
  } catch { msg.innerHTML += '<br>Serveur local absent : pas de ré-entraînement.'; }
  msg.innerHTML += '<br><br>Entrée : manche suivante';
}
async function loadPolicy() {
  try { const j = await fetch('/policy/current.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null); if (j) { actor = j; policyLabel = `politique ${j.version}`; } } catch { /* naïve */ }
}
function hud() {
  const t = w.t; const h = document.getElementById('hud')!;
  h.innerHTML = `<b>TERMINATOR</b> — manche ${roundNo} · meute ${score.pack} / ${score.term} Terminator · ${((MAX_TICKS - w.tick) * DT).toFixed(0)} s<div class="bar"><i style="width:${t.hp / T_CFG.hp * 100}%"></i></div>`
    + `${t.channel ? `<b style="color:#6f6">Téléportation ${Math.round(t.channel / T_CFG.channel * 100)} %</b> · ` : ''}Armure ${t.hp}/${T_CFG.hp} · bolter ${t.boltCd ? '…' : 'prêt'} · gantelet ${t.fistCd ? '…' : 'prêt'} · Night Lords debout : ${w.nls.filter(n => n.alive).length}/4<br><small>${policyLabel}${autoplay ? ` · Terminator en autoplay (${autoplay})` : ''}</small>`;
  const d = document.getElementById('dbg')!; d.style.display = debug ? 'block' : 'none';
  if (debug) d.innerHTML = `<b>Vue de contrôle — ce que perçoit chaque Night Lord</b><table><tr><th>rôle</th><th>état</th><th>voit</th><th>entend</th><th>vox</th><th>âge</th><th>action (p)</th></tr>`
    + w.nls.map((n, i) => `<tr style="color:${ROLE_CSS[i]}"><td>${ROLES[i]}</td><td>${n.alive ? 'debout' : 'mort'}</td><td>${n.alive && n.belief.seen ? '●' : '·'}</td><td>${n.alive && n.belief.heard ? '●' : '·'}</td><td>${n.alive && n.belief.vox ? '●' : '·'}</td><td>${n.alive && n.belief.valid ? (n.belief.age * DT).toFixed(1) + ' s' : '—'}</td><td>${n.alive ? NL_ACTIONS[lastActs[i]] + (actor ? ` (${lastP[i].toFixed(2)})` : '') : ''}</td></tr>`).join('')
    + `</table>Anneau blanc = portée du bruit du Terminator (${w.t.noise} m). Anneaux colorés = où chaque frère croit qu'il est. Le Terminator perçoit : ${terminatorPerceives(w).map(i => ROLES[i]).join(', ') || 'personne'}.`;
}
function render(alpha: number) {
  const lerp = (a: number, b: number) => a + (b - a) * alpha; const la = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * alpha; };
  const tx = lerp(prev.t[0], w.t.x), ty = lerp(prev.t[1], w.t.y), tf = la(prev.t[2], w.t.facing);
  term.position.set(tx, 0, ty); term.rotation.y = -tf; fistM.position.x = w.t.fistCd > 8 ? 1.2 : 0.55;
  w.nls.forEach((n, i) => { const g = nlMeshes[i]; g.position.set(lerp(prev.n[i][0], n.x), 0, lerp(prev.n[i][1], n.y)); if (n.alive) g.rotation.y = -la(prev.n[i][2], n.facing); else { g.rotation.set(Math.PI / 2, 0, 0); g.position.y = 0.4; } });
  dbgGroup.visible = debug; for (const m of nlMarkers) m.visible = debug;
  if (debug) {
    w.nls.forEach((n, i) => { cones[i].visible = n.alive; cones[i].position.set(n.x, 0.05, n.y); cones[i].rotation.y = -n.facing;
      const b = n.belief; beliefs[i].visible = n.alive && b.valid; beliefs[i].position.set(b.x, 0.08 + i * 0.01, b.y); (beliefs[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - b.age / 50);
      links[i].visible = n.alive && b.valid; links[i].geometry.setFromPoints([new THREE.Vector3(n.x, 0.1, n.y), new THREE.Vector3(b.x, 0.1, b.y)]); links[i].computeLineDistances(); });
    noiseRing.position.set(w.t.x, 0.06, w.t.y); noiseRing.scale.setScalar(w.t.noise); tCone.position.set(w.t.x, 0.04, w.t.y); tCone.rotation.y = -w.t.facing;
  }
  // caméra ¾ haute qui suit le Terminator ; en portrait elle recule pour garder la meute dans le cadre
  const portrait = innerHeight > innerWidth;
  const sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  // paysage : caméra derrière (ouest), haute ; portrait : plus haute, pour que l'arène (24 m) tienne en largeur
  if (portrait) { camera.position.set(tx - 7 + sx, 36, ty + sz); camera.lookAt(tx + 7 + sx, 0, ty + sz); }
  else { camera.position.set(tx - 10 + sx, 22, ty + sz); camera.lookAt(tx + 8 + sx, 0, ty + sz); }
  camera.up.set(0, 1, 0);
  postMat.uniforms.uTime.value = performance.now() * 0.001;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = innerHeight > innerWidth ? 75 : 50; camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()); rt.setSize(s.x, s.y); }
addEventListener('resize', resize);

// Les modèles remplacent les proxies. Un échec de chargement laisse la capsule en place : le prototype
// reste jouable sans réseau ni assets.
async function loadModels() {
  const load = async (name: string, target: number, dim = 1) => {
    const model = await loadGLB(`/web/models/${name}.glb`);
    const clips: any[] = [...(model.animations ?? [])];
    for (const k of ['walk', 'run']) { try { const a = await loadGLB(`/web/models/${name}-${k}.glb`); clips.push(...(a.animations ?? [])); } catch { /* clip absent, on garde l'idle */ } }
    return rigOf(model, clips, target, dim);
  };
  await Promise.all(ROLES.map(async (_r, i) => {
    try {
      const rig = await load(`NL-${i + 1}`, NL_HEIGHT, 0.22);
      nlMeshes[i].add(rig.root); nlRigs[i] = rig;
      for (const p of nlProxy.slice(i * 3, i * 3 + 3)) p.visible = false; // capsule + 2 yeux de ce rôle
    } catch (e) { console.warn('modèle NL-' + (i + 1) + ' absent, capsule conservée', e); }
  }));
  try {
    termRig = await load('TERM', TERM_HEIGHT, 0.40);
    term.add(termRig.root);
    for (const c of term.children) if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).visible = false;
  } catch (e) { console.warn('modèle TERM absent, cubes conservés', e); }
}

if (debug) buildLabels();
await Promise.all([loadPolicy(), loadModels()]);
resize(); startRound();
if (shot) { // capture : on avance la sim de N ticks sans attendre le temps réel, puis on rend une image
  while (w.tick < shot && !w.done) tick();
  hitstop = 0; shake = 0; prev = snap(); hud(); render(1); document.title = 'READY';
} else {
  let last = performance.now();
  const loop = (now: number) => {
    let dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (hitstop > 0) { hitstop -= dt; dt = 0; }
    if (!paused && !roundOver) { acc += dt; while (acc >= DT) { acc -= DT; tick(); if (roundOver) break; } }
    shake *= 0.85; if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
    hud(); render(roundOver ? 1 : acc / DT); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
