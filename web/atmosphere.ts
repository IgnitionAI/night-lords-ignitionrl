// Ambiance du couloir : fog, exposition, lumières rares, cadrage. Rien ici ne touche la simulation.
// Les deux directionnelles d'avant (clé 0,85 + rim 1,1 depuis 50 m, exposition 1,6) éclairaient
// comme un studio Genex : les NL se lisaient en volume, pas en liseré. On garde le projecteur du
// Terminator comme seule vraie clé, et un remplissage froid/rasant trop faible pour peindre les faces.
import * as THREE from 'three';

export const FOG_COLOR = 0x0a0c12;
export const FOG_EXP2_DENSITY = 0.060;
export const FOG_LINEAR_NEAR = 6;
export const FOG_LINEAR_FAR = 30;
export const TONE_MAPPING_EXPOSURE = 1.34;

// P1 : 8,2 m derrière, FOV un cran plus serré (58 → 54). Un NL reste ~100 px, le plateau moins « maquette ».
export const CAM = { back: 8.2, height: 3.28, highMax: 4.9, ahead: 2.8, eye: 1.18, fov: 54, fovPortrait: 64 };
// Épaule : FOV 62 → 56 (moins de grand-angle), 2,32 m d'œil, look 4,6 m. Le Terminator tient le tiers bas-gauche.
export const EPAULE = { back: 3.4, side: 1.18, height: 2.32, ahead: 4.6, eye: 1.32, fov: 56, fovPortrait: 68 };
export const FOLLOW_YAW_BLEND = 0.22; // était 0,26 : un peu plus d'inertie, toujours ~3,5 rad/s
export const POST_VIGNETTE = 1.00;
export const POST_GRAIN = 0.014; // grain film, linéaire ; un dither 1,5/255 est ajouté après le gamma dans le shader

export const AMBIENT = { color: 0x12161c, intensity: 0.16 };
export const HEMI = { sky: 0x1a2740, ground: 0x0a0908, intensity: 0.26 };
export const RAKE = { color: 0x6a86b4, intensity: 0.32, x: 22, y: 5.4, z: -10 };
export const RIM = { color: 0x334a72, intensity: 0.32, x: -8, y: 3.8, z: 20 };
export const POOL = { color: 0x5e7aa3, intensity: 4.6, distance: 12, decay: 2, x: 20, y: 5.5 };
export const LAMP = { color: 0xff2a1a, intensity: 8.2, distance: 9, decay: 2 };
export const STRIP_EMISSIVE = 0.48;
export const SPOT_SHADOW_MAP = 1024;

// Finish Terminator (couloir sombre) : le GLB Genex porte un `BakedMaterial` et une carte
// metallicRoughness dummy orange (B≈5/255 → métal 0,02). Le chargeur générique faisait
// encore `metalness *= 0,3` et `roughness ≥ 0,72` : l'armure lisait comme un MeshStandard
// plastique. Constantes calées sur l'expo 1,34 / rake 0,32 — pas un studio.
export const TERM_LOOK = {
  albedoDim: 0.78,
  warmth: { r: 1.04, g: 0.97, b: 0.86 },
  metalness: 0.72,
  roughness: 0.40,
  dummyMetalMax: 0.08,
  dummyRoughMin: 0.35,
  visor: { r: 1.65, g: 0.05, b: 0.016, gain: 2.4, lumMax: 0.01 },
  rim: { r: 0.52, g: 0.38, b: 0.16, pow: 4.2, amt: 0.40 },
};

export function applyRendererAtmosphere(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.dithering = true; // fog + ACES sur un sol sombre bande en 8 bits (SwiftShader)
}

export function applySceneAtmosphere(scene: THREE.Scene, fogMode: string): void {
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = fogMode === 'linear'
    ? new THREE.Fog(FOG_COLOR, FOG_LINEAR_NEAR, FOG_LINEAR_FAR)
    : new THREE.FogExp2(FOG_COLOR, FOG_EXP2_DENSITY);
}

export function installCorridorLights(scene: THREE.Scene, beaconY: number): THREE.PointLight {
  scene.add(new THREE.AmbientLight(AMBIENT.color, AMBIENT.intensity));
  scene.add(new THREE.HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity));
  const rake = new THREE.DirectionalLight(RAKE.color, RAKE.intensity);
  rake.position.set(RAKE.x, RAKE.y, RAKE.z);
  scene.add(rake);
  const rim = new THREE.DirectionalLight(RIM.color, RIM.intensity);
  rim.position.set(RIM.x, RIM.y, RIM.z);
  scene.add(rim);
  const pool = new THREE.PointLight(POOL.color, POOL.intensity, POOL.distance, POOL.decay);
  pool.position.set(POOL.x, POOL.y, beaconY);
  scene.add(pool);
  return pool;
}

export function configureHunterSpot(spot: THREE.SpotLight, far: number): void {
  spot.castShadow = true;
  spot.shadow.mapSize.set(SPOT_SHADOW_MAP, SPOT_SHADOW_MAP);
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.03;
  spot.shadow.camera.near = 0.4;
  spot.shadow.camera.far = far;
}
