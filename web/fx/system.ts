// Système VFX GPU-léger : un nuage de points, des instances (traçants, douilles, décals),
// quatre rubans, une onde, une lumière d'impact partagée. Conçu pour SwiftShader CPU.
import * as THREE from 'three';
import { FX_BUDGET, type FxQuality } from './quality';
import {
  HITSTOP_S, SHAKE_AMP, advanceFeel, freshFeel, punchFeel, shakeOffset, simDelta, type FeelState,
} from './feel';
import { eventsToFxPulses, type FxPulse } from './events';
import type { Ev } from '../../src/sim';

const MUZZLE_LOCAL = new THREE.Vector3(1.9, 1.55, 0.55);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _z = new THREE.Vector3(0, 0, 1);
const _col = new THREE.Color();

const enum PKind { Spark, Smoke, Dust, Ember, Blood, Oil, Debris }

interface Particle {
  live: boolean;
  kind: PKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  max: number;
  size: number;
  r: number; g: number; b: number; a: number;
}

interface Tracer { live: boolean; life: number; max: number }
interface Casing {
  live: boolean; life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
}
interface Decal {
  live: boolean; life: number; max: number;
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  sx: number; sy: number; sz: number;
  r: number; g: number; b: number;
}

export interface FxWorldView {
  t: { x: number; y: number; facing: number; hp: number; servoAlarm: number; servoCriticalSent: boolean };
  nls: readonly { x: number; y: number; facing: number; alive: boolean; armTicks: number }[];
  events: readonly Ev[];
}

export interface FxSystem {
  quality: FxQuality;
  feel: FeelState;
  ingestWorld(w: FxWorldView): void;
  advance(dt: number, now: number, armorFrac: number): void;
  sync(w: FxWorldView, term: THREE.Object3D, nls: THREE.Object3D[]): void;
  applyPost(u: {
    uBloom: { value: number };
    uCA: { value: number };
    uVignettePulse: { value: number };
  }): void;
  shakeOffset(): { sx: number; sz: number };
  simDelta(wallDt: number): number;
  pulseAlarm(strip: THREE.MeshStandardMaterial, lamps: THREE.PointLight[], now: number, base: number): void;
  bindEyes(mats: THREE.Material[][]): void;
  resetRound(): void;
  dispose(): void;
}

function allocParticles(n: number): Particle[] {
  const a: Particle[] = [];
  for (let i = 0; i < n; i++) {
    a.push({
      live: false, kind: PKind.Spark, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: 0, max: 1, size: 1, r: 1, g: 1, b: 1, a: 1,
    });
  }
  return a;
}

