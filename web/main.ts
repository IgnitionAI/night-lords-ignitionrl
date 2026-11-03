// Prototype gris : rendu Three.js (cubes et capsules) d'une sim pure à pas fixe (src/sim.ts).
import * as THREE from 'three';
import { newWorld, step, observe, nlFrame, terminatorPerceives, DT, MAX_TICKS, ARENA, PILLARS, BEACON, ROLES, T_CFG, NL_CFG, NL_ACTIONS, type World, type TAction } from '../src/sim';
import { POOL, UNSEEN, type Tactic } from '../src/tactics';
import { Recorder } from '../src/recorder';
import { forward, softmax, sample, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';
import { hunterState } from '../src/hunter-state';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { publishHunterState, isControlViewEnabled } from './hunter-channel';
// Son : module de Honsou, zéro dépendance, aucune fonction ne lève jamais. Sans banque (elle est hors du
// dépôt, licence Genex non confirmée) chaque appel renvoie false et ne fait rien — le jeu tourne à l'identique.
import { initAudio, audio } from './audio/nightlords-audio.js';

const qs = new URLSearchParams(location.search);
// Canal d'ambiance (`cogitator:hunters`) : muet sauf si l'URL demande explicitement `?control=1`.
// C'est un flag distinct de `?debug=1` (vue de contrôle historique, touche V), et rien de ce canal ne va au HUD.
const CONTROL_VIEW = isControlViewEnabled(location.search);
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
// P1 : l'oeil a hauteur d'homme. A 22 m et 50 degres, un Night Lord fait 55 px de haut et l'arene tient
// dans le cadre - on regarde un plateau, pas une traque. A 3,4 m et 58 degres il en fait 100 a 120.
const CAM = { back: 8.2, height: 3.4, highMax: 4.9, ahead: 3.0, eye: 1.2, fov: 58, fovPortrait: 68 };
// P4 : caméra à l'épaule. On ne regarde plus le Terminator, on est dedans : 3,55 m derrière, 1,15 m sur son
// épaule droite, 2,5 m du sol, et on regarde 5 m devant lui — le corps occupe le bas-gauche du cadre et la
// convergence se fait sur l'axe de marche. ?cam=couloir rend la caméra de P1 (comparaison, captures).
const EPAULE = { back: 3.55, side: 1.15, height: 2.5, ahead: 5.0, eye: 1.45, fov: 62, fovPortrait: 74 };
const CAM_MODE = qs.get('cam') === 'couloir' ? 'couloir' : 'epaule';
const IMPACT = qs.get('impact') !== '0'; // ?impact=0 : caméra stable, pour mesurer ce que le poids coûte
const camera = new THREE.PerspectiveCamera(CAM_MODE === 'epaule' ? EPAULE.fov : CAM.fov, 1, 0.1, 200);
// Une seule lumière de remplissage, froide et rasante : les formes se lisent par leur bord, pas par leur face.
scene.add(new THREE.AmbientLight(0x1b2130, 0.30));
const keyLight = new THREE.DirectionalLight(0x8fb4e8, 0.85); keyLight.position.set(50, 34, 6); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x5f7fd0, 1.1); rimLight.position.set(38, 12, 24); scene.add(rimLight);
const poolLight = new THREE.PointLight(0x8fb0e0, 9, 14, 2); poolLight.position.set(20, 5.5, BEACON.y); scene.add(poolLight);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), new THREE.MeshStandardMaterial({ color: 0x0e1014, metalness: 0.05, roughness: 0.82 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(ARENA.w / 2, 0, ARENA.h / 2); floor.receiveShadow = true; scene.add(floor);
// La grille etait le seul repere d'echelle du grey-box ; a hauteur d'homme elle dessine un plateau de jeu.
// Gardee derriere ?grid=1 pour le travail sur la geometrie.
const grid = new THREE.GridHelper(40, 40, 0x2a2f3a, 0x15181f); grid.position.set(20, 0.01, 20); grid.scale.set(1, 1, 0.6);
if (qs.get('grid') === '1') scene.add(grid);
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
interface Rig { root: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction | null; run: THREE.AnimationAction | null; idle: THREE.AnimationAction | null; current: THREE.AnimationAction | null; tell: { value: number }; }
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
  // Un seul objet uniform par modèle, créé ici : tous les programmes compilés plus tard le lisent en direct.
  // (Un uniform créé dans onBeforeCompile n'existe qu'après le premier rendu — en mode capture, les ticks
  // de simulation passaient tous avant, et le télégraphe restait à zéro.)
  const tell = { value: 0 };
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
    // Injecté *avant* le brouillard : ajouté après, le liseré traversait 17 m de brume intact et le Night
    // Lord devenait un mannequin blanc à contre-jour (vu à t77). Avant, la brume le mange comme le reste.
    // Le liseré porte aussi le télégraphe de la griffe : du bleu froid au rouge ardent, et il s'intensifie.
    if (m && m.onBeforeCompile) m.onBeforeCompile = (sh) => {
      sh.uniforms.uTell = tell;
      sh.fragmentShader = 'uniform float uTell;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `
       float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 4.2);
       gl_FragColor.rgb += mix(vec3(0.26, 0.35, 0.55), vec3(0.85, 0.12, 0.05), uTell) * fres * (0.55 + 1.4 * uTell);
       #include <fog_fragment>`);
    };
  });
  const mixer = new THREE.AnimationMixer(root);
  const pick = (n: string) => clips.find(c => c.name.toLowerCase().includes(n)) ?? null;
  const mk = (c: any) => (c ? mixer.clipAction(c) : null);
  return { root, mixer, walk: mk(pick('walk')), run: mk(pick('run')), idle: mk(model.animations?.[0] ?? null), current: null, tell };
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
// La lumière des armes. Le flash de bouche est une vraie lumière ponctuelle : il éclaire les piliers et
// découpe les silhouettes une fraction de seconde — c'est lui qui révèle les prédateurs. Le halo du gantelet
// pulse en continu, bleu, faible. Deux lumières de plus dans la passe principale (aucun draw call).
const muzzleLight = new THREE.PointLight(0xffd8a8, 0, 13, 2); term.add(muzzleLight); muzzleLight.position.set(1.9, 1.6, 0.6);
const fistLight = new THREE.PointLight(0x3a63ff, 2.2, 3.2, 2); term.add(fistLight); fistLight.position.set(0.55, 1.1, -0.95);
const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe080 })); scene.add(tracer); tracer.visible = false;

