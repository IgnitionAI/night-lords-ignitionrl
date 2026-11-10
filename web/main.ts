// Rendu Three.js d'une sim pure à pas fixe (src/sim.ts) : modèles riggés, décor, capsules en repli.
import * as THREE from 'three';
import { newWorld, step, observe, nlFrame, terminatorPerceives, DT, ARENA, PILLARS, BEACON, ROLES, T_CFG, NL_CFG, NL_ACTIONS, type World, type TAction } from '../src/sim';
import { hudMarkup, matchBeats, matchStatus, roundCard, roundMarkup, type MatchStatus } from '../src/match';
import { PROP_PLACES, isPropKind, resolvePropKinds, type PropKind, type PropPlace } from '../src/props';
import { POOL, UNSEEN, type Tactic } from '../src/tactics';
import { Recorder } from '../src/recorder';
import { forward, softmax, sample, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';
import { hunterState } from '../src/hunter-state';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { publishHunterState, isControlViewEnabled } from './hunter-channel';
import { advanceMixer, displayMixerDelta, gaitTimeScale, mixerSubstepCount, pickGait, type Gait } from './locomotion';
import { NL_HEIGHT, TERM_HEIGHT, measureForwardStride, measureHeight, pickClip } from './stride';
import {
  type CombatKind, type CombatMachine, type ShotDurations, crossFadeFor, eventsToFlags, freshMachine,
  isLoco, nlIntent, pickNamedClip, termIntent, tickMachine,
} from './combat-anims';
import { bindOneShot, makeCombatClips } from './proc-clips';
import {
  extraAnimBasenames, IDLE_CLIP_KEYS, oneShotDurations, remapClip, resolveCombatClips,
} from './combat-clips';
import {
  applyRendererAtmosphere, applySceneAtmosphere, installCorridorLights, configureHunterSpot,
  CAM, EPAULE, FOLLOW_YAW_BLEND, POST_VIGNETTE, POST_GRAIN, LAMP, STRIP_EMISSIVE,
} from './atmosphere';
// Son : module de Honsou, zéro dépendance, aucune fonction ne lève jamais. Sans banque (elle est hors du
// dépôt, licence Genex non confirmée) chaque appel renvoie false et ne fait rien — le jeu tourne à l'identique.
import { initAudio, audio, onStep, onServoCharge, onBolterBurst, onFistCharge, onFistImpact, onHit, onServoAlarm, onServoLoop } from './audio/nightlords-audio.js';

const qs = new URLSearchParams(location.search);
// Canal d'ambiance (`cogitator:hunters`) : muet sauf si l'URL demande explicitement `?control=1`.
// C'est un flag distinct de `?debug=1` (vue de contrôle historique, touche V), et rien de ce canal ne va au HUD.
const CONTROL_VIEW = isControlViewEnabled(location.search);
const autoplay = qs.get('autoplay'); const shot = Number(qs.get('shot') ?? 0);
let debug = qs.get('debug') === '1';
// `?seed=N` joue **N**. La manche 1 prend la graine telle quelle ; les manches suivantes avancent d'un cran,
// pour qu'« Entrée » ne rejoue pas la même partie. Avant, `startRound()` incrémentait dès la première manche :
// un `?seed=6` jouait donc la 7, et toutes les planches étiquetées par leur URL étaient décalées d'un cran.
let seed = qs.get('seed') !== null ? Number(qs.get('seed')) : (Date.now() % 800000) + 1;
let actor: ActorJSON | null = null; let policyLabel = 'meute naïve (aucune politique chargée)';
const ROLE_COL = [0xd8d8ff, 0xff3030, 0xffa020, 0x30d0ff];
const ROLE_CSS = ['#d8d8ff', '#ff3030', '#ffa020', '#30d0ff'];

// ---------- scène
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
applyRendererAtmosphere(renderer);
// Brouillard : FogExp2 par défaut (densité 0,060, visibilité utile ~16–22 m). `?fog=linear` rampe 6→30 m.
// Même couleur que le fond, sinon une ligne d'horizon se dessine là où la géométrie s'efface.
const FOG_MODE = qs.get('fog') ?? 'exp2';
const scene = new THREE.Scene();
applySceneAtmosphere(scene, FOG_MODE);
// Cadrage : constantes dans `web/atmosphere.ts`. `?cam=couloir` rend P1 (comparaison, captures).
const CAM_MODE = qs.get('cam') === 'couloir' ? 'couloir' : 'epaule';
const IMPACT = qs.get('impact') !== '0'; // ?impact=0 : caméra stable, pour mesurer ce que le poids coûte
const camera = new THREE.PerspectiveCamera(CAM_MODE === 'epaule' ? EPAULE.fov : CAM.fov, 1, 0.1, 200);
installCorridorLights(scene, BEACON.y);
// ================== DÉCOR ==================
// Le grey-box était un plan, sept boîtes et une grille. Ici, un pont de vaisseau construit : tôle rivetée,
// membrures, poutres de plafond, panneaux de coque. Tout est **procédural** — aucune texture ni aucun modèle
// externe, donc pas de crédit dépensé et pas de question de licence — et tout ce qui se répète passe par
// InstancedMesh : la coque entière coûte une poignée d'appels de rendu.
// `?env=0` rend l'ancien grey-box, pour la comparaison avant/après. La collision ne bouge pas d'un centimètre :
// c'est toujours `PILLARS` de la simulation qui décide où l'on passe.
const ENV = qs.get('env') !== '0';
const procTex = (size: number, draw: (g: CanvasRenderingContext2D, n: number) => void, repeat: [number, number] = [1, 1]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 4; return t;
};
const noiseInto = (g: CanvasRenderingContext2D, n: number, count: number, alpha: number, light: boolean) => {
  for (let i = 0; i < count; i++) {
    const v = (Math.random() * 60) | 0;
    g.fillStyle = light ? `rgba(${180 + v},${185 + v},${195 + v},${alpha})` : `rgba(${v},${v},${v + 4},${alpha})`;
    g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
};
// tôle : fond sombre, plaques de 128, lignes de soudure, rangées de rivets
const deckMap = procTex(512, (g, n) => {
  g.fillStyle = '#23282f'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 128) for (let x = 0; x < n; x += 128) {
    const k = 10 + Math.random() * 12; g.fillStyle = `rgb(${30 + k},${34 + k},${41 + k})`; g.fillRect(x + 2, y + 2, 124, 124);
  }
  noiseInto(g, n, 5200, 0.10, false); noiseInto(g, n, 1600, 0.05, true);
  g.strokeStyle = 'rgba(6,8,10,.85)'; g.lineWidth = 3;
  for (let y = 0; y <= n; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); }
  for (let x = 0; x <= n; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, n); g.stroke(); }
  for (let y = 16; y < n; y += 128) for (let x = 16; x < n; x += 32) {
    g.fillStyle = 'rgba(120,128,140,.30)'; g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x + 1, y + 1, 2.4, 0, 7); g.fill();
  }
}, [6, 4]);
// rugosité : les plaques sont mates, les soudures et les rivets accrochent la lumière
const deckRough = procTex(256, (g, n) => {
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, n, n);
  noiseInto(g, n, 2600, 0.25, true);
  g.strokeStyle = 'rgba(168,168,168,.75)'; g.lineWidth = 2;
  for (let y = 0; y <= n; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); }
  for (let x = 0; x <= n; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, n); g.stroke(); }
}, [6, 4]);
deckRough.colorSpace = THREE.NoColorSpace;
const wallMap = procTex(256, (g, n) => {
  g.fillStyle = '#2a3038'; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 64) { const k = 10 + Math.random() * 12; g.fillStyle = `rgb(${40 + k},${44 + k},${52 + k})`; g.fillRect(1, y + 1, n - 2, 62); }
  noiseInto(g, n, 2600, 0.12, false);
  g.fillStyle = 'rgba(0,0,0,.5)'; for (let y = 0; y < n; y += 64) g.fillRect(0, y, n, 2);
}, [6, 2]);