export function createFxSystem(scene: THREE.Scene, quality: FxQuality): FxSystem {
  const budget = FX_BUDGET[quality];
  const high = quality === 'high';
  const feel = freshFeel(high ? 0.20 : 0);
  const rng = (s: number) => {
    const x = Math.sin(s * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  const parts = allocParticles(budget.particles);
  const posArr = new Float32Array(Math.max(1, budget.particles) * 3);
  const colArr = new Float32Array(Math.max(1, budget.particles) * 3);
  const sizeArr = new Float32Array(Math.max(1, budget.particles));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  pGeo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));
  const sparkCanvas = document.createElement('canvas');
  sparkCanvas.width = sparkCanvas.height = 32;
  const sg = sparkCanvas.getContext('2d')!;
  const grd = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,220,160,0.75)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 32, 32);
  const sparkMap = new THREE.CanvasTexture(sparkCanvas);
  sparkMap.colorSpace = THREE.SRGBColorSpace;
  const pMat = new THREE.PointsMaterial({
    size: 0.28, vertexColors: true, transparent: true, opacity: 0.95, map: sparkMap,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.visible = budget.particles > 0;
  scene.add(points);

  const darkPos = new Float32Array(Math.max(1, budget.particles) * 3);
  const darkCol = new Float32Array(Math.max(1, budget.particles) * 3);
  const darkSize = new Float32Array(Math.max(1, budget.particles));
  const darkGeo = new THREE.BufferGeometry();
  darkGeo.setAttribute('position', new THREE.BufferAttribute(darkPos, 3));
  darkGeo.setAttribute('color', new THREE.BufferAttribute(darkCol, 3));
  darkGeo.setAttribute('size', new THREE.BufferAttribute(darkSize, 1));
  const darkCanvas = document.createElement('canvas');
  darkCanvas.width = darkCanvas.height = 32;
  const dg = darkCanvas.getContext('2d')!;
  const dgrd = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  dgrd.addColorStop(0, 'rgba(90,8,10,1)');
  dgrd.addColorStop(0.45, 'rgba(20,8,6,0.85)');
  dgrd.addColorStop(1, 'rgba(0,0,0,0)');
  dg.fillStyle = dgrd;
  dg.fillRect(0, 0, 32, 32);
  const darkMap = new THREE.CanvasTexture(darkCanvas);
  const dMat = new THREE.PointsMaterial({
    size: 0.72, vertexColors: true, transparent: true, opacity: 0.96, map: darkMap,
    depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true,
  });
  const darkPoints = new THREE.Points(darkGeo, dMat);
  darkPoints.frustumCulled = false;
  darkPoints.visible = budget.particles > 0;
  scene.add(darkPoints);
  const eyeOut = [0, 0, 0, 0];

  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffc878, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracersMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, Math.max(1, budget.tracers));
  tracersMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tracersMesh.frustumCulled = false;
  scene.add(tracersMesh);
  const tracers: Tracer[] = Array.from({ length: budget.tracers }, () => ({ live: false, life: 0, max: 0.08 }));
  const tracerEnds: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[] =
    tracers.map(() => ({ x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 }));

  const casingGeo = new THREE.BoxGeometry(0.05, 0.018, 0.018);
  const casingMat = new THREE.MeshStandardMaterial({ color: 0xc4a15a, metalness: 0.85, roughness: 0.35 });
  const casingsMesh = new THREE.InstancedMesh(casingGeo, casingMat, Math.max(1, budget.casings));
  casingsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  casingsMesh.castShadow = false;
  scene.add(casingsMesh);
  const casings: Casing[] = Array.from({ length: budget.casings }, () => ({
    live: false, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0,
  }));

  const decalGeo = new THREE.PlaneGeometry(1, 1);
  const decalMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
  });
  const decalsMesh = new THREE.InstancedMesh(decalGeo, decalMat, Math.max(1, budget.decals));
  decalsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(decalsMesh);
  const decals: Decal[] = Array.from({ length: budget.decals }, () => ({
    live: false, life: 0, max: 6, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1,
    sx: 0.35, sy: 0.35, sz: 1, r: 0.12, g: 0.08, b: 0.06,
  }));
  const decalColors = new Float32Array(Math.max(1, budget.decals) * 3);
  decalsMesh.instanceColor = new THREE.InstancedBufferAttribute(decalColors, 3);

  const ribbonN = 9;
  const ribbons: { geo: THREE.BufferGeometry; mesh: THREE.Mesh; pos: Float32Array; life: number; who: number }[] = [];
  for (let i = 0; i < budget.ribbons; i++) {
    const pos = new Float32Array(ribbonN * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx: number[] = [];
    for (let s = 0; s < ribbonN - 1; s++) {
      const a = s * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6ae8ff, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    ribbons.push({ geo, mesh, pos, life: 0, who: i });
  }

  const waveGeo = new THREE.RingGeometry(0.35, 0.55, 28);
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0xc8d4ff, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const wave = new THREE.Mesh(waveGeo, waveMat);
  wave.rotation.x = -Math.PI / 2;
  wave.visible = false;
  scene.add(wave);
  let waveT = 0;

  const impactLight = new THREE.PointLight(0xffaa77, 0, 6.5, 2);
  if (high) scene.add(impactLight);

  const arcGroup = new THREE.Group();
  scene.add(arcGroup);
  const arcLines: THREE.Line[] = [];
  for (let i = 0; i < (high ? 5 : 0); i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const ln = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0x9cf4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    arcGroup.add(ln);
    arcLines.push(ln);
  }
  let arcLife = 0;

  let eyeMats: THREE.Material[][] = [];
  let seed = 1;

  function takeParticle(): Particle | null {
    for (const p of parts) {
      if (!p.live && p.kind !== PKind.Dust && p.kind !== PKind.Ember) return p;
    }
    for (const p of parts) if (!p.live) return p;
    let worst: Particle | null = null;
    for (const p of parts) {
      if (p.kind === PKind.Dust || p.kind === PKind.Ember) continue;
      if (!worst || p.life < worst.life) worst = p;
    }
    return worst ?? parts[0] ?? null;
  }

  function burst(
    kind: PKind, x: number, y: number, z: number, n: number,
    speed: number, col: [number, number, number], size: number, life: number, up = 0.4,
  ) {
    if (!high) return;
    for (let i = 0; i < n; i++) {
      const p = takeParticle();
      if (!p) return;
      seed += 1;
      const a = rng(seed) * Math.PI * 2;
      const e = rng(seed + 3);
      p.live = true;
      p.kind = kind;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * speed * (0.3 + e);
      p.vz = Math.sin(a) * speed * (0.3 + rng(seed + 1));
      p.vy = up * speed * (0.2 + rng(seed + 2));
      p.life = life * (0.7 + 0.3 * rng(seed + 4));
      p.max = p.life;
      p.size = size;
      p.r = col[0]; p.g = col[1]; p.b = col[2]; p.a = 1;
    }
  }

  function spawnCasing(x: number, y: number, z: number, facing: number) {
    if (budget.casings === 0) return;
    let slot = casings.find((c) => !c.live) ?? casings[0];
    if (!slot) return;
    const side = facing + Math.PI / 2;
    seed += 1;
    slot.live = true;
    slot.life = 1.4;
    slot.x = x; slot.y = y; slot.z = z;
    slot.vx = Math.cos(side) * (1.8 + rng(seed) * 0.7) + Math.cos(facing) * -0.2;
    slot.vz = Math.sin(side) * (1.8 + rng(seed + 1) * 0.7);
    slot.vy = 1.6 + rng(seed + 2) * 0.6;
    slot.rx = rng(seed + 3) * 12;
    slot.ry = rng(seed + 4) * 8;
    slot.rz = rng(seed + 5) * 10;
  }

  function spawnDecal(
    x: number, y: number, z: number, nx: number, ny: number, nz: number,
    sx: number, sy: number, rgb: [number, number, number], life: number,
  ) {
    if (budget.decals === 0) return;
    let slot = decals.find((d) => !d.live) ?? decals[0];
    if (!slot) return;
    slot.live = true;
    slot.life = life; slot.max = life;
    slot.x = x + nx * 0.03; slot.y = y + ny * 0.03; slot.z = z + nz * 0.03;
    _v.set(nx, ny, nz).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v);
    slot.qx = _q.x; slot.qy = _q.y; slot.qz = _q.z; slot.qw = _q.w;
    slot.sx = sx; slot.sy = sy; slot.sz = 1;
    slot.r = rgb[0]; slot.g = rgb[1]; slot.b = rgb[2];
  }

  function spawnTracer(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    if (budget.tracers === 0) return;
    let i = tracers.findIndex((t) => !t.live);
    if (i < 0) i = 0;
    const t = tracers[i];
    const e = tracerEnds[i];
    if (!t || !e) return;
    t.live = true; t.life = 0.16; t.max = 0.16;
    e.x0 = x0; e.y0 = y0; e.z0 = z0; e.x1 = x1; e.y1 = y1; e.z1 = z1;
  }

  function lightPunch(x: number, y: number, z: number, color: number, intensity: number) {
    if (!high) return;
    impactLight.color.setHex(color);
    impactLight.position.set(x, y, z);
    impactLight.intensity = Math.max(impactLight.intensity, intensity);
  }

  function sparkArcs(x: number, y: number, z: number) {
    if (!high) return;
    arcLife = 0.12;
    for (const ln of arcLines) {
      seed += 1;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        pts.push(new THREE.Vector3(
          x + (rng(seed + k) - 0.5) * 0.7,
          y + 0.4 + rng(seed + k + 3) * 1.1,
          z + (rng(seed + k + 6) - 0.5) * 0.7,
        ));
      }
      ln.geometry.setFromPoints(pts);
      (ln.material as THREE.LineBasicMaterial).opacity = 0.9;
    }
  }

  function applyPulse(p: FxPulse, facing: number) {
    const y = 1.45;
    switch (p.kind) {
      case 'bolt': {
        const mz = muzzleWorld(p.x, p.y, facing);
        spawnTracer(mz.x, mz.y, mz.z, p.tx, 1.25, p.ty);
        spawnCasing(mz.x, mz.y - 0.05, mz.z, facing);
        if (high) burst(PKind.Spark, mz.x, mz.y, mz.z, 6, 2.4, [1, 0.82, 0.45], 0.09, 0.09, 0.2);
        punchFeel(feel, 0, SHAKE_AMP.bolt, p.tx - p.x, p.ty - p.y, false);
        break;
      }
      case 'boltImpact': {
        burst(PKind.Spark, p.x, y, p.y, 18, 4.2, [1, 0.78, 0.32], 0.13, 0.38, 1.2);
        burst(PKind.Debris, p.x, y, p.y, 8, 2.6, [0.18, 0.16, 0.14], 0.08, 0.55, 0.8);
        burst(PKind.Smoke, p.x, y, p.y, 6, 0.55, [0.22, 0.2, 0.18], 0.28, 0.7, 0.9);
        lightPunch(p.x, y, p.y, 0xffb060, 11);
        if (p.wall) {
          spawnDecal(p.x, y, p.y, p.nx, 0, p.ny, 0.55, 0.4, [0.16, 0.1, 0.07], 8);
          spawnDecal(p.x, 0.03, p.y, 0, 1, 0, 0.7, 0.5, [0.12, 0.1, 0.08], 5);
        }
        break;
      }
      case 'boltKill': {
        burst(PKind.Spark, p.x, y, p.y, 7, 3.6, [1, 0.62, 0.28], 0.1, 0.28, 1.1);
        burst(PKind.Smoke, p.x, y, p.y, 4, 0.45, [0.18, 0.16, 0.14], 0.28, 0.7, 0.7);
        lightPunch(p.x, y, p.y, 0xff7744, 7);
        punchFeel(feel, HITSTOP_S.boltKill, SHAKE_AMP.boltKill, p.x - p.tx, p.y - p.ty, true);
        break;
      }
      case 'fist': {
        wave.visible = true;
        wave.position.set(p.x, 0.05, p.y);
        waveT = 0.38;
        burst(PKind.Dust, p.x, 0.2, p.y, 18, 2.8, [0.35, 0.3, 0.24], 0.16, 0.55, 0.15);
        burst(PKind.Smoke, p.x, 0.3, p.y, 8, 0.8, [0.28, 0.26, 0.22], 0.34, 0.7, 0.5);
        lightPunch(p.x, 1.1, p.y, 0x8899ff, 9);
        punchFeel(feel, p.who >= 0 ? HITSTOP_S.fistKill : HITSTOP_S.fist, SHAKE_AMP.fist, p.x - p.tx, p.y - p.ty, p.who >= 0);
        break;
      }
      case 'fistKill':
        break;
      case 'clawArm': {
        const r = ribbons[p.who];
        if (r) r.life = 0.32;
        break;
      }
      case 'claw':
      case 'clawArmor': {
        const heavy = p.kind === 'claw';
        burst(PKind.Spark, p.x, 1.55, p.y, heavy ? 22 : 12, 3.8, [0.45, 0.9, 1], 0.1, 0.32, 0.6);
        sparkArcs(p.x, 1.2, p.y);
        lightPunch(p.x, 1.6, p.y, 0x66ddff, 8);
        spawnDecal(p.x + 0.2, 1.5, p.y, 1, 0.2, 0, 0.55, 0.12, [0.05, 0.12, 0.18], 7);
        punchFeel(
          feel,
          heavy ? HITSTOP_S.claw : HITSTOP_S.clawArmor,
          heavy ? SHAKE_AMP.claw : SHAKE_AMP.clawArmor,
          p.x - p.tx, p.y - p.ty,
          false,
        );
        break;
      }
      case 'whiff':
        burst(PKind.Spark, p.x, 1.4, p.y, 4, 1.4, [0.5, 0.7, 1], 0.06, 0.1, 0.3);
        break;
      case 'hit':
        break;
      case 'death': {
        burst(PKind.Blood, p.x, 1.5, p.y, 42, 4.2, [0.82, 0.04, 0.05], 0.28, 1.35, 1.55);
        burst(PKind.Oil, p.x, 1.25, p.y, 24, 2.8, [0.07, 0.07, 0.05], 0.2, 1.4, 0.45);
        burst(PKind.Spark, p.x, 1.6, p.y, 10, 4.4, [1, 0.7, 0.28], 0.09, 0.48, 1.2);
        spawnDecal(p.x, 0.04, p.y, 0, 1, 0, 1.35, 0.85, [0.18, 0.02, 0.02], 10);
        lightPunch(p.x, 1.4, p.y, 0xcc3311, 5);
        if (p.who >= 0 && p.who < 4) eyeOut[p.who] = 0.55;
        break;
      }
      case 'servoCritical':
        break;
      default: {
        const _e: never = p.kind;
        void _e;
      }
    }
  }

  function muzzleWorld(x: number, z: number, facing: number) {
    const lx = MUZZLE_LOCAL.x, lz = MUZZLE_LOCAL.z;
    return {
      x: x + lx * Math.cos(facing) - lz * Math.sin(facing),
      y: MUZZLE_LOCAL.y,
      z: z + lx * Math.sin(facing) + lz * Math.cos(facing),
    };
  }

  function seedAmbience() {
    if (!high) return;
    for (let i = 0; i < budget.dust; i++) {
      const p = takeParticle();
      if (!p) return;
      p.live = true; p.kind = PKind.Dust;
      p.x = rng(i + 11) * 40; p.y = 0.4 + rng(i + 13) * 3.2; p.z = rng(i + 17) * 24;
      p.vx = 0.04; p.vy = 0.02; p.vz = 0.03;
      p.life = 99; p.max = 99; p.size = 0.07;
      p.r = 0.22; p.g = 0.2; p.b = 0.16; p.a = 0.25;
    }
    for (let i = 0; i < budget.embers; i++) {
      const p = takeParticle();
      if (!p) return;
      p.live = true; p.kind = PKind.Ember;
      p.x = 4 + rng(i + 31) * 32; p.y = 0.3 + rng(i + 33) * 2; p.z = 2 + rng(i + 37) * 20;
      p.vx = 0; p.vy = 0.25; p.vz = 0;
      p.life = 1.5 + rng(i + 41); p.max = p.life; p.size = 0.05;
      p.r = 1; p.g = 0.35; p.b = 0.08; p.a = 0.5;
    }
  }
  seedAmbience();

  let clock = 0;

  const sys: FxSystem = {
    quality,
    feel,
    ingestWorld(w) {
      const pulses = eventsToFxPulses(w.events, w);
      for (const p of pulses) applyPulse(p, w.t.facing);
      if (!high) {
        feel.killcam = 0;
        feel.bloom = 0;
        feel.ca = 0;
        feel.shake = Math.min(feel.shake, 0.12);
      }
    },
    advance(dt, now, armorFrac) {
      clock = now;
      advanceFeel(feel, dt, armorFrac, now, high);
      for (let i = 0; i < 4; i++) {
        if (eyeOut[i]! > 0) eyeOut[i] = Math.max(0, eyeOut[i]! - dt / 0.42);
      }
      impactLight.intensity *= Math.exp(-dt * 14);
      if (impactLight.intensity < 0.05) impactLight.intensity = 0;
      if (waveT > 0) {
        waveT = Math.max(0, waveT - dt);
        const k = 1 - waveT / 0.38;
        wave.scale.setScalar(1 + k * 6);
        waveMat.opacity = high ? (1 - k) * 0.85 : 0;
        if (waveT <= 0) wave.visible = false;
      }
      if (arcLife > 0) {
        arcLife = Math.max(0, arcLife - dt);
        for (const ln of arcLines) (ln.material as THREE.LineBasicMaterial).opacity = (arcLife / 0.12) * 0.85;
      }
      for (const t of tracers) if (t.live) { t.life -= dt; if (t.life <= 0) t.live = false; }
      for (const c of casings) {
        if (!c.live) continue;
        c.life -= dt;
        c.vy -= 9.2 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        if (c.y < 0.03) { c.y = 0.03; c.vy *= -0.25; c.vx *= 0.6; c.vz *= 0.6; }
        c.rx += dt * 8; c.ry += dt * 6;
        if (c.life <= 0) c.live = false;
      }
      for (const d of decals) if (d.live) { d.life -= dt; if (d.life <= 0) d.live = false; }
      for (const r of ribbons) r.life = Math.max(0, r.life - dt);
      for (const p of parts) {
        if (!p.live) continue;
        switch (p.kind) {
          case PKind.Spark:
            p.vy -= 6 * dt;
            p.life -= dt;
            break;
          case PKind.Smoke:
            p.vy += 0.4 * dt;
            p.size += dt * 0.35;
            p.life -= dt;
            break;
          case PKind.Dust:
            p.x += Math.sin(now * 0.15 + p.z) * 0.04 * dt;
            p.z += Math.cos(now * 0.12 + p.x) * 0.03 * dt;
            p.y += 0.02 * dt;
            if (p.y > 4.2) p.y = 0.35;
            if (p.x < 0) p.x += 40;
            if (p.x > 40) p.x -= 40;
            if (p.z < 0) p.z += 24;
            if (p.z > 24) p.z -= 24;
            break;
          case PKind.Ember:
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.life <= 0) {
              p.x = 4 + rng(now * 10 + p.x) * 32;
              p.y = 0.25;
              p.z = 2 + rng(now * 7 + p.z) * 20;
              p.life = p.max;
            }
            break;
          case PKind.Blood:
            p.vy -= 9 * dt;
            p.life -= dt;
            break;
          case PKind.Oil:
            p.vy -= 7 * dt;
            p.life -= dt;
            break;
          case PKind.Debris:
            p.vy -= 10 * dt;
            p.life -= dt;
            if (p.y < 0.04) { p.y = 0.04; p.vy *= -0.2; }
            break;
          default: {
            const _k: never = p.kind;
            void _k;
          }
        }
        if (p.kind !== PKind.Dust && p.kind !== PKind.Ember) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.life <= 0) p.live = false;
        }
      }
    },
    sync(w, term, nls) {
      const isDark = (k: PKind) => k === PKind.Blood || k === PKind.Oil || k === PKind.Debris;
      let pi = 0;
      let di = 0;
      for (const p of parts) {
        if (!p.live) continue;
        const fade = p.kind === PKind.Dust ? 0.22 : Math.max(0, p.life / p.max);
        if (isDark(p.kind)) {
          if (di >= budget.particles) continue;
          darkPos[di * 3] = p.x;
          darkPos[di * 3 + 1] = p.y;
          darkPos[di * 3 + 2] = p.z;
          darkCol[di * 3] = p.r * (0.45 + 0.55 * fade);
          darkCol[di * 3 + 1] = p.g * fade;
          darkCol[di * 3 + 2] = p.b * fade;
          darkSize[di] = p.size * (1.1 + 0.5 * fade);
          di++;
        } else {
          if (pi >= budget.particles) continue;
          posArr[pi * 3] = p.x;
          posArr[pi * 3 + 1] = p.y;
          posArr[pi * 3 + 2] = p.z;
          colArr[pi * 3] = p.r * fade;
          colArr[pi * 3 + 1] = p.g * fade;
          colArr[pi * 3 + 2] = p.b * fade;
          sizeArr[pi] = p.size * (0.7 + 0.6 * fade);
          pi++;
        }
      }
      for (let i = pi; i < budget.particles; i++) {
        posArr[i * 3 + 1] = -99;
        sizeArr[i] = 0;
      }
      for (let i = di; i < budget.particles; i++) {
        darkPos[i * 3 + 1] = -99;
        darkSize[i] = 0;
      }
      (pGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      (pGeo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
      pGeo.setDrawRange(0, pi);
      (darkGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (darkGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      (darkGeo.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
      darkGeo.setDrawRange(0, di);

      let liveT = 0;
      for (let i = 0; i < tracers.length; i++) {
        const t = tracers[i]!;
        const e = tracerEnds[i]!;
        if (!t.live) continue;
        _v.set(e.x1 - e.x0, e.y1 - e.y0, e.z1 - e.z0);
        const len = Math.max(0.2, _v.length());
        _v2.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, (e.z0 + e.z1) / 2);
        _q.setFromUnitVectors(_z, _v.normalize());
        const thick = 0.14 * (0.55 + 0.45 * (t.life / t.max));
        _m.compose(_v2, _q, new THREE.Vector3(thick, thick, len));
        tracersMesh.setMatrixAt(liveT, _m);
        liveT++;
      }
      tracersMesh.count = liveT;
      tracersMesh.instanceMatrix.needsUpdate = true;

      let liveC = 0;
      for (const c of casings) {
        if (!c.live) continue;
        _v.set(c.x, c.y, c.z);
        _q.setFromEuler(new THREE.Euler(c.rx, c.ry, c.rz));
        _m.compose(_v, _q, new THREE.Vector3(1, 1, 1));
        casingsMesh.setMatrixAt(liveC, _m);
        liveC++;
      }
      casingsMesh.count = liveC;
      casingsMesh.instanceMatrix.needsUpdate = true;

      let liveD = 0;
      for (const d of decals) {
        if (!d.live) continue;
        _v.set(d.x, d.y, d.z);
        _q.set(d.qx, d.qy, d.qz, d.qw);
        const fade = Math.max(0, d.life / d.max);
        _m.compose(_v, _q, new THREE.Vector3(d.sx, d.sy, 1));
        decalsMesh.setMatrixAt(liveD, _m);
        decalsMesh.setColorAt(liveD, _col.setRGB(d.r * fade, d.g * fade, d.b * fade));
        liveD++;
      }
      decalsMesh.count = liveD;
      decalsMesh.instanceMatrix.needsUpdate = true;
      if (decalsMesh.instanceColor) decalsMesh.instanceColor.needsUpdate = true;

      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i]!;
        const n = w.nls[i];
        const mat = r.mesh.material as THREE.MeshBasicMaterial;
        const armed = !!(n && n.alive && (n.armTicks > 0 || r.life > 0));
        mat.opacity = armed && high ? (n && n.armTicks > 0 ? 0.85 : r.life / 0.32 * 0.7) : 0;
        if (!n || !armed || !high) continue;
        const fx = Math.cos(n.facing), fz = Math.sin(n.facing);
        const px = -fz, pz = fx;
        for (let s = 0; s < ribbonN; s++) {
          const u = s / (ribbonN - 1);
          const arc = Math.sin(u * Math.PI) * 0.55;
          const along = -0.2 + u * 1.7;
          const cx = n.x + fx * along + px * arc;
          const cz = n.y + fz * along + pz * arc;
          const cy = 1.15 + Math.sin(u * Math.PI) * 0.55 + Math.sin(clock * 28 + i) * 0.04;
          const half = 0.045 + (1 - u) * 0.02;
          r.pos[s * 6] = cx - px * half;
          r.pos[s * 6 + 1] = cy;
          r.pos[s * 6 + 2] = cz - pz * half;
          r.pos[s * 6 + 3] = cx + px * half;
          r.pos[s * 6 + 4] = cy;
          r.pos[s * 6 + 5] = cz + pz * half;
        }
        (r.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }

      void term;
      nls.forEach((g, i) => {
        const alive = w.nls[i]?.alive ?? true;
        if (alive) eyeOut[i] = 0;
        const glow = alive ? 1 : Math.max(0.02, eyeOut[i] ?? 0);
        const mats = eyeMats[i] ?? [];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if ('emissive' in m && std.emissive) {
            if (!std.userData.fxEye) std.userData.fxEye = std.emissive.clone();
            std.emissive.copy(std.userData.fxEye as THREE.Color).multiplyScalar(glow);
          } else {
            (m as THREE.MeshBasicMaterial).color.setRGB(glow, 0.1 * glow, 0.03 * glow);
          }
        }
        g.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!m || !('emissive' in m) || !m.emissive) return;
          if (!m.userData.fxEye) m.userData.fxEye = m.emissive.clone();
          const base = m.userData.fxEye as THREE.Color;
          if (base.r > 0.25 && base.g < 0.45) m.emissive.copy(base).multiplyScalar(glow);
        });
      });
    },
    applyPost(u) {
      u.uBloom.value = feel.bloom;
      u.uCA.value = feel.ca;
      u.uVignettePulse.value = feel.vignettePulse;
    },
    shakeOffset() { return shakeOffset(feel); },
    simDelta(wallDt) { return simDelta(feel, wallDt); },
    pulseAlarm(strip, lamps, now, base) {
      const pulse = 0.86 + 0.14 * Math.sin(now * 2.2);
      strip.emissiveIntensity = base * pulse;
      for (const l of lamps) l.intensity = l.userData.baseIntensity * pulse;
    },
    bindEyes(mats) { eyeMats = mats; },
    resetRound() {
      feel.hitstop = 0; feel.killcam = 0; feel.shake = 0; feel.ca = 0; feel.vignettePulse = 0;
      feel.bloom = high ? 0.20 : 0;
      for (const p of parts) {
        if (p.kind === PKind.Dust || p.kind === PKind.Ember) continue;
        p.live = false;
      }
      for (const t of tracers) t.live = false;
      for (const c of casings) c.live = false;
      for (const d of decals) d.live = false;
      for (const r of ribbons) r.life = 0;
      eyeOut[0] = eyeOut[1] = eyeOut[2] = eyeOut[3] = 0;
      waveT = 0; wave.visible = false; impactLight.intensity = 0; arcLife = 0;
    },
    dispose() {
      scene.remove(points, darkPoints, tracersMesh, casingsMesh, decalsMesh, wave, arcGroup, impactLight);
      for (const r of ribbons) scene.remove(r.mesh);
    },
  };
  return sys;
}
