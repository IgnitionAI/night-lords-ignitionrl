// Armes en premier plan (storm bolter + gantelet). Scène séparée, profondeur vidée
// pour que le canon ne traverse pas les piliers. Cues #72 : anticipation / impact / fire.
import * as THREE from 'three';
import type { AnimCue } from '../anim-cues';

export interface Viewmodel {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  root: THREE.Group;
  bolter: THREE.Group;
  fist: THREE.Group;
  muzzle: THREE.PointLight;
  tracer: THREE.Line;
  ingestCue(cue: AnimCue): void;
  ingestSim(ev: { type: string }): void;
  update(dt: number, now: number, bobX: number, bobY: number, moving: boolean): void;
  dispose(): void;
}

const VM_FOV = 52;

function box(
  g: THREE.Group, w: number, h: number, d: number,
  mat: THREE.Material, x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  m.receiveShadow = false;
  g.add(m);
  return m;
}

function ph(
  color: number,
  opts: { spec?: number; shine?: number; em?: number; ei?: number } = {},
): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color,
    specular: opts.spec ?? 0x667788,
    shininess: opts.shine ?? 28,
    emissive: opts.em ?? 0x000000,
    emissiveIntensity: opts.ei ?? 0,
  });
}

export function createViewmodel(): Viewmodel {
  const scene = new THREE.Scene();
  scene.fog = null;
  const camera = new THREE.PerspectiveCamera(VM_FOV, 1, 0.05, 3);
  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.AmbientLight(0xb8c4d8, 1.15));
  const key = new THREE.DirectionalLight(0xffe4c0, 1.85);
  key.position.set(0.45, 0.7, 1.0);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7a94b8, 0.85);
  fill.position.set(-0.7, 0.15, 0.8);
  scene.add(fill);

  const steel = ph(0x5a5348, { spec: 0x99a8b8, shine: 36, em: 0x1a1814, ei: 0.28 });
  const dark = ph(0x24201c, { spec: 0x556677, shine: 24, em: 0x0c0a08, ei: 0.2 });
  const brass = ph(0xc49a42, { spec: 0xffe8b0, shine: 52, em: 0x5a3c10, ei: 0.55 });
  const gold = ph(0xe0bc6a, { spec: 0xfff0c8, shine: 46, em: 0x5a4418, ei: 0.4 });
  const fistMat = ph(0x3a455c, { spec: 0x88aadd, shine: 32, em: 0x1c3c90, ei: 0.7 });
  const plate = ph(0x4a5368, { spec: 0x99bbdd, shine: 28, em: 0x121820, ei: 0.25 });
  const energyMat = new THREE.MeshPhongMaterial({
    color: 0x4ec8ff, emissive: 0x2288ff, emissiveIntensity: 0.9,
    transparent: true, opacity: 0.55, depthWrite: false, shininess: 12,
  });

  const bolter = new THREE.Group();
  bolter.name = 'storm-bolter';
  box(bolter, 0.10, 0.085, 0.22, steel, 0, 0.01, 0.02);
  box(bolter, 0.08, 0.06, 0.08, dark, 0, 0.0, 0.14);
  box(bolter, 0.035, 0.02, 0.18, brass, 0, 0.055, -0.02);
  box(bolter, 0.03, 0.025, 0.07, gold, 0.048, 0.02, 0.02);
  box(bolter, 0.032, 0.032, 0.34, dark, -0.022, 0.02, -0.20);
  box(bolter, 0.032, 0.032, 0.34, dark, 0.022, 0.02, -0.20);
  box(bolter, 0.04, 0.04, 0.05, brass, -0.022, 0.02, -0.38);
  box(bolter, 0.04, 0.04, 0.05, brass, 0.022, 0.02, -0.38);
  box(bolter, 0.07, 0.04, 0.07, steel, 0, -0.055, 0.03);
  box(bolter, 0.055, 0.12, 0.065, dark, 0, -0.12, 0.03);
  box(bolter, 0.05, 0.02, 0.05, brass, 0, -0.185, 0.03);
  box(bolter, 0.035, 0.09, 0.04, dark, 0.015, -0.09, 0.10);
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0, depthTest: false }),
  );
  muzzleFlash.position.set(0, 0.02, -0.42);
  bolter.add(muzzleFlash);
  const muzzle = new THREE.PointLight(0xffd8a8, 0, 1.2, 2);
  muzzle.position.set(0, 0.02, -0.40);
  bolter.add(muzzle);
  const bolterLamp = new THREE.PointLight(0xffe0b0, 1.35, 1.6, 1.6);
  bolterLamp.position.set(0.04, 0.10, 0.06);
  bolter.add(bolterLamp);
  bolter.position.set(0.22, -0.14, -0.52);
  bolter.rotation.set(0.12, 0.28, 0.04);
  bolter.scale.setScalar(1.28);
  root.add(bolter);

  const fist = new THREE.Group();
  fist.name = 'power-fist';
  box(fist, 0.09, 0.20, 0.09, plate, 0, -0.16, 0.05);
  box(fist, 0.10, 0.03, 0.10, brass, 0, -0.055, 0.05);
  box(fist, 0.14, 0.08, 0.12, fistMat, 0, 0.02, 0.02);
  box(fist, 0.145, 0.025, 0.04, brass, 0, 0.055, -0.01);
  const fingerXs = [-0.052, -0.018, 0.016, 0.050];
  for (const fx of fingerXs) {
    box(fist, 0.028, 0.034, 0.07, fistMat, fx, 0.03, -0.08);
    box(fist, 0.024, 0.028, 0.055, dark, fx, 0.028, -0.13);
    box(fist, 0.018, 0.022, 0.03, brass, fx, 0.024, -0.165);
    box(fist, 0.032, 0.038, 0.08, energyMat, fx, 0.03, -0.11);
  }
  box(fist, 0.03, 0.04, 0.06, fistMat, -0.085, -0.01, -0.02);
  box(fist, 0.024, 0.03, 0.05, dark, -0.10, 0.01, -0.07);
  const fistLamp = new THREE.PointLight(0x6aa8ff, 1.05, 1.3, 1.5);
  fistLamp.position.set(-0.02, 0.08, 0.08);
  fist.add(fistLamp);
  fist.position.set(-0.26, -0.12, -0.50);
  fist.rotation.set(0.55, -0.55, -0.18);
  fist.scale.setScalar(1.32);
  root.add(fist);

  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2.2)]),
    new THREE.LineBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0, depthTest: false }),
  );
  tracer.position.set(0.20, -0.12, -0.92);
  root.add(tracer);

  let recZ = 0;
  let recX = 0;
  let fireT = 0;
  let wind = 0;
  let strike = 0;
  let idle = 0;

  const ingestCue = (cue: AnimCue) => {
    if (cue.role !== 'TERM') return;
    if (cue.kind === 'fire') {
      recZ = 0.055;
      recX = 0.012;
      fireT = 1;
    }
    if (cue.kind === 'anticipation' && cue.clip.includes('punch')) wind = 1;
    if (cue.kind === 'impact' && cue.clip.includes('punch')) {
      wind = 0;
      strike = 1;
    }
  };

  const ingestSim = (ev: { type: string }) => {
    if (ev.type === 'bolt') {
      recZ = Math.max(recZ, 0.048);
      recX = Math.max(recX, 0.01);
      fireT = 1;
    }
    if (ev.type === 'fistCharge') wind = 1;
    if (ev.type === 'fist') {
      wind = 0;
      strike = 1;
    }
  };

  const update = (dt: number, now: number, bobX: number, bobY: number, moving: boolean) => {
    idle += dt;
    recZ *= Math.exp(-dt * 14);
    recX *= Math.exp(-dt * 12);
    fireT = Math.max(0, fireT - dt / 0.075);
    wind = Math.max(0, wind - dt / 0.55);
    strike = Math.max(0, strike - dt / 0.16);
    const sway = moving ? 1 : 0.45;
    const sx = Math.sin(idle * 1.35) * 0.008 * sway + bobX * 0.35;
    const sy = Math.sin(idle * 1.05) * 0.006 * sway + bobY * 0.55;
    root.position.set(sx, sy, recZ);
    root.rotation.z = recX * 4 + bobX * 0.15;
    bolter.position.z = -0.50 + recZ * 2.2;
    bolter.rotation.x = 0.10 + recZ * 3.2;
    (muzzleFlash.material as THREE.MeshBasicMaterial).opacity = fireT * fireT;
    muzzleFlash.scale.setScalar(0.6 + fireT * 1.8);
    muzzle.intensity = 14 * fireT * fireT;
    (tracer.material as THREE.LineBasicMaterial).opacity = fireT * 0.85;
    const pull = wind * 0.16;
    const punch = strike * 0.22;
    fist.position.set(-0.26 - wind * 0.04, -0.12 + pull * 0.08, -0.50 + punch - pull);
    fist.rotation.x = 0.55 - wind * 0.32 + strike * 0.45;
    fistMat.emissiveIntensity = 0.7 + wind * 1.1 + strike * 1.4;
    energyMat.emissiveIntensity = 0.9 + wind * 1.3 + strike * 0.8;
    energyMat.opacity = 0.5 + wind * 0.35 + strike * 0.2;
    fistLamp.intensity = 1.05 + wind * 1.6 + strike * 1.2;
    void now;
  };

  return {
    scene, camera, root, bolter, fist, muzzle, tracer,
    ingestCue, ingestSim, update,
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}

export function renderViewmodel(
  renderer: THREE.WebGLRenderer,
  vm: Viewmodel,
  aspect: number,
): void {
  vm.camera.aspect = aspect;
  vm.camera.updateProjectionMatrix();
  const prev = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(vm.scene, vm.camera);
  renderer.autoClear = prev;
}
