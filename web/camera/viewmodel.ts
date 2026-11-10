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

const VM_FOV = 50;

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

export function createViewmodel(): Viewmodel {
  const scene = new THREE.Scene();
  scene.fog = null;
  const camera = new THREE.PerspectiveCamera(VM_FOV, 1, 0.02, 3);
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.AmbientLight(0x8899aa, 0.55));
  const key = new THREE.DirectionalLight(0xffe6c0, 1.15);
  key.position.set(0.4, 0.8, 0.6);
  scene.add(key);

  const steel = new THREE.MeshStandardMaterial({
    color: 0x3a3428, metalness: 0.72, roughness: 0.38,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1a1612, metalness: 0.55, roughness: 0.5,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0x8a6a32, metalness: 0.8, roughness: 0.35,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc4a262, metalness: 0.7, roughness: 0.4,
  });
  const fistMat = new THREE.MeshStandardMaterial({
    color: 0x2a3348, metalness: 0.65, roughness: 0.32, emissive: 0x112266, emissiveIntensity: 0.45,
  });

  const bolter = new THREE.Group();
  box(bolter, 0.09, 0.11, 0.28, steel, 0, 0, 0);
  box(bolter, 0.05, 0.05, 0.38, dark, 0.01, 0.03, -0.22);
  box(bolter, 0.035, 0.035, 0.12, brass, 0.01, 0.03, -0.42);
  box(bolter, 0.07, 0.16, 0.08, dark, 0, -0.1, 0.04);
  box(bolter, 0.04, 0.04, 0.12, gold, 0, 0.08, 0.02);
  box(bolter, 0.12, 0.04, 0.08, steel, 0, -0.02, 0.12);
  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0, depthTest: false }),
  );
  muzzleFlash.position.set(0.01, 0.03, -0.52);
  bolter.add(muzzleFlash);
  const muzzle = new THREE.PointLight(0xffd8a8, 0, 1.6, 2);
  muzzle.position.set(0.01, 0.03, -0.5);
  bolter.add(muzzle);
  bolter.position.set(0.24, -0.12, -0.44);
  bolter.rotation.set(0.08, 0.18, 0.06);
  bolter.scale.setScalar(1.55);
  root.add(bolter);

  const fist = new THREE.Group();
  box(fist, 0.16, 0.16, 0.18, fistMat, 0, 0, 0);
  box(fist, 0.18, 0.05, 0.08, steel, 0, 0.08, -0.04);
  for (let k = 0; k < 4; k++) {
    box(fist, 0.03, 0.09, 0.04, dark, -0.06 + k * 0.04, 0.02, -0.1);
  }
  box(fist, 0.08, 0.22, 0.08, steel, 0, -0.16, 0.04);
  fist.position.set(-0.26, -0.14, -0.38);
  fist.rotation.set(0.28, -0.2, -0.12);
  fist.scale.setScalar(1.45);
  root.add(fist);

  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -2.2)]),
    new THREE.LineBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0, depthTest: false }),
  );
  tracer.position.set(0.23, -0.18, -0.9);
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
    bolter.position.z = -0.42 + recZ * 2.2;
    bolter.rotation.x = 0.04 + recZ * 3.2;
    (muzzleFlash.material as THREE.MeshBasicMaterial).opacity = fireT * fireT;
    muzzleFlash.scale.setScalar(0.6 + fireT * 1.8);
    muzzle.intensity = 18 * fireT * fireT;
    (tracer.material as THREE.LineBasicMaterial).opacity = fireT * 0.85;
    const pull = wind * 0.16;
    const punch = strike * 0.22;
    fist.position.set(-0.26 - wind * 0.05, -0.14 + pull * 0.1, -0.38 + punch - pull);
    fist.rotation.x = 0.18 - wind * 0.45 + strike * 0.55;
    (fistMat).emissiveIntensity = 0.45 + wind * 0.8 + strike * 1.4;
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
