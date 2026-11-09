// Foulée au sol d'un clip in-place : skin des pieds à chaque clé, après l'échelle du chargeur.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SKIN_FALLBACK_M = 1.7;
export const NL_HEIGHT = 2.0;
export const TERM_HEIGHT = 2.6;

const FOOT_WEIGHT = 0.45;

export function measureHeight(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let h = 0;
  root.traverse((o: THREE.Object3D) => {
    const mesh = o as THREE.Mesh & { isSkinnedMesh?: boolean; boundingBox?: THREE.Box3 };
    if (!(mesh as { isMesh?: boolean }).isMesh) return;
    if (mesh.isSkinnedMesh) mesh.computeBoundingBox();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const src = mesh.isSkinnedMesh ? mesh.boundingBox : mesh.geometry.boundingBox;
    if (!src) return;
    const box = src.clone().applyMatrix4(mesh.matrixWorld);
    h = Math.max(h, box.max.y - Math.min(0, box.min.y));
  });
  return h > 0.01 ? h : SKIN_FALLBACK_M;
}

export function parseGlb(buf: ArrayBuffer | Uint8Array): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const ab = buf instanceof Uint8Array
    ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    : buf;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(ab, '', (g) => resolve(g), reject);
  });
}

function skinnedMeshOf(root: THREE.Object3D): THREE.SkinnedMesh {
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) throw new Error('pas de SkinnedMesh');
  return mesh;
}

function jointsNamed(mesh: THREE.SkinnedMesh, names: string[]): number[] {
  const want = new Set(names);
  const out: number[] = [];
  mesh.skeleton.bones.forEach((b, i) => { if (want.has(b.name)) out.push(i); });
  return out;
}

function contactPoint(mesh: THREE.SkinnedMesh, joints: number[]): THREE.Vector3 | null {
  const geom = mesh.geometry;
  const pos = geom.attributes.position;
  const jointsAttr = geom.attributes.skinIndex;
  const weightsAttr = geom.attributes.skinWeight;
  if (!pos || !jointsAttr || !weightsAttr || joints.length === 0) return null;
  const jointSet = new Set(joints);
  const tmp = new THREE.Vector3();
  let ymin = Infinity;
  const lows: THREE.Vector3[] = [];
  mesh.skeleton.update();
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) {
      if (jointSet.has(jointsAttr.getComponent(i, k))) w += weightsAttr.getComponent(i, k);
    }
    if (w < FOOT_WEIGHT) continue;
    tmp.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, tmp);
    tmp.applyMatrix4(mesh.matrixWorld);
    if (tmp.y < ymin - 0.005) {
      ymin = tmp.y;
      lows.length = 0;
      lows.push(tmp.clone());
    } else if (Math.abs(tmp.y - ymin) <= 0.005) {
      lows.push(tmp.clone());
    }
  }
  if (!lows.length) {
    return null;
  }
  const p = new THREE.Vector3();
  for (const v of lows) p.add(v);
  return p.multiplyScalar(1 / lows.length);
}

export function clipKeyTimes(clip: THREE.AnimationClip): number[] {
  const set = new Set<number>();
  for (const t of clip.tracks) for (let i = 0; i < t.times.length; i++) set.add(t.times[i]);
  return [...set].sort((a, b) => a - b);
}

export function trackLoopDelta(clip: THREE.AnimationClip): { maxFirstLast: number; firstT: number; lastT: number } {
  let maxFirstLast = 0;
  let firstT = Infinity;
  let lastT = -Infinity;
  for (const tr of clip.tracks) {
    if (tr.times.length < 2) continue;
    firstT = Math.min(firstT, tr.times[0]);
    lastT = Math.max(lastT, tr.times[tr.times.length - 1]);
    const vsz = tr.getValueSize();
    const a = tr.values.slice(0, vsz);
    const b = tr.values.slice(-vsz);
    let d = 0;
    for (let i = 0; i < vsz; i++) d += (a[i] - b[i]) ** 2;
    maxFirstLast = Math.max(maxFirstLast, Math.sqrt(d));
  }
  return { maxFirstLast, firstT, lastT };
}

function peakSpanX(samples: THREE.Vector3[]): number {
  if (!samples.length) return 0;
  let minX = Infinity, maxX = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  return maxX - minX;
}

export interface StrideSample {
  stride: number;
  left: number;
  right: number;
  nKeys: number;
  duration: number;
  firstKey: number;
  hipXz: number;
  loopTrackDelta: number;
  poseT0VsFirst: number;
  poseFirstVsLast: number;
}

// Après `rotation.y = π/2` du chargeur, l'avant du modèle est +X (axe de la sim).
export function measureForwardStride(root: THREE.Object3D, clip: THREE.AnimationClip): StrideSample {
  const mesh = skinnedMeshOf(root);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const times = clipKeyTimes(clip);
  const leftJ = jointsNamed(mesh, ['LeftFoot', 'LeftToeBase']);
  const rightJ = jointsNamed(mesh, ['RightFoot', 'RightToeBase']);
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const hips: THREE.Vector3[] = [];
  const hip = mesh.skeleton.bones.find((b) => b.name === 'Hips');
  const sampleAt = (t: number) => {
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    mesh.skeleton.update();
  };
  for (const t of times) {
    sampleAt(t);
    const ls = contactPoint(mesh, leftJ);
    const rs = contactPoint(mesh, rightJ);
    if (ls) left.push(ls);
    if (rs) right.push(rs);
    if (hip) hips.push(new THREE.Vector3().setFromMatrixPosition(hip.matrixWorld));
  }
  sampleAt(0);
  const p0 = contactPoint(mesh, leftJ);
  sampleAt(times[0] ?? 0);
  const pFirst = contactPoint(mesh, leftJ);
  sampleAt(clip.duration);
  const pEnd = contactPoint(mesh, leftJ);
  mixer.stopAllAction();
  mixer.uncacheClip(clip);
  mesh.skeleton.pose();
  root.updateMatrixWorld(true);
  const leftSpan = peakSpanX(left);
  const rightSpan = peakSpanX(right);
  let hipX = Infinity, hipZ = Infinity, hipXn = -Infinity, hipZn = -Infinity;
  for (const p of hips) {
    hipX = Math.min(hipX, p.x); hipXn = Math.max(hipXn, p.x);
    hipZ = Math.min(hipZ, p.z); hipZn = Math.max(hipZn, p.z);
  }
  const loop = trackLoopDelta(clip);
  return {
    stride: (leftSpan + rightSpan) / 2,
    left: leftSpan,
    right: rightSpan,
    nKeys: times.length,
    duration: clip.duration,
    firstKey: times[0] ?? 0,
    hipXz: hips.length ? Math.hypot(hipXn - hipX, hipZn - hipZ) : 0,
    loopTrackDelta: loop.maxFirstLast,
    poseT0VsFirst: p0 && pFirst ? p0.distanceTo(pFirst) : 0,
    poseFirstVsLast: pFirst && pEnd ? pFirst.distanceTo(pEnd) : 0,
  };
}

export function pickClip(clips: THREE.AnimationClip[], gait: 'walk' | 'run'): THREE.AnimationClip | null {
  const hit = clips.find((c) => c.name.toLowerCase().includes(gait));
  return hit ?? null;
}