// Passe plein écran : vignette + grain. Un quad et un shader, aucun addon ; la render target est linéaire
// et c'est ce shader qui encode en sRGB (sinon l'image est deux fois trop sombre).
const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
const postScene = new THREE.Scene(); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uTime: { value: 0 }, uVignette: { value: 0.95 }, uBlur: { value: new THREE.Vector2(0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette; uniform vec2 uBlur; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      // flou directionnel de rotation : 5 prises seulement si la caméra tourne vite (branche morte sinon)
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (dot(uBlur, uBlur) > 1e-8) {
        c = vec3(0.0);
        for (int i = 0; i < 5; i++) c += texture2D(tDiffuse, vUv + uBlur * (float(i) * 0.25 - 0.5)).rgb;
        c /= 5.0;
      }
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
// Dernier tick publié sur le canal d'ambiance : garantit « une fois par tick au plus », même en pause.
let publishedTick = -1;
// Poids du Terminator : recul du bolter, appui du pas, respiration, inclinaison. Un ressort amorti par effet,
// mais évalué en forme fermée au moment du rendu et non intégré pas à pas : la simulation avance de 0,1 s et
// l'image de 16 ms — intégré par pas, tout ce poids arrivait par saccades de 10 Hz. La forme fermée se lit à
// n'importe quel instant, donc 60 fps lisse et une capture à ?shot=N tombe exactement sur le tick.
let simT = 0, breathT = 0, roll = 0, rollPrev = 0, camYawPrev = 0, yawRate = 0;
type Imp = { t0: number; v: number };
const recImp: Imp[] = [], pitchImp: Imp[] = [], stepImp: Imp[] = []; // recul arrière, nez qui monte, appui du pas
// x(t) = (v0/wd) e^(-z w t) sin(wd t) : réponse à une vitesse initiale, position nulle au départ.
function osc(imps: Imp[], t: number, w: number, z: number) {
  const wd = w * Math.sqrt(1 - z * z); let x = 0;
  for (const i of imps) { const a = t - i.t0; if (a < 0 || a > 1.2) continue; x += (i.v / wd) * Math.exp(-z * w * a) * Math.sin(wd * a); }
  return x;
}
const REC = { w: 13.8, z: 0.62 }, STP = { w: 23.2, z: 0.60 };
const FRESH = 1.2; // une impulsion de plus d'1,2 s ne s'entend plus
let stepRun = 0, stepY = 0, recZ = 0, recPitch = 0;
let muzzleT = 0, fistT = 0;
let roundOver = false, lastSummary = '';
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV') { debug = !debug; if (debug) buildLabels(); } if (e.code === 'KeyP') paused = !paused; if (e.code === 'Enter' && roundOver) startRound(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const snap = () => ({ t: [w.t.x, w.t.y, w.t.facing] as [number, number, number], n: w.nls.map(n => [n.x, n.y, n.facing] as [number, number, number]) });
function startRound() {
  // le build jouable garde l'armement des griffes (défaut) : il n'est plus celui des mesures b3
  roundNo++; roundOver = false; seed = seed + 1; w = newWorld(seed); camYaw = followYaw = w.t.facing; prev = snap(); rec = new Recorder(autoplay ? `autoplay ${autoplay}` : 'joueur'); rng = mulberry32(seed ^ 0x9e3779b9);
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
// Lacet de la caméra : elle se place derrière le dos du Terminator, pas sur un axe fixe. À 22 m la
// caméra plein ouest marchait ; à 3,4 m un axe fixe met un pilier de 4 m entre l'œil et la meute dès
// que le joueur longe un mur (vu à t77). Il est avancé d'un pas de simulation, donc ?shot= reste juste.
let camYaw = 0, followYaw = 0;
// P3 — le pivot. Mesure de l'état des lieux : la meute passe à plus de 90° dans le dos dès 8,3 s de
// manche, jusqu'à 174°. La caméra se décale donc *un peu* vers la menace la plus proche, jamais plus de
// 30 % de l'angle, et seulement si elle est derrière depuis plus d'une seconde : c'est un signal de
// présence, pas une caméra qui reprend la main. ?pivot=0 coupe, ?pivot=0.5 essaie plus fort.
const PIVOT = { max: Math.max(0, Math.min(1, parseFloat(qs.get('pivot') ?? '0.30'))), after: 1.0, range: 15, ramp: 0.10 };
let pivotT = 0, pivotA = 0;
function threatBehind() {
  let best: { a: number; i: number; d: number } | null = null;
  for (let i = 0; i < w.nls.length; i++) {
    const n = w.nls[i]; if (!n.alive) continue;
    const d = Math.hypot(n.x - w.t.x, n.y - w.t.y); if (d > PIVOT.range) continue;
    let rel = Math.atan2(n.y - w.t.y, n.x - w.t.x) - w.t.facing;
    while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
    if (Math.abs(rel) < Math.PI / 2) continue; // devant ou sur les flancs : rien à signaler
    if (!best || d < best.d) best = { a: rel, i, d };
  }
  return best;
}
function updateCamYaw() {
  const th = threatBehind();
  pivotT = th ? pivotT + DT : 0;
  const want = th && pivotT > PIVOT.after ? th.a * PIVOT.max : 0;
  pivotA += (want - pivotA) * PIVOT.ramp; // ~1 s pour se mettre en place, jamais un à-coup
  // Le suivi du dos et le pivot sont deux choses : on lisse le suivi, puis on ajoute le pivot. Mélangés
  // dans le même lissage, un joueur qui tourne annule la moitié du pivot (mesuré : 12° au lieu de 48°).
  let d = w.t.facing - followYaw;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  followYaw += d * 0.26; // ~4 rad/s de rotation max : le monde pivote sans fouetter
  camYaw = followYaw + pivotA;
  // Vitesse de rotation pour l'inclinaison et le flou : prise au pas de simulation, donc reproductible.
  let dy = camYaw - camYawPrev; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  yawRate = dy / DT;
  const rollTarget = Math.max(-0.050, Math.min(0.050, -yawRate * 0.100));
  rollPrev = roll; roll += (rollTarget - roll) * 0.20;
  camYawPrev = camYaw;
}
// Télégraphe de la griffe. La simulation ne donne aucune anticipation : la griffe frappe dans le tick où elle
// est choisie (src/sim.ts, action 7, distance <= clawRange). Ce qu'on peut montrer honnêtement, c'est la
// *griffe prête* (cd === 0) et la *fermeture*. Sur un assaillant qui vient dans le dos on ne voit que son dos,
// donc pas les yeux : le signal vit sur le liseré de silhouette, qui se lit de tous les angles.
// 6 m -> 0, portée de griffe -> 1 ; une griffe en recharge ne donne que 30 %.
// ?tell=0 coupe le télégraphe (comparaison avant/après, et réglage si ça crie trop).
const TELL_ON = qs.get('tell') !== '0';
const TELL_RANGE = 6.0, TELL_FADE = 1.5; // allumé jusqu'à 6 m, fondu sur les 1,5 m suivants
function updateTell() {
  for (let i = 0; i < nlRigs.length; i++) {
    const rig = nlRigs[i]; if (!rig) continue;
    const n = w.nls[i];
    const d = Math.hypot(n.x - w.t.x, n.y - w.t.y);
    // Binaire, pas un dégradé : la griffe est prête (cd === 0) et il est à portée d'un bond -> 1.
    const on = n.cd === 0 ? Math.max(0, Math.min(1, (TELL_RANGE + TELL_FADE - d) / TELL_FADE)) : 0;
    rig.tell.value = TELL_ON && n.alive ? on : 0;
  }
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
  updateTell();
}
// Panoramique d'une source : sa position écran, pas son angle au joueur (à 3 m la caméra voit autrement).
function panOf(x: number, y: number) { const v = new THREE.Vector3(x, 1.3, y).project(camera); return Math.max(-1, Math.min(1, v.x)); }
function tick() {
  prev = snap();
  const ta = tactic ? tactic(w) : playerAction(); rec.record(w, ta);
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    if (!actor) { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; }
    const p = softmax(forward(actor, observe(w, i))); const a = sample(p, rng); lastP[i] = p[a]; return a;
  }); lastActs = acts;
  step(w, ta, acts);
  // Après le pas, avant les événements : un tick couvre [t, t+DT], et la rafale qui part maintenant doit
  // porter l'horodatage de la fin du tick, sinon son flash est déjà éteint quand l'image est rendue.
  updateImpact(DT);
  for (const e of w.events) {
    // Le son suit les mêmes événements que la caméra, mais ne dépend pas de ?impact=0 : ce sont deux
    // sensations différentes, et on veut pouvoir mesurer l'une en gardant l'autre.
    if (e.type === 'step') audio.step({ intensity: (e as any).intensity ?? 1 });
    else if (e.type === 'bolt') audio.bolt({ pan: 0.05 });
    else if (e.type === 'fist') audio.fist({ pan: 0 });
    else if (e.type === 'clawArm') audio.clawArm({ pan: panOf(w.nls[(e as any).who].x, w.nls[(e as any).who].y) });
    else if (e.type === 'claw') { const n = w.nls[(e as any).who]; if ((e as any).dmg > 0) audio.claw({ pan: panOf(n.x, n.y) }); else audio.gauntletArc({ pan: panOf(n.x, n.y) }); }
    else if (e.type === 'whiff') audio.whiff({ pan: panOf(w.nls[(e as any).who].x, w.nls[(e as any).who].y) });
    if (e.type === 'bolt') {
      tracer.geometry.setFromPoints([new THREE.Vector3(e.x, 1.5, e.y), new THREE.Vector3(e.tx, 1.2, e.ty)]); tracer.visible = true; tracerT = 0.08; shake = Math.max(shake, 0.15);
      if (IMPACT) { recImp.push({ t0: simT, v: 2.2 }); pitchImp.push({ t0: simT, v: 0.55 }); } // la rafale pousse la caméra et lève le nez
    }
    if ((e.type === 'bolt' || e.type === 'fist') && e.kill >= 0) { hitstop = 0.09; shake = 0.5; const n = w.nls[e.kill]; floatText(n.x, n.y, `${ROLES[e.kill]} abattu`, '#ffd27a'); flash(0.25); }
    if (e.type === 'clawArm') { const n = w.nls[e.who]; floatText(n.x, n.y, 'GRIFFES', '#fb6'); shake = Math.max(shake, 0.08); } // annonce : l'impact tombe 2 ticks plus tard
    if (e.type === 'claw') { const n = w.nls[e.who]; if (e.dmg === 0) floatText(n.x, n.y, 'ARMURE', '#9cf'); else { floatText(w.t.x, w.t.y, `-${e.dmg} ${e.zone === 'rear' ? 'DOS' : 'FLANC'}`, '#f44'); shake = Math.max(shake, 0.3); } }
    // `step` : le pas est désormais un événement de simulation (position, pied, intensité). Le rendu le laisse
    // au cycle d'animation pour l'instant ; le son pourra s'y accrocher sans recompter les mètres.
  }
  // Lit de servomoteurs : la charge suit la vitesse réelle, 0 = ralenti. Le silence est aussi un son —
  // c'est le contraste entre le ralenti et la charge qui fait entendre la masse.
  const sp = Math.hypot(w.t.vx, w.t.vy);
  if (sp > 0.05) {
    if (!audio.servo.isRunning()) { audio.servoSurge({ pan: 0 }); audio.servo.start({ load: sp / 2.5 }); }
    audio.servo.setLoad(sp / 2.5);
  } else audio.servo.setLoad(0.1);
  updateRigs(DT); updateCamYaw();
  if (w.done) endRound();
}
function flash(o: number) { const f = document.getElementById('flash')!; f.style.transition = 'none'; f.style.opacity = String(o); requestAnimationFrame(() => { f.style.transition = 'opacity .25s'; f.style.opacity = '0'; }); }
async function endRound() {
  roundOver = true; audio.servo.stop({ fade: 0.5 }); if (w.winner === 'pack') score.pack++; else score.term++;
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
// Les impulsions, elles, tombent au pas de simulation : c'est la simulation qui décide qu'un pas est posé et
// qu'une rafale part. Ce qui les met en forme est continu.
function updateImpact(dt: number) {
  simT += dt; breathT += dt; fistT += dt;
  const moved = Math.hypot(w.t.x - prev.t[0], w.t.y - prev.t[1]);
  stepRun += moved;
  if (IMPACT && stepRun > 1.55) { stepRun = 0; stepImp.push({ t0: simT, v: -1.95 }); } // contact : la masse tombe
  for (let n = recImp.length - 1; n >= 0; n--) if (simT - recImp[n].t0 > FRESH) { recImp.splice(n, 1); pitchImp.splice(n, 1); }
  for (let n = stepImp.length - 1; n >= 0; n--) if (simT - stepImp[n].t0 > FRESH) stepImp.splice(n, 1);
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
  // caméra de couloir : 8,2 m derrière le Terminator, à 3,4 m du sol, qui regarde 3 m devant lui.
  // Le personnage occupe le tiers bas du cadre et la meute arrive de face, à sa hauteur.
  const portrait = innerHeight > innerWidth;
  const sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  // Un pilier de 4 m suffit à avaler le cadre : la caméra ne doit jamais se retrouver *dans* un pilier.
  // Une arête qui passe devant est acceptable — c'est même ce qu'on veut, un Night Lord peut se cacher
  // derrière. Donc pas de raycast de dégagement, seulement un test d'appartenance : si l'oeil tombe dans
  // l'emprise d'un pilier, la caméra monte au-dessus (4,9 m) et regarde par-dessus.
  const fx = Math.cos(camYaw), fz = Math.sin(camYaw);      // axe de marche
  const rx = -fz, rz = fx;                                 // son épaule droite
  if (CAM_MODE === 'couloir') {
    const back = portrait ? CAM.back + 1.6 : CAM.back, high = portrait ? CAM.height + 0.9 : CAM.height;
    const cx = tx - fx * back, cz = ty - fz * back;
    const inPillar = PILLARS.some(b => cx > b.x0 - 0.55 && cx < b.x1 + 0.55 && cz > b.y0 - 0.55 && cz < b.y1 + 0.55);
    const cy = inPillar ? CAM.highMax : high;
    camera.position.set(cx + sx, cy, cz + sz);
    camera.lookAt(tx + fx * CAM.ahead + sx, CAM.eye, ty + fz * CAM.ahead + sz);
  } else {
    // À l'épaule : la masse du Terminator se sent dans quatre offsets — la respiration (5,2 s, 2,8 cm),
    // l'appui du pas (ressort, un à-coup tous les 1,55 m), le recul du bolter (poussée arrière + nez qui
    // monte), et l'inclinaison dans les virages. La caméra reste 3,55 m derrière : il occupe le cadre.
    // temps de rendu : on avance dans le tick en cours pour que 60 fps reste lisse et qu'une capture tombe juste
    const now = simT - DT + alpha * DT;
    const breath = Math.sin(now * (2 * Math.PI / 5.2)) * 0.028; // 5,2 s par cycle, 2,8 cm
    recZ = osc(recImp, now, REC.w, REC.z); recPitch = osc(pitchImp, now, REC.w, REC.z);
    stepY = osc(stepImp, now, STP.w, STP.z);
    const back = EPAULE.back + recZ * 0.85;
    const high = EPAULE.height + stepY + breath;
    const side = portrait ? EPAULE.side * 0.6 : EPAULE.side;
    camera.position.set(tx - fx * back + rx * side + sx, high, ty - fz * back + rz * side + sz);
    camera.lookAt(tx + fx * EPAULE.ahead + sx, EPAULE.eye, ty + fz * EPAULE.ahead + sz);
  }
  camera.up.set(0, 1, 0);
  if (CAM_MODE === 'epaule') { if (recPitch) camera.rotateX(recPitch); camera.rotateZ(rollPrev + (roll - rollPrev) * alpha); }
  // flash de bouche : 75 ms après le départ de la rafale, décroissance quadratique. Il éclaire vraiment la
  // scène — piliers et silhouettes —, ce n'est pas un voile posé sur l'image.
  let mz = 0;
  if (CAM_MODE === 'epaule') for (const i of recImp) { const a = 1 - (simT - DT + alpha * DT - i.t0) / 0.075; if (a > mz) mz = a; }
  muzzleT = Math.max(0, mz);
  muzzleLight.intensity = 20 * muzzleT * muzzleT;
  const pulse = 0.72 + 0.28 * Math.sin((simT - DT + alpha * DT) * 3.1);
  fistLight.intensity = 2.2 * pulse;
  (fistM.material as THREE.MeshStandardMaterial).emissive.setRGB(0.05 * pulse, 0.12 * pulse, 0.62 * pulse);
  // Flou de rotation : 5 prises dans la passe plein écran quand la caméra tourne vite, rien sinon.
  const blur = CAM_MODE === 'epaule' ? Math.max(-0.018, Math.min(0.018, -yawRate * 0.0032)) : 0;
  postMat.uniforms.uBlur.value.set(blur, 0);
  postMat.uniforms.uTime.value = performance.now() * 0.001;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = CAM_MODE === 'epaule' ? (innerHeight > innerWidth ? EPAULE.fovPortrait : EPAULE.fov) : (innerHeight > innerWidth ? CAM.fovPortrait : CAM.fov); camera.updateProjectionMatrix();
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
await Promise.all([loadPolicy(), loadModels(), initAudio({ base: '/web/sfx/nightlords/', manifest: 'manifest.json' })]);
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
    // Ambiance : au plus une publication par tick, et seulement si `?control=1`. Le HUD, lui, ne lit rien
    // d'ici : aucune donnée du canal ne touche le DOM du joueur.
    if (CONTROL_VIEW && w.tick !== publishedTick) { publishHunterState(hunterState(w)); publishedTick = w.tick; }
    shake *= 0.85; if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
    hud(); render(roundOver ? 1 : acc / DT); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