const deckMat = new THREE.MeshStandardMaterial({ map: deckMap, roughnessMap: deckRough, color: 0xd9dee6, metalness: 0.18, roughness: 1 });
const hullMat = new THREE.MeshStandardMaterial({ map: wallMap, color: 0x8e97a6, metalness: 0.35, roughness: 0.68 });
const ribMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, metalness: 0.7, roughness: 0.45 });

const floorMat = ENV ? deckMat : new THREE.MeshStandardMaterial({ color: 0x0e1014, metalness: 0.05, roughness: 0.82 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.set(ARENA.w / 2, 0, ARENA.h / 2); floor.receiveShadow = true; scene.add(floor);
// La grille était le seul repère d'échelle du grey-box ; gardée derrière ?grid=1.
const grid = new THREE.GridHelper(40, 40, 0x2a2f3a, 0x15181f); grid.position.set(20, 0.01, 20); grid.scale.set(1, 1, 0.6);
if (qs.get('grid') === '1') scene.add(grid);
const wallMat = ENV ? hullMat : new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.5, roughness: 0.6 });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const inst = (mat: THREE.Material, mats: THREE.Matrix4[], cast = true) => {
  const m = new THREE.InstancedMesh(unitBox, mat, mats.length);
  mats.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.instanceMatrix.needsUpdate = true; m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m;
};
const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

if (ENV) {
  // membrures de pont : une nervure tous les 3 m dans le sens de la largeur, + les deux lisses de rive
  const ribs: THREE.Matrix4[] = [];
  for (let x = 1.5; x < ARENA.w; x += 3) ribs.push(M(x, 0.035, ARENA.h / 2, 0.16, 0.07, ARENA.h));
  ribs.push(M(ARENA.w / 2, 0.09, 0.55, ARENA.w, 0.18, 0.9), M(ARENA.w / 2, 0.09, ARENA.h - 0.55, ARENA.w, 0.18, 0.9));
  for (let x = 1.5; x < ARENA.w; x += 2.5) ribs.push(M(x, 2.9, 0.1, 0.16, 5.8, 0.14), M(x, 2.9, ARENA.h - 0.1, 0.16, 5.8, 0.14));
  for (let z = 1.5; z < ARENA.h; z += 2.5) ribs.push(M(0.1, 2.9, z, 0.14, 5.8, 0.16), M(ARENA.w - 0.1, 2.9, z, 0.14, 5.8, 0.16));
  inst(ribMat, ribs);
  // poutres de plafond : elles ferment le cadre et donnent l'occlusion qui manquait au grey-box
  const beams: THREE.Matrix4[] = [];
  for (let x = 2; x < ARENA.w; x += 4) beams.push(M(x, 5.55, ARENA.h / 2, 0.34, 0.34, ARENA.h));
  beams.push(M(ARENA.w / 2, 5.55, 1.2, ARENA.w, 0.42, 0.42), M(ARENA.w / 2, 5.55, ARENA.h - 1.2, ARENA.w, 0.42, 0.42));
  inst(ribMat, beams);
  // plafond
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), new THREE.MeshStandardMaterial({ color: 0x0d1015, metalness: 0.1, roughness: 0.95, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(ARENA.w / 2, 5.75, ARENA.h / 2); scene.add(ceil);
}
// Pilastres : socle, fût, chapiteau — la même boîte unitaire, une instance par bloc. La collision reste celle
// de `PILLARS` ; ce qui change est ce qu'on voit d'elle.
const shaftM: THREE.Matrix4[] = [], plinthM: THREE.Matrix4[] = [], capM: THREE.Matrix4[] = [], ribVM: THREE.Matrix4[] = [];
for (const b of PILLARS) {
  const w = b.x1 - b.x0, d = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
  shaftM.push(M(cx, 2, cz, w, 4, d));
  if (ENV) {
    plinthM.push(M(cx, 0.14, cz, w + 0.5, 0.28, d + 0.5));
    capM.push(M(cx, 4.15, cz, w + 0.4, 0.3, d + 0.4));
    // nervures verticales sur les quatre faces : six par face, c'est ce qui donne l'échelle
    for (let t = -1; t <= 1; t += 2) {
      for (let k = -1; k <= 1; k++) ribVM.push(M(cx + t * (w / 2 + 0.06), 2.1, cz + k * (d / 2) * 0.62, 0.12, 3.7, 0.22));
      for (let k = -1; k <= 1; k++) ribVM.push(M(cx + k * (w / 2) * 0.62, 2.1, cz + t * (d / 2 + 0.06), 0.22, 3.7, 0.12));
    }
  }
}
inst(wallMat, shaftM);
if (ENV) { inst(ribMat, plinthM); inst(ribMat, capM); inst(ribMat, ribVM); }
// coque périphérique : panneaux hauts, pour qu'on ne voie plus le vide derrière les piliers
for (const [w, d, x, z] of [[ARENA.w, 0.4, ARENA.w / 2, -0.2], [ARENA.w, 0.4, ARENA.w / 2, ARENA.h + 0.2], [0.4, ARENA.h, -0.2, ARENA.h / 2], [0.4, ARENA.h, ARENA.w + 0.2, ARENA.h / 2]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, ENV ? 5.8 : 1.2, d), wallMat);
  m.position.set(x, ENV ? 2.9 : 0.6, z); m.castShadow = m.receiveShadow = true; scene.add(m);
}
// Bandes de secours : de l'émissif, pas des sources de lumière. Sept lampes ponctuelles coûtaient sept
// éclairages par pixel sur cinq maillages skinnés ; ici la lueur rouge est peinte, et seules deux vraies
// lampes éclairent la scène (`?lights=all` rend les sept, pour comparer).
const stripMat = new THREE.MeshStandardMaterial({ color: 0x1a0b06, emissive: 0xff6a2a, emissiveIntensity: STRIP_EMISSIVE, fog: true });
if (ENV) {
  // Un bandeau courbé sous l'arête de chaque pilastre, et des veilleuses de plafond de 1,2 m. Rien de travers
  // dans le cadre : une bande émissive de 12 m à 1,5 d'intensité devenait un néon rouge qui mangeait la scène.
  const strips: THREE.Matrix4[] = [];
  for (const b of PILLARS) strips.push(M((b.x0 + b.x1) / 2, 3.32, b.y0 - 0.26, (b.x1 - b.x0) * 0.5, 0.045, 0.045));
  for (let x = 4; x < ARENA.w; x += 8) strips.push(M(x, 5.45, ARENA.h / 2 - 3.2, 1.2, 0.05, 0.08), M(x, 5.45, ARENA.h / 2 + 3.2, 1.2, 0.05, 0.08));
  inst(stripMat, strips, false);
}
const ALL_LIGHTS = qs.get('lights') === 'all';
PILLARS.forEach((b, i) => {
  if (ENV && !ALL_LIGHTS && i % 3 !== 0) return; // deux vraies lampes sur sept suffisent avec les bandes
  const lamp = new THREE.PointLight(LAMP.color, LAMP.intensity, LAMP.distance, LAMP.decay); lamp.position.set((b.x0 + b.x1) / 2, 3.6, b.y0 - 0.3); scene.add(lamp);
});
// Rayon de téléportation : une braise, pas un néon. Le vert saturait à 255 et devenait l'objet le plus attractif du plateau.
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(BEACON.r, BEACON.r, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xc24a12, emissiveIntensity: 0.85 }));
beacon.position.set(BEACON.x, 0.05, BEACON.y); scene.add(beacon); const bl = new THREE.PointLight(0xff7a3a, 7, 9, 2); bl.position.set(BEACON.x, 2, BEACON.y); scene.add(bl);

// ================== PROPS SCULPTÉS (Genex) ==================
// Le décor de #44 est de la géométrie **construite** : il donne l'architecture (tôle, membrures, pilastres),
// pas les formes qu'un sculpteur produit — l'épave, la tuyauterie, le cadavre. Six props Genex comblent ce
// trou : débris, caisse, tuyauterie, chaînes, reliquaire, serviteur mort. Barème lu dans l'API : 35 crédits
// le modèle texturé, 210 pour le lot. Versions optimisées versionnées comme les personnages, chargées à
// l'exécution ; un prop absent ne casse rien, il manque.
// `?props=0` rend la scène de #44 tick pour tick ; `?env=0` (grey-box) les coupe aussi, sinon la comparaison
// grey-box/décor ne voudrait plus rien dire.
// Un seul appel de rendu par **type** de prop : les instances d'un même modèle partagent géométrie et
// matériau (`InstancedMesh`), et c'est le seul moyen de poser vingt objets pour six appels.
const PROPS_ON = qs.get('props') !== '0' && ENV;
let loadedPropKinds: PropKind[] = [];
interface PropView { axis: 'x' | 'y' | 'z'; size: number; dim: number }
const PROP_VIEW: Record<string, PropView> = {
  // `size` = la dimension visée en mètres sur `axis` ; `dim` = facteur d'albedo, comme pour les personnages
  // (textures calibrées pour un studio, pas pour un couloir à 10 lux).
  debris: { axis: 'z', size: 1.8, dim: 0.28 },
  crate: { axis: 'z', size: 1.15, dim: 0.26 },
  pipes: { axis: 'y', size: 2.4, dim: 0.28 },
  chains: { axis: 'z', size: 2.6, dim: 0.28 },
  reliquary: { axis: 'y', size: 2.4, dim: 0.38 },
  servitor: { axis: 'z', size: 1.5, dim: 0.28 },
};
// Poses : `PROP_PLACES` (`src/props.ts`), partagées avec la simulation. `rot` autour de Y ; le modèle
// regarde +Z. #46 : un prisme orienté par instance **affichée** ; `?props=0` ou asset manquant = #44.
const PROP_TINT = new THREE.Color(0.74, 0.82, 0.96);
const propStats = { instances: 0, tris: 0, calls: 0, missing: [] as string[] };
async function loadProps() {
  if (!PROPS_ON) return;
  const byKind = new Map<string, PropPlace[]>();
  for (const p of PROP_PLACES) { const a = byKind.get(p.kind) ?? []; a.push(p); byKind.set(p.kind, a); }
  await Promise.all([...byKind].map(async ([kind, places]) => {
    const spec = PROP_VIEW[kind];
    let gltf: any;
    try { gltf = await loadGLB(`/web/models/props/${kind}.glb`); }
    catch (e) { propStats.missing.push(kind); console.warn(`prop ${kind} absent, la scène reste celle de #44`, e); return; }
    gltf.scene.updateMatrixWorld(true);
    let src: any = null;
    gltf.scene.traverse((o: any) => { if (!src && o.isMesh) src = o; });
    if (!src) return;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const k = spec.size / Math.max(size[spec.axis], 1e-4);
    // modèle -> origine posée au sol (ou au plafond pour ce qui pend), à la taille visée
    const lift = (places[0].ceil ? -box.max.y : -box.min.y) * k;
    const norm = new THREE.Matrix4().makeTranslation(0, lift, 0)
      .multiply(new THREE.Matrix4().makeScale(k, k, k))
      .multiply(src.matrixWorld);
    const mat = src.material as THREE.MeshStandardMaterial;
    if (mat) {
      // Deux corrections, mesurées à l'œil sur trois captures : l'albedo Genex est calibré pour un studio,
      // et sa palette tire vers le brun chaud — sous le projecteur du Terminator une caisse devenait un
      // carton clair. On l'assombrit **et** on le refroidit, comme la coque qui l'entoure.
      mat.color?.multiplyScalar(spec.dim).multiply(PROP_TINT);
      mat.envMapIntensity = 0.2;
      mat.metalness = Math.min(mat.metalness ?? 0.5, 0.35);
      mat.roughness = Math.max(mat.roughness ?? 0.8, 0.7);
      mat.fog = true;
    }
    const inst = new THREE.InstancedMesh(src.geometry, mat, places.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    places.forEach((p, i) => {
      const j = p.scale ?? 1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      pos.set(p.x, p.y ?? 0, p.z);
      s.set(j, j, j);
      m.compose(pos, q, s).multiply(norm);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = inst.receiveShadow = true;
    inst.frustumCulled = false; // une instance par modèle : la sphère englobante d'un InstancedMesh ne couvre que l'origine
    scene.add(inst);
    if (isPropKind(kind)) loadedPropKinds.push(kind);
    propStats.instances += places.length;
    propStats.calls += 1;
    const idx = src.geometry.index; propStats.tris += ((idx ? idx.count : src.geometry.attributes.position.count) / 3) * places.length;
  }));
}

// ---------- modeles rigges (assets/rigged-opt, 1,21-1,78 Mo piece, 24 os, 1,70 m, face +Z)
// Le facteur d'echelle est cale sur la hauteur du collider, pas sur un gout : NL radius 0,45 -> 2,0 m de haut,
// Terminator radius 0,8 -> 2,6 m. Sinon le visuel deborde de la boite de collision et traverse les murs.
const gltfLoader = new GLTFLoader();
const loadGLB = (url: string) => new Promise<any>((res, rej) => gltfLoader.load(url, res, undefined, rej));
// LOD de **texture** : c'est le seul levier qui reste sur ces assets, et il est gratuit à l'œil. Les cinq
// modèles portent 3 textures 1024² chacun, soit 80 Mio de VRAM avec mipmaps ; à 512² ils en font 20, et l'écart
// mesuré au même tick est de −0,04/255, sous le plancher du grain. `?tex=1024` reprend les fichiers pleine
// résolution pour comparer. La géométrie n'est pas touchée : elle est bloquée à 8 665 triangles côté outil.
const TEX = qs.get('tex') === '1024' ? 1024 : 512;
async function loadModelGLB(name: string) {
  if (TEX === 512) { try { return await loadGLB(`/web/models/${name}-512.glb`); } catch { /* pas de variante : on prend l'original */ } }
  return loadGLB(`/web/models/${name}.glb`);
}
interface Rig {
  root: THREE.Object3D; mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction | null; run: THREE.AnimationAction | null; idle: THREE.AnimationAction | null;
  attack: THREE.AnimationAction | null; shoot: THREE.AnimationAction | null;
  hit: THREE.AnimationAction | null; dodge: THREE.AnimationAction | null; death: THREE.AnimationAction | null;
  current: THREE.AnimationAction | null; tell: { value: number };
  strideWalk: number; strideRun: number; allowRun: boolean;
  combat: CombatMachine; kind: CombatKind;
  clipDurations: ShotDurations;
}
const actionForKind = (rig: Rig, kind: CombatKind, style: CombatMachine['attackStyle']): THREE.AnimationAction | null => {
  switch (kind) {
    case 'run': return rig.run ?? rig.walk;
    case 'walk': return rig.walk ?? rig.run;
    case 'idle': return rig.idle;
    case 'attack': return style === 'shoot' ? (rig.shoot ?? rig.attack) : (rig.attack ?? rig.shoot);
    case 'hit': return rig.hit;
    case 'dodge': return rig.dodge;
    case 'death': return rig.death;
    default: { const _e: never = kind; return _e; }
  }
};
const rigOf = (model: any, clips: THREE.AnimationClip[], targetHeight: number, dim = 1, allowRun = true): Rig => {
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
  const walkClip = pickClip(clips, 'walk');
  const runClip = pickClip(clips, 'run');
  const proc = makeCombatClips(root);
  const resolved = resolveCombatClips(clips, proc);
  const mk = (c: THREE.AnimationClip | null) => (c ? mixer.clipAction(c) : null);
  const mkShot = (c: THREE.AnimationClip, hold: boolean) => bindOneShot(mixer.clipAction(c), hold);
  const strideWalk = walkClip ? measureForwardStride(root, walkClip).stride : 0;
  const strideRun = runClip ? measureForwardStride(root, runClip).stride : 0;
  return {
    root, mixer, walk: mk(walkClip), run: mk(runClip),
    idle: mk(pickNamedClip(clips, IDLE_CLIP_KEYS) ?? model.animations?.[0] ?? null),
    attack: mkShot(resolved.attack, false),
    shoot: mkShot(resolved.shoot, false),
    hit: mkShot(resolved.hit, false),
    dodge: mkShot(resolved.dodge, false),
    death: mkShot(resolved.death, true),
    current: null, tell, strideWalk, strideRun, allowRun,
    combat: freshMachine(), kind: 'idle',
    clipDurations: oneShotDurations(resolved),
  };
};
const playKind = (rig: Rig, speed: number) => {
  const want = rig.combat.state;
  const next = actionForKind(rig, want, rig.combat.attackStyle);
  const fade = crossFadeFor(rig.kind, want);
  if (next && (next !== rig.current || rig.combat.restart)) {
    if (next !== rig.current) rig.current?.fadeOut(fade);
    next.reset().setEffectiveWeight(1).fadeIn(next === rig.current ? 0.04 : fade).play();
    if (want === 'death') { next.clampWhenFinished = true; next.setLoop(THREE.LoopOnce, 1); }
    rig.current = next;
  }
  rig.kind = want;
  if (next && isLoco(want) && want !== 'idle') {
    const stride = want === 'run' ? rig.strideRun : rig.strideWalk;
    next.timeScale = gaitTimeScale(speed, stride, next.getClip().duration);
  } else if (next) next.timeScale = 1;
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
const spot = new THREE.SpotLight(0xfff2d0, 34, T_CFG.visionRange + 4, T_CFG.visionHalf * 0.75, 0.5, 1.4); spot.position.set(0.7, 2.4, 0);
configureHunterSpot(spot, T_CFG.visionRange + 4);
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
function advanceRigs(dt: number) {
  if (!(dt > 0)) return;
  for (const rig of [...nlRigs, termRig]) {
    if (!rig) continue;
    const ts = rig.current?.timeScale ?? 1;
    advanceMixer(rig.mixer, dt, mixerSubstepCount(dt, ts));
  }
}
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
// Flash de coup : une lumière ponctuelle, pas une retouche des matériaux Genex (branche parallèle TERM).
const hitGlowNL = nlMeshes.map((g) => {
  const l = new THREE.PointLight(0xff5533, 0, 4.2, 2);
  l.position.set(0, 1.35, 0);
  g.add(l);
  return l;
});
const hitGlowT = new THREE.PointLight(0xff6633, 0, 5.5, 2);
hitGlowT.position.set(0, 1.6, 0);
term.add(hitGlowT);
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
// Alarme de servo (#24) : l'armure encaisse, et c'est l'armure qui le dit — une lueur rouge qui bat dans les
// plaques pendant une seconde. Ni lampe collée sur le modèle (une boule blanche au-dessus de l'épaule, essayé,
// ça ressemble à un bug), ni source de lumière : une troisième lumière ponctuelle se paierait sur chaque pixel
// des cinq maillages skinnés. L'émissif ne coûte rien — même draw call, mêmes triangles.
const ALARM_ON = qs.get('alarme') !== '0'; // ?alarme=0 pour la comparaison avant/après
const ALARM_COLOR = new THREE.Color(0xff2a0e);
const alarmMats: THREE.MeshStandardMaterial[] = []; // rempli au chargement du Terminator
const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe080 })); scene.add(tracer); tracer.visible = false;

// Passe plein écran : vignette + grain. Un quad et un shader, aucun addon ; la render target est linéaire
// et c'est ce shader qui encode en sRGB (sinon l'image est deux fois trop sombre).
const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
const postScene = new THREE.Scene(); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, uTime: { value: 0 }, uVignette: { value: POST_VIGNETTE }, uGrain: { value: POST_GRAIN }, uBlur: { value: new THREE.Vector2(0, 0) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain; uniform vec2 uBlur; varying vec2 vUv;
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
      c += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
      vec3 srgb = pow(clamp(c, 0.0, 1.0), vec3(0.4545));
      // 1,5/255 après gamma : le fog sur un grand plan sombre bande en 8 bits, le grain linéaire n'y suffit pas
      srgb += (hash(vUv * 173.0 + uTime * 0.37) - 0.5) * (1.5 / 255.0);
      gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
    }`,
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ---------- état de jeu
let w: World, prev: { t: [number, number, number]; n: [number, number, number][] }, rec: Recorder, rng: () => number, tactic: Tactic | null;
let roundNo = 0, score = { pack: 0, term: 0 }, paused = false, acc = 0, mixerSim = 0, hitstop = 0, shake = 0, lastActs: number[] = [0, 0, 0, 0], lastP: number[] = [0, 0, 0, 0], tracerT = 0;
let nlPrevStun = [0, 0, 0, 0], nlPrevAction = [0, 0, 0, 0];
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
let stepY = 0, recZ = 0, recPitch = 0;
let muzzleT = 0, fistT = 0;
let roundOver = false, lastSummary = '';
let lastMatch: MatchStatus | null = null;
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV') { debug = !debug; if (debug) buildLabels(); } if (e.code === 'KeyP') paused = !paused; if (e.code === 'Enter' && roundOver) startRound(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const snap = () => ({ t: [w.t.x, w.t.y, w.t.facing] as [number, number, number], n: w.nls.map(n => [n.x, n.y, n.facing] as [number, number, number]) });
// ---------- mode démo : mise en scène des ENTRÉES, jamais de la simulation
// `?demo=reveal` place les cinq acteurs et leur donne un script d'actions. Le pas de simulation reste
// intact : c'est step(w, ta, acts) qui décide des dégâts, des événements et du bruit. Ce qui est fabriqué,
// c'est le scénario — positions de départ et entrées —, exactement comme le fait une politique d'autoplay.
// Toute capture prise ici doit être étiquetée « mise en scène », jamais présentée comme une manche jouée :
// une démo ne remplace jamais une mesure de jeu, elle montre une intention.
const DEMO = qs.get('demo');
interface DemoScript { place(w: World): void; player(t: number): TAction; nls(t: number, w: World): number[] }
const DEMO_SCRIPTS: Record<string, DemoScript> = {
  // Deux effets que le jeu joué ne donne jamais ensemble, à portée de lecture :
  //   t13 — le frère du flanc arme sa griffe (2 ticks, décidés par la simulation) et la rafale part :
  //   `?shot=14` montre les deux ensemble — armTicks = 1, flash à 75 % de sa course.
  // Le prédateur est à 1,4 m du canon, pas à 6 : on regarde ce que fait la lumière, pas ce que fait une graine.
  reveal: {
    place(w: World) {
      w.t.x = 6; w.t.y = 10; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      // [x, y, facing] — le premier est la proie éclairée par la rafale, le deuxième arme dans le flanc
      const spots = [
        [9.0, 11.0, Math.PI],   // 3,2 m devant, à 18° à droite : dans le cône de bouche
        [4.6, 10.6, 0.4],       // 1,4 m sur le flanc gauche : à portée de griffe, armé au t13
        [11.4, 8.2, Math.PI * 0.8], // 5,5 m, plus loin à gauche
        [2.2, 12.4, 1.2],       // 8 m derrière-droite, pour la profondeur
      ];
      w.nls.forEach((n, i) => { const [x, y, f] = spots[i]; n.x = x; n.y = y; n.facing = f; n.alive = true; n.hp = 1; n.belief.valid = true; n.belief.x = w.t.x; n.belief.y = w.t.y; n.belief.age = 0; n.belief.seen = true; });
    },
    player(t: number): TAction { return { fwd: t < 4 ? 1 : 0, strafe: 0, turn: 0, bolt: t === 13, fist: false }; },
    // (le pas de simulation exécute le tick 13 puis s'arrête à `shot = 14` : l'armement est donc encore
    //  à 1 au moment du rendu, et l'impulsion de recul du bolter, elle, date du tick 13.)
    // La meute ne bouge plus (action 0 = repos) sauf celle du flanc, qui arme au t12 : armTicks passe à 2,
    // puis 1 au t13 (l'image qu'on photographie), et l'impact tombe au t14 — hors champ, mais réel.
    nls(t: number): number[] { return [0, t === 13 ? 7 : 0, 0, 0]; },
  },
  // Planches de combat : positions + actions, le pas de sim décide encore des événements.
  idle: {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      const spots = [
        [10.2, 13.4, Math.PI * 0.9],
        [9.4, 10.6, 0.4],
        [11.6, 11.2, Math.PI],
        [7.2, 13.8, 4.0],
      ];
      w.nls.forEach((n, i) => {
        const [x, y, f] = spots[i];
        n.x = x; n.y = y; n.facing = f; n.alive = true;
        n.cd = 20; n.armTicks = 0; n.stunTicks = 0;
      });
    },
    player(): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; },
    nls(): number[] { return [0, 0, 0, 0]; },
  },
  'combat-attack': {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 0; n.armTicks = 0; n.stunTicks = 0; });
      w.nls[1].x = 8.55; w.nls[1].y = 13.5; w.nls[1].facing = Math.atan2(12 - 13.5, 8 - 8.55);
      w.nls[0].x = 14; w.nls[0].y = 9; w.nls[0].facing = Math.PI;
      w.nls[2].x = 14; w.nls[2].y = 15; w.nls[2].facing = Math.PI;
      w.nls[3].x = 16; w.nls[3].y = 12; w.nls[3].facing = Math.PI;
    },
    player(): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; },
    nls(t: number): number[] { return [0, t === 3 ? 7 : 0, 0, 0]; },
  },
  'combat-hit': {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 0; n.armTicks = 0; n.stunTicks = 0; });
      w.nls[1].x = 8.5; w.nls[1].y = 13.48; w.nls[1].facing = Math.atan2(12 - 13.48, 8 - 8.5);
      w.nls[0].x = 15; w.nls[0].y = 8; w.nls[2].x = 15; w.nls[2].y = 16; w.nls[3].x = 18; w.nls[3].y = 12;
    },
    player(): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false }; },
    nls(t: number): number[] { return [0, t === 2 ? 7 : 0, 0, 0]; },
  },
  'combat-death': {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0; w.t.ammo = T_CFG.boltAmmo; w.t.boltCd = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 20; n.armTicks = 0; n.stunTicks = 0; });
      w.nls[0].x = 12.5; w.nls[0].y = 12; w.nls[0].facing = Math.PI;
      w.nls[1].x = 18; w.nls[1].y = 8; w.nls[2].x = 18; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player(t: number): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: t === 4, fist: false }; },
    nls(): number[] { return [0, 0, 0, 0]; },
  },
  'combat-dodge': {
    place(w: World) {
      // TERM déjà lancé en arrière : la fenêtre de 2 ticks suffit à sortir de clawRange.
      w.t.x = 11; w.t.y = 12; w.t.facing = 0; w.t.vx = -T_CFG.back; w.t.vy = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 0; n.armTicks = 0; n.stunTicks = 0; });
      w.nls[1].x = 11 + NL_CFG.clawRange - 0.05; w.nls[1].y = 12.35; w.nls[1].facing = Math.PI;
      w.nls[0].x = 16; w.nls[0].y = 8; w.nls[2].x = 16; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player(): TAction { return { fwd: -1, strafe: 0, turn: 0, bolt: false, fist: false }; },
    nls(t: number): number[] { return [0, t === 1 ? 7 : 0, 0, 0]; },
  },
  'combat-fist': {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      w.t.fistCd = 0; w.t.fistCharge = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 20; n.armTicks = 0; n.stunTicks = 0; });
      w.nls[0].x = 9.6; w.nls[0].y = 12.1; w.nls[0].facing = Math.PI;
      w.nls[1].x = 16; w.nls[1].y = 8; w.nls[2].x = 16; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player(t: number): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: t === 2 }; },
    nls(): number[] { return [0, 0, 0, 0]; },
  },
  'combat-shot': {
    place(w: World) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0; w.t.ammo = T_CFG.boltAmmo; w.t.boltCd = 0;
      w.nls.forEach((n) => { n.alive = true; n.cd = 20; n.armTicks = 0; });
      w.nls[0].x = 14; w.nls[0].y = 12.15; w.nls[0].facing = Math.PI;
      w.nls[1].x = 18; w.nls[1].y = 8; w.nls[2].x = 18; w.nls[2].y = 16; w.nls[3].x = 22; w.nls[3].y = 12;
    },
    player(t: number): TAction { return { fwd: 0, strafe: 0, turn: 0, bolt: t === 3, fist: false }; },
    nls(): number[] { return [0, 0, 0, 0]; },
  },
};
const DEMO_CFG = DEMO ? DEMO_SCRIPTS[DEMO] ?? null : null;
function startRound() {
  // le build jouable garde l'armement des griffes (défaut) : il n'est plus celui des mesures b3
  roundNo++; roundOver = false; if (roundNo > 1) seed += 1; // manche suivante : la graine d'après, jamais la même
  w = newWorld(seed, undefined, { propKinds: resolvePropKinds({ propsOn: PROPS_ON, loaded: loadedPropKinds }) }); camYaw = followYaw = w.t.facing; prev = snap();
  if (DEMO_CFG) { DEMO_CFG.place(w); camYaw = followYaw = w.t.facing; prev = snap(); } rec = new Recorder(autoplay ? `autoplay ${autoplay}` : 'joueur'); rng = mulberry32(seed ^ 0x9e3779b9);
  tactic = autoplay ? (POOL[autoplay] ?? UNSEEN[autoplay] ?? POOL.march)() : null;
  lastMatch = null;
  mixerSim = 0; acc = 0;
  nlPrevStun = [0, 0, 0, 0]; nlPrevAction = [0, 0, 0, 0];
  for (const rig of [...nlRigs, termRig]) {
    if (!rig) continue;
    rig.combat = freshMachine();
    rig.kind = 'idle';
    rig.current = null;
    rig.mixer.stopAllAction();
  }
  nlMeshes.forEach(m => { m.rotation.set(0, 0, 0); m.position.y = 0; m.visible = true; });
  (document.getElementById('msg') as HTMLElement).style.display = 'none';
}
function playerAction(): TAction {
  const k = (c: string) => keys.has(c);
  // `e.code` est la touche **physique** : sur un clavier AZERTY, la touche marquée Z est `KeyW`, et celle
  // marquée A est `KeyQ`. Le bandeau annonçait « ZQSD/WASD » depuis le début alors que Z et Q ne faisaient
  // rien : sur un Mac français, avancer et aller à gauche étaient muets. On accepte les deux nomenclatures.
  return { fwd: (k('KeyW') || k('KeyZ') ? 1 : 0) - (k('KeyS') ? 1 : 0), strafe: (k('KeyA') || k('KeyQ') ? 1 : 0) - (k('KeyD') ? 1 : 0), turn: (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0), bolt: k('Space'), fist: k('KeyF') || k('ShiftLeft') };
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
  followYaw += d * FOLLOW_YAW_BLEND; // ~3,5 rad/s : un cran plus cinématique, le monde ne fouette toujours pas
  camYaw = followYaw + pivotA;
  // Vitesse de rotation pour l'inclinaison et le flou : prise au pas de simulation, donc reproductible.
  let dy = camYaw - camYawPrev; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  yawRate = dy / DT;
  const rollTarget = Math.max(-0.050, Math.min(0.050, -yawRate * 0.100));
  rollPrev = roll; roll += (rollTarget - roll) * 0.20;
  camYawPrev = camYaw;
}
// Télégraphe de la griffe. Depuis l'armement côté simulation (2 ticks, `n.armTicks`, actif par défaut depuis
// #19), le signal a une source exacte : le coup tombe dans 200 ms, ce n'est plus « il est dangereux » mais
// « il frappe maintenant ». Deux rideaux, par priorité : l'armement à pleine intensité (binaire, sur le liseré
// de silhouette qui se lit de tous les angles — sur un assaillant dans le dos on ne voit que son dos, pas ses
// yeux), puis la *griffe prête* et proche à 45 %, qui ne crie pas. Une griffe en recharge ne donne rien.
// ?tell=0 coupe le télégraphe (comparaison avant/après, et réglage si ça crie trop).
const TELL_ON = qs.get('tell') !== '0';
const TELL_RANGE = 6.0, TELL_FADE = 1.5, TELL_READY = 0.45; // prêt : allumé jusqu'à 6 m, fondu sur les 1,5 m suivants
function updateTell() {
  for (let i = 0; i < nlRigs.length; i++) {
    const rig = nlRigs[i]; if (!rig) continue;
    const n = w.nls[i];
    const d = Math.hypot(n.x - w.t.x, n.y - w.t.y);
    const ready = n.cd === 0 ? Math.max(0, Math.min(1, (TELL_RANGE + TELL_FADE - d) / TELL_FADE)) * TELL_READY : 0;
    const on = n.armTicks > 0 ? 1 : ready; // l'armement gagne : 200 ms à pleine intensité
    rig.tell.value = TELL_ON && n.alive ? on : 0;
  }
}
function updateRigs() { // gait + timeScale au tick ; l'avance mixer est dans la boucle d'affichage (ou DT en ?shot=)
  const nlWalk = NL_CFG.speed * T_CFG.stunSpeed;
  const nlRun = NL_CFG.speed;
  const flags = eventsToFlags(w.events);
  for (let i = 0; i < nlRigs.length; i++) {
    const rig = nlRigs[i]; if (!rig) continue;
    const n = w.nls[i];
    const speed = n.alive ? Math.hypot(n.x - prev.n[i][0], n.y - prev.n[i][1]) / DT : 0;
    const gait = pickGait(speed, { allowRun: rig.allowRun, walkSpeed: nlWalk, runSpeed: nlRun });
    const intent = nlIntent({
      alive: n.alive, armTicks: n.armTicks, stunTicks: n.stunTicks, prevStun: nlPrevStun[i],
      lastAction: n.lastAction, prevAction: nlPrevAction[i], gait, flags, index: i,
    });
    rig.combat = tickMachine(rig.combat, intent, DT, rig.clipDurations);
    playKind(rig, speed);
    nlPrevStun[i] = n.stunTicks;
    nlPrevAction[i] = n.lastAction;
  }
  if (termRig) {
    const speed = Math.hypot(w.t.vx, w.t.vy);
    const gait = pickGait(speed, { allowRun: termRig.allowRun, walkSpeed: T_CFG.fwd, runSpeed: T_CFG.fwd });
    const intent = termIntent({ gait, fistCharge: w.t.fistCharge, burstLeft: w.t.burstLeft, flags });
    termRig.combat = tickMachine(termRig.combat, intent, DT, termRig.clipDurations);
    playKind(termRig, speed);
  }
  updateTell();
}
// Panoramique d'une source : sa position écran, pas son angle au joueur (à 3 m la caméra voit autrement).
function panOf(x: number, y: number) { const v = new THREE.Vector3(x, 1.3, y).project(camera); return Math.max(-1, Math.min(1, v.x)); }
function tick() {
  prev = snap();
  const ta = DEMO_CFG ? DEMO_CFG.player(w.tick) : tactic ? tactic(w) : playerAction(); rec.record(w, ta);
  const acts = DEMO_CFG ? DEMO_CFG.nls(w.tick, w) : w.nls.map((n, i) => {
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
    // La façade de Honsou : un événement appelle UNE fonction, toutes renvoient true si un son est parti.
    if (e.type === 'step') onStep((e as any).intensity ?? 1);
    // Le pas pousse la caméra à la source : la cadence suit la vitesse par construction, plus de compteur
    // de mètres. Le pied alterne, donc l'amplitude aussi ; le pas d'arrêt (intensity 0) est le plus lourd.
    if (e.type === 'step' && IMPACT) {
      const amp = (e as any).intensity > 0 ? 0.55 + 0.45 * (e as any).intensity : 1.15;
      stepImp.push({ t0: simT, v: -1.95 * amp * ((e as any).foot === 0 ? 1 : 0.94) });
    }
    else if (e.type === 'bolt') onBolterBurst(0.05);
    else if (e.type === 'fistCharge') onFistCharge(0);   // le gantelet s'engage, l'impact tombe 0,8 s plus tard
    else if (e.type === 'fist') onFistImpact(0);
    else if (e.type === 'clawArm') audio.clawArm({ pan: panOf(w.nls[(e as any).who].x, w.nls[(e as any).who].y) });
    else if (e.type === 'claw') { const n = w.nls[(e as any).who]; onHit((e as any).dmg > 0 ? 'claw' : 'armor', panOf(n.x, n.y)); }
    else if (e.type === 'whiff') onHit('miss', panOf(w.nls[(e as any).who].x, w.nls[(e as any).who].y));
    else if (e.type === 'hit' && (e as any).servoAlarm > 0) onServoAlarm(0); // l'armure encaisse : les servos hurlent 1 s
    else if (e.type === 'servoCritical') onServoAlarm(0);                    // une fois par manche, sous 25 % d'armure
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
  const nowMatch = matchStatus(w);
  for (const b of matchBeats(lastMatch, nowMatch)) {
    switch (b.kind) {
      case 'channelStart': floatText(BEACON.x, BEACON.y, 'CANALISATION', '#6f6'); break;
      case 'channelBreak': floatText(w.t.x, w.t.y, 'CANAL COUPÉ', '#fb6'); break;
      case 'lastStand': {
        const last = w.nls.find(n => n.alive);
        if (last) floatText(last.x, last.y, 'DERNIER', '#ffd27a');
        break;
      }
      case 'timePressure': floatText(w.t.x, w.t.y, `${nowMatch.clock}`, '#f88'); break;
      case 'reload': floatText(w.t.x, w.t.y, 'RECHARGE', '#9cf'); break;
      case 'fistCharge': break; // déjà annoncé par l'événement fistCharge
      default: { const _n: never = b.kind; void _n; }
    }
  }
  lastMatch = nowMatch;
  // Lit de servomoteurs : la charge suit la vitesse réelle, 0 = ralenti. Le silence est aussi un son —
  // c'est le contraste entre le ralenti et la charge qui fait entendre la masse.
  const sp = Math.hypot(w.t.vx, w.t.vy);
  if (sp > 0.05) {
    if (!audio.servo.isRunning()) onServoCharge(0); // montée en charge de 5 s, au démarrage seulement
    onServoLoop.start({ load: sp / 2.5 });
    onServoLoop.load(sp / 2.5);
  } else onServoLoop.load(0.1);
  updateRigs(); if (shot) advanceRigs(DT); updateCamYaw();
  if (w.done) endRound();
}
function flash(o: number) { const f = document.getElementById('flash')!; f.style.transition = 'none'; f.style.opacity = String(o); requestAnimationFrame(() => { f.style.transition = 'opacity .25s'; f.style.opacity = '0'; }); }
async function endRound() {
  roundOver = true; onServoLoop.stop({ fade: 0.5 }); if (w.winner === 'pack') score.pack++; else score.term++;
  const msg = document.getElementById('msg')!; msg.style.display = 'block';
  const card = roundCard(w, { roundNo });
  msg.innerHTML = roundMarkup(card) + '<p>La meute étudie ta tactique…</p>';
  if (shot) return;
  try {
    const r = await fetch('/api/round', { method: 'POST', body: JSON.stringify(rec.toJSON(`${w.winner} — ${w.reason}`)) }).then(r => r.json());
    lastSummary = r.summary;
    if (r.ok) { await loadPolicy(); msg.innerHTML += `<p>Ce qu'elle a lu : ${r.summary}.<br>Fantôme appris par imitation sur tes ${r.roundsUsed} dernière(s) manche(s), meute ré-entraînée contre lui (${r.updates} mises à jour PPO, ${r.seconds.toFixed(0)} s).</p>`; }
    else msg.innerHTML += `<p>Ce qu'elle a lu : ${r.summary}.<br>Pas de ré-entraînement : ${r.reason ?? 'échec'}.</p>`;
  } catch { msg.innerHTML += '<p>Serveur local absent : pas de ré-entraînement.</p>'; }
}
async function loadPolicy() {
  try { const j = await fetch('/policy/current.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null); if (j) { actor = j; policyLabel = `politique ${j.version}`; } } catch { /* naïve */ }
}
// Traçabilité brûlée dans l'image : un lecteur doit pouvoir dire, en regardant une capture, quel tick elle
// montre, sur quelle graine et dans quel mode. Sans ça, chaque planche est une affirmation invérifiable — et
// c'est le défaut qu'on reproche aux chiffres sans SHA. Seuls les drapeaux qui s'écartent du défaut sont écrits.
function burnIn() {
  const parts = [`t${w.tick}`, `graine ${seed}`, autoplay ? `autoplay ${autoplay}` : 'joueur', `cam ${CAM_MODE}`];
  if (!TELL_ON) parts.push('tell=0');
  if (!IMPACT) parts.push('impact=0');
  if (DEMO_CFG) parts.push(`demo ${DEMO}`);
  if (qs.get('shot')) parts.push(`shot=${qs.get('shot')}`);
  return parts.join(' · ');
}
function hud() {
  const h = document.getElementById('hud')!;
  h.innerHTML = hudMarkup(matchStatus(w), {
    roundNo, score, demo: !!DEMO_CFG, alarmOn: ALARM_ON,
    servoAlarm: w.t.servoAlarm > 0, servoCritical: w.t.servoCriticalSent,
    policyLine: `${policyLabel}${autoplay ? ` · Terminator en autoplay (${autoplay})` : ''}`,
    burnIn: burnIn(),
  });
  const d = document.getElementById('dbg')!; d.style.display = debug ? 'block' : 'none';
  if (debug) d.innerHTML = `<b>Vue de contrôle — ce que perçoit chaque Night Lord</b><table><tr><th>rôle</th><th>état</th><th>voit</th><th>entend</th><th>vox</th><th>âge</th><th>action (p)</th></tr>`
    + w.nls.map((n, i) => `<tr style="color:${ROLE_CSS[i]}"><td>${ROLES[i]}</td><td>${n.alive ? 'debout' : 'mort'}</td><td>${n.alive && n.belief.seen ? '●' : '·'}</td><td>${n.alive && n.belief.heard ? '●' : '·'}</td><td>${n.alive && n.belief.vox ? '●' : '·'}</td><td>${n.alive && n.belief.valid ? (n.belief.age * DT).toFixed(1) + ' s' : '—'}</td><td>${n.alive ? NL_ACTIONS[lastActs[i]] + (actor ? ` (${lastP[i].toFixed(2)})` : '') : ''}</td></tr>`).join('')
    + `</table>Anneau blanc = portée du bruit du Terminator (${w.t.noise} m). Anneaux colorés = où chaque frère croit qu'il est. Le Terminator perçoit : ${terminatorPerceives(w).map(i => ROLES[i]).join(', ') || 'personne'}.`;
}
// Les impulsions, elles, tombent au pas de simulation : c'est la simulation qui décide qu'un pas est posé et
// qu'une rafale part. Ce qui les met en forme est continu.
function updateImpact(dt: number) {
  simT += dt; breathT += dt; fistT += dt;
  for (let n = recImp.length - 1; n >= 0; n--) if (simT - recImp[n].t0 > FRESH) { recImp.splice(n, 1); pitchImp.splice(n, 1); }
  for (let n = stepImp.length - 1; n >= 0; n--) if (simT - stepImp[n].t0 > FRESH) stepImp.splice(n, 1);
}
function render(alpha: number) {
  const lerp = (a: number, b: number) => a + (b - a) * alpha; const la = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * alpha; };
  const tx = lerp(prev.t[0], w.t.x), ty = lerp(prev.t[1], w.t.y), tf = la(prev.t[2], w.t.facing);
  term.position.set(tx, 0, ty); term.rotation.y = -tf; fistM.position.x = w.t.fistCd > 8 ? 1.2 : 0.55;
  w.nls.forEach((n, i) => {
    const g = nlMeshes[i];
    g.position.set(lerp(prev.n[i][0], n.x), 0, lerp(prev.n[i][1], n.y));
    if (n.alive || nlRigs[i]) g.rotation.y = -la(prev.n[i][2], n.facing);
    else { g.rotation.set(Math.PI / 2, 0, 0); g.position.y = 0.4; }
  });
  hitGlowNL.forEach((l, i) => { l.intensity = 5.5 * (nlRigs[i]?.combat.hitFlash ?? 0); });
  hitGlowT.intensity = 6.5 * (termRig?.combat.hitFlash ?? 0);
  dbgGroup.visible = debug; for (const m of nlMarkers) m.visible = debug;
  if (debug) {
    w.nls.forEach((n, i) => { cones[i].visible = n.alive; cones[i].position.set(n.x, 0.05, n.y); cones[i].rotation.y = -n.facing;
      const b = n.belief; beliefs[i].visible = n.alive && b.valid; beliefs[i].position.set(b.x, 0.08 + i * 0.01, b.y); (beliefs[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - b.age / 50);
      links[i].visible = n.alive && b.valid; links[i].geometry.setFromPoints([new THREE.Vector3(n.x, 0.1, n.y), new THREE.Vector3(b.x, 0.1, b.y)]); links[i].computeLineDistances(); });
    noiseRing.position.set(w.t.x, 0.06, w.t.y); noiseRing.scale.setScalar(w.t.noise); tCone.position.set(w.t.x, 0.04, w.t.y); tCone.rotation.y = -w.t.facing;
  }
  // caméra de couloir : constantes CAM (8,2 m, 3,15 m, FOV 54). Le personnage occupe le tiers bas.
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
    // 8,2 m derrière un Terminator à x≈3 sort de la coque (caméra dans le vide = image noire).
    const cx = Math.min(ARENA.w - 0.6, Math.max(0.6, tx - fx * back));
    const cz = Math.min(ARENA.h - 0.6, Math.max(0.6, ty - fz * back));
    const inPillar = PILLARS.some(b => cx > b.x0 - 0.55 && cx < b.x1 + 0.55 && cz > b.y0 - 0.55 && cz < b.y1 + 0.55);
    const cy = inPillar ? CAM.highMax : high;
    camera.position.set(cx + sx, cy, cz + sz);
    camera.lookAt(tx + fx * CAM.ahead + sx, CAM.eye, ty + fz * CAM.ahead + sz);
  } else {
    // À l'épaule : quatre offsets (respiration, pas, recul, inclinaison). Cadrage EPAULE : 3,4 m derrière.
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
  // clignotement à 2,5 Hz — période de 4 ticks. 8 Hz était au-dessus de ce que la simulation échantillonne
  // (10 ticks/s) : l'intensité sautait d'un tick à l'autre sans dessiner de battement lisible. Mesuré sur six
  // ticks, la courbe ci-contre montre une alternance franche, pas un scintillement aléatoire. La valeur vient de la simulation (`servoAlarm` en ticks),
  // le rendu ne fait que la mettre en forme — rien n'est inventé côté image.
  const alarmGlow = ALARM_ON && w.t.servoAlarm > 0
    ? (w.t.servoAlarm / T_CFG.servoAlarmTicks) * (0.30 + 0.70 * Math.abs(Math.sin(simT * 2 * Math.PI * 2.5)))
    : 0;
  // Une teinte, pas un projecteur. Mesuré en trois essais : 0,9 rendait le Terminator rouge fluo et on ne
  // lisait plus l'armure ni les Night Lords autour ; 0,22 le teintait encore comme un néon ; 0,085 laisse
  // l'albedo intact et fait seulement respirer le rouge des plaques. C'est une alarme, pas une enseigne.
  for (const m of alarmMats) { m.emissive.copy(m.userData.baseEmissive).lerp(ALARM_COLOR, alarmGlow * 0.070); }
  (fistM.material as THREE.MeshStandardMaterial).emissive.setRGB(0.05 * pulse, 0.12 * pulse, 0.62 * pulse);
  // Flou de rotation : 5 prises dans la passe plein écran quand la caméra tourne vite, rien sinon.
  const blur = CAM_MODE === 'epaule' ? Math.max(-0.018, Math.min(0.018, -yawRate * 0.0032)) : 0;
  postMat.uniforms.uBlur.value.set(blur, 0);
  postMat.uniforms.uTime.value = performance.now() * 0.001;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  // Compteurs de la passe principale, relevés **avant** la passe plein écran : `renderer.info` se remet à zéro
  // à chaque `render()`, donc le lire après coup ne compte que le quad final (1 appel, 2 triangles).
  mainCalls = renderer.info.render.calls; mainTris = renderer.info.render.triangles;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
let mainCalls = 0, mainTris = 0;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = CAM_MODE === 'epaule' ? (innerHeight > innerWidth ? EPAULE.fovPortrait : EPAULE.fov) : (innerHeight > innerWidth ? CAM.fovPortrait : CAM.fov); camera.updateProjectionMatrix();
  const s = renderer.getDrawingBufferSize(new THREE.Vector2()); rt.setSize(s.x, s.y); }
addEventListener('resize', resize);

// Les modèles remplacent les proxies. Un échec de chargement laisse la capsule en place : le prototype
// reste jouable sans réseau ni assets.
async function loadModels() {
  const load = async (name: string, target: number, dim = 1, allowRun = true) => {
    const model = await loadModelGLB(name);
    const clips: THREE.AnimationClip[] = [...(model.animations ?? [])];
    for (const k of ['walk', 'run'] as const) { try { const a = await loadGLB(`/web/models/${name}-${k}.glb`); clips.push(...(a.animations ?? [])); } catch { /* clip absent, on garde l'idle de pose */ } }
    for (const file of extraAnimBasenames(name)) {
      try {
        const a = await loadGLB(`/web/models/${file}`);
        clips.push(...(a.animations ?? []).map((c) => remapClip(c)));
      } catch { /* extra absent */ }
    }
    return rigOf(model, clips, target, dim, allowRun);
  };
  await Promise.all(ROLES.map(async (_r, i) => {
    try {
      const rig = await load(`NL-${i + 1}`, NL_HEIGHT, 0.22);
      nlMeshes[i].add(rig.root); nlRigs[i] = rig;
      for (const p of nlProxy.slice(i * 3, i * 3 + 3)) p.visible = false; // capsule + 2 yeux de ce rôle
    } catch (e) { console.warn('modèle NL-' + (i + 1) + ' absent, capsule conservée', e); }
  }));
  try {
    termRig = await load('TERM', TERM_HEIGHT, 0.40, false);
    term.add(termRig.root);
    // Les matériaux de l'armure, pour l'alarme de servo : on garde l'émissif d'origine pour savoir le rendre.
    termRig.root.traverse((o: any) => { const m = o.material; if (m && m.emissive) { if (!m.userData.baseEmissive) m.userData.baseEmissive = m.emissive.clone(); alarmMats.push(m); } });
    for (const c of term.children) if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).visible = false;
  } catch (e) { console.warn('modèle TERM absent, cubes conservés', e); }
}

if (debug) buildLabels();
// Sonde de budget : `?debug=1` expose les compteurs de `renderer.info` (appels, triangles, lumières, textures).
// C'est la seule mesure de coût de rendu qu'on puisse prendre sans GPU — pas une sonde jetable, elle reste.
if (debug) (window as any).__SC = () => { let lights = 0; scene.traverse(o => { if ((o as any).isLight) lights++; });
  return { calls: mainCalls, tris: mainTris, lights, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0, props: { ...propStats } }; };
await Promise.all([
  loadPolicy(), loadModels(), loadProps(),
  // capture `?shot=` : pas de fetch audio (sinon 404 console sur le manifeste hors dépôt)
  shot ? Promise.resolve() : initAudio({ base: '/web/sfx/nightlords/', manifest: 'manifest.json' }),
]);
// Onglet en arrière-plan : le module suspend le contexte, et ne le reprend au retour que s'il tournait.
audio.attachLifecycle();
resize(); startRound();
// ---- sonde temporaire (retirée avant commit)
if (Number(qs.get('hitscan') ?? 0)) {
  const out: any[] = []; const base = seed; const n = Number(qs.get('hitscan'));
  for (let k = 0; k < n; k++) {
    seed = base + k; startRound(); let got: any = null;
    while (w.tick < 400 && !w.done) { tick(); const h = w.events.find((e: any) => e.type === 'hit'); if (h) { got = { seed, tick: w.tick, dmg: h.dmg, zone: h.zone, hpAfter: h.hpAfter, alarm: h.servoAlarm }; break; } }
    if (got) out.push(got); roundOver = true;
  }
  (window as any).__hits = out; document.title = 'HITS';
}
if (shot) { // capture : on avance la sim de N ticks sans attendre le temps réel, puis on rend une image
  while (w.tick < shot && !w.done) tick();
  hitstop = 0; shake = 0; prev = snap(); hud(); render(1);
  document.title = 'READY';
} else {
  let last = performance.now();
  const loop = (now: number) => {
    let dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (hitstop > 0) { hitstop -= dt; dt = 0; }
    if (!paused && !roundOver) { acc += dt; while (acc >= DT) { acc -= DT; tick(); if (roundOver) break; } }
    if (!shot && !paused) {
      const alpha = roundOver ? 1 : acc / DT;
      const displaySim = Math.max(0, simT - DT + alpha * DT);
      const step = displayMixerDelta(dt, mixerSim, displaySim);
      if (step > 0) { advanceRigs(step); mixerSim += step; }
    }
    // Ambiance : au plus une publication par tick, et seulement si `?control=1`. Le HUD, lui, ne lit rien
    // d'ici : aucune donnée du canal ne touche le DOM du joueur.
    if (CONTROL_VIEW && w.tick !== publishedTick) { publishHunterState(hunterState(w)); publishedTick = w.tick; }
    shake *= 0.85; if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
    hud(); render(roundOver ? 1 : acc / DT); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
