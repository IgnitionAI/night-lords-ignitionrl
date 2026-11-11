// Retarget local d'un clip Genex ré-armaturé vers le rig d'origine, puis extraction in-place.
// Aucune écriture sur les GLB de base, walk, run ou idle.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { parseGlb } from '../web/stride.ts';
import {
  GENEX_SKIN_JOINTS,
  ROLE_RIG_HASH,
  combatKindSet,
  type CombatClipKind,
} from '../web/combat-clips.ts';

const FPS = 30;
const ROOT = join(import.meta.dir, '..');
const JOINTS = new Set<string>(GENEX_SKIN_JOINTS);

type Role = keyof typeof ROLE_RIG_HASH;
type RestPose = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
type RestWorld = { position: THREE.Vector3; quaternion: THREE.Quaternion };

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberArg(flag: string, fallback: number): number {
  const value = Number(arg(flag) ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} doit être un nombre ≥ 0`);
  return value;
}

function requireRole(value: string | undefined): Role {
  if (!value || !(value in ROLE_RIG_HASH)) throw new Error(`rôle inconnu: ${value}`);
  return value as Role;
}

function requireKind(role: Role, value: string | undefined): CombatClipKind {
  const kind = value as CombatClipKind | undefined;
  if (!kind || !combatKindSet(role).includes(kind)) throw new Error(`kind ${value} interdit pour ${role}`);
  return kind;
}

function installFileReaderStub(): void {
  class FakeFileReader {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = FakeFileReader;
}

function installImageStub(): void {
  class FakeImage {
    width = 1;
    height = 1;
    complete = true;
    onload: ((this: FakeImage, event: unknown) => unknown) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.(null)); }
  }
  (globalThis as { Image?: unknown }).Image = FakeImage;
  (globalThis as { self?: typeof globalThis }).self = globalThis;
}

function restWorld(scene: THREE.Object3D): Map<string, RestWorld> {
  scene.updateMatrixWorld(true);
  const poses = new Map<string, RestWorld>();
  for (const name of JOINTS) {
    const node = scene.getObjectByName(name);
    if (!node) throw new Error(`os absent: ${name}`);
    poses.set(name, {
      position: node.getWorldPosition(new THREE.Vector3()),
      quaternion: node.getWorldQuaternion(new THREE.Quaternion()),
    });
  }
  return poses;
}

function requireJointHierarchy(scene: THREE.Object3D): void {
  for (const name of JOINTS) {
    const node = scene.getObjectByName(name);
    if (!node) throw new Error(`hiérarchie cible incomplète: ${name}`);
    const parentName = node.parent?.name;
    if (name !== 'Hips' && parentName && !JOINTS.has(parentName) && parentName !== 'Armature') {
      throw new Error(`parent inattendu pour ${name}: ${parentName}`);
    }
  }
}

function localRestPose(node: THREE.Object3D): RestPose {
  return {
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
    scale: node.scale.clone(),
  };
}

function setTargetWorldPose(
  node: THREE.Object3D,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
): void {
  const parent = node.parent;
  if (!parent) throw new Error(`os sans parent: ${node.name}`);
  parent.updateWorldMatrix(true, false);
  node.position.copy(parent.worldToLocal(position.clone()));
  const parentRotation = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  node.quaternion.copy(parentRotation.multiply(quaternion));
  node.updateMatrixWorld(true);
}

function retargetFrame(
  source: THREE.Object3D,
  target: THREE.Object3D,
  sourceRest: Map<string, RestWorld>,
  targetRest: Map<string, RestWorld>,
): void {
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  target.traverse((node) => {
    if (!JOINTS.has(node.name)) return;
    const sourceNode = source.getObjectByName(node.name);
    const sourceBind = sourceRest.get(node.name);
    const targetBind = targetRest.get(node.name);
    if (!sourceNode || !sourceBind || !targetBind) throw new Error(`rig incompatible: ${node.name}`);

    const sourcePosition = sourceNode.getWorldPosition(new THREE.Vector3());
    const sourceRotation = sourceNode.getWorldQuaternion(new THREE.Quaternion());
    const worldDelta = sourceRotation.multiply(sourceBind.quaternion.clone().invert());
    const targetRotation = worldDelta.multiply(targetBind.quaternion);
    const targetPosition = sourcePosition.sub(sourceBind.position).add(targetBind.position);
    if (node.name === 'Hips') {
      targetPosition.x = targetBind.position.x;
      targetPosition.z = targetBind.position.z;
    }
    setTargetWorldPose(node, targetPosition, targetRotation);
  });
  target.updateMatrixWorld(true);
}

function appendFrame(
  target: THREE.Object3D,
  positions: Map<string, number[]>,
  rotations: Map<string, number[]>,
  scales: Map<string, number[]>,
  previousRotations: Map<string, THREE.Quaternion>,
): void {
  for (const name of JOINTS) {
    const node = target.getObjectByName(name)!;
    positions.get(name)!.push(...node.position.toArray());
    scales.get(name)!.push(...node.scale.toArray());
    const rotation = node.quaternion.clone();
    const previous = previousRotations.get(name);
    if (previous && previous.dot(rotation) < 0) {
      rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
    }
    rotations.get(name)!.push(...rotation.toArray());
    previousRotations.set(name, rotation);
  }
}

function buildTracks(
  times: number[],
  positions: Map<string, number[]>,
  rotations: Map<string, number[]>,
  scales: Map<string, number[]>,
): THREE.KeyframeTrack[] {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const name of GENEX_SKIN_JOINTS) {
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, times, positions.get(name)!));
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations.get(name)!));
    tracks.push(new THREE.VectorKeyframeTrack(`${name}.scale`, times, scales.get(name)!));
  }
  return tracks;
}

function chooseWindow(
  source: THREE.Object3D,
  clip: THREE.AnimationClip,
  kind: CombatClipKind,
  duration: number,
): { start: number; contact: number } {
  const analysis = source.clone(true);
  const mixer = new THREE.AnimationMixer(analysis);
  const action = mixer.clipAction(clip);
  action.clampWhenFinished = true;
  action.play();
  const hands = ['LeftHand', 'RightHand'].map((name) => ({
    samples: analysis.getObjectByName(name) ? [] as THREE.Vector3[] : null,
    node: analysis.getObjectByName(name)!,
  }));
  const head = analysis.getObjectByName('Head')!;
  const headSamples: THREE.Vector3[] = [];
  const frameCount = Math.max(1, Math.round(clip.duration * FPS));
  for (let frame = 0; frame <= frameCount; frame++) {
    mixer.setTime(Math.min(clip.duration, frame / FPS));
    analysis.updateMatrixWorld(true);
    for (const hand of hands) hand.samples?.push(hand.node.getWorldPosition(new THREE.Vector3()));
    headSamples.push(head.getWorldPosition(new THREE.Vector3()));
  }
  mixer.stopAllAction();
  const lastStart = Math.max(0, clip.duration - duration);
  if (kind === 'death') {
    let contact = 0;
    let lowestHead = Infinity;
    headSamples.forEach((position, frame) => {
      if (position.y < lowestHead) {
        lowestHead = position.y;
        contact = frame / FPS;
      }
    });
    return { start: Math.max(0, Math.min(lastStart, contact - duration)), contact };
  }
  const samples = kind === 'attack' || kind === 'shoot' ? hands.map((hand) => hand.samples) : [headSamples];
  let contact = 0;
  let fastest = -1;
  for (const positions of samples) {
    if (!positions) continue;
    for (let frame = 1; frame < positions.length; frame++) {
      const speed = positions[frame].distanceTo(positions[frame - 1]) * FPS;
      if (speed > fastest) {
        fastest = speed;
        contact = frame / FPS;
      }
    }
  }
  const anticipation = kind === 'attack' || kind === 'shoot' ? Math.min(0.263333, duration * 0.56) : duration / 2;
  return { start: Math.max(0, Math.min(lastStart, contact - anticipation)), contact };
}

function retargetClip(
  source: THREE.Object3D,
  target: THREE.Object3D,
  clip: THREE.AnimationClip,
  start: number,
  duration: number,
  kind: CombatClipKind,
): THREE.AnimationClip {
  const sourceRest = restWorld(source);
  const targetRest = restWorld(target);
  const initialTargetPoses = new Map<string, RestPose>();
  target.traverse((node) => initialTargetPoses.set(node.uuid, localRestPose(node)));
  const mixer = new THREE.AnimationMixer(source);
  const action = mixer.clipAction(clip);
  action.clampWhenFinished = true;
  action.play();
  const frameCount = Math.max(2, Math.round(duration * FPS) + 1);
  const times = Array.from({ length: frameCount }, (_, index) => index / FPS);
  const positions = new Map<string, number[]>([...JOINTS].map((name) => [name, []]));
  const rotations = new Map<string, number[]>([...JOINTS].map((name) => [name, []]));
  const scales = new Map<string, number[]>([...JOINTS].map((name) => [name, []]));
  const previousRotations = new Map<string, THREE.Quaternion>();

  for (const time of times) {
    mixer.setTime(Math.min(clip.duration, start + time));
    retargetFrame(source, target, sourceRest, targetRest);
    appendFrame(target, positions, rotations, scales, previousRotations);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  target.traverse((node) => {
    const rest = initialTargetPoses.get(node.uuid)!;
    node.position.copy(rest.position);
    node.quaternion.copy(rest.quaternion);
    node.scale.copy(rest.scale);
  });
  target.updateMatrixWorld(true);
  return new THREE.AnimationClip(
    `Armature|${kind}|baselayer`,
    times.at(-1),
    buildTracks(times, positions, rotations, scales),
  );
}

function exportableRig(target: THREE.Object3D): THREE.Object3D {
  const armature = target.getObjectByName('Armature');
  if (!armature) throw new Error('Armature absent du rig cible');
  const rig = armature.clone(true);
  const meshes: THREE.Object3D[] = [];
  rig.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshes.push(node); });
  for (const mesh of meshes) mesh.parent?.remove(mesh);
  return rig;
}

function patchAssetExtras(glb: Buffer, role: Role): Buffer {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  json.asset.extras = {
    genex: 'local-retarget',
    rig: ROLE_RIG_HASH[role],
    inPlace: true,
  };
  let text = JSON.stringify(json);
  text += ' '.repeat((4 - (text.length % 4)) % 4);
  const jsonBuffer = Buffer.from(text);
  const remainder = glb.subarray(20 + jsonLength);
  const output = Buffer.alloc(12 + 8 + jsonBuffer.length + remainder.length);
  output.write('glTF', 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonBuffer.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBuffer.copy(output, 20);
  remainder.copy(output, 20 + jsonBuffer.length);
  return output;
}

async function main(): Promise<void> {
  installImageStub();
  installFileReaderStub();
  const input = arg('--in');
  if (!input) throw new Error('usage: --in clip.glb --role NL-1 --kind attack --start 0.47 [--duration 0.466667]');
  const role = requireRole(arg('--role'));
  const kind = requireKind(role, arg('--kind'));
  const defaultDurations: Record<CombatClipKind, number> = {
    attack: 14 / FPS,
    shoot: 14 / FPS,
    hit: 0.28,
    dodge: 11 / FPS,
    death: 0.8,
  };
  const duration = numberArg('--duration', defaultDurations[kind]);
  const output = resolve(arg('--out') ?? join(ROOT, 'web/models', `${role}-${kind}.glb`));
  const source = await parseGlb(readFileSync(input));
  const target = await parseGlb(readFileSync(join(ROOT, 'web/models', `${role}.glb`)));
  requireJointHierarchy(source.scene);
  requireJointHierarchy(target.scene);
  if (!source.animations.length) throw new Error('aucune animation source');
  const automaticWindow = chooseWindow(source.scene, source.animations[0], kind, duration);
  const start = numberArg('--start', automaticWindow.start);
  if (start + duration > source.animations[0].duration + 1e-6) throw new Error('fenêtre hors clip');

  const clip = retargetClip(source.scene, target.scene, source.animations[0], start, duration, kind);
  const exporter = new GLTFExporter();
  const exported = await exporter.parseAsync(exportableRig(target.scene), {
    animations: [clip],
    binary: true,
    onlyVisible: true,
  });
  const glb = patchAssetExtras(Buffer.from(exported as ArrayBuffer), role);
  if (glb.length > 150_000) throw new Error(`budget dépassé: ${glb.length} octets`);
  writeFileSync(output, glb);
  console.log(JSON.stringify({
    output,
    bytes: glb.length,
    source: basename(input),
    role,
    kind,
    start,
    contact: automaticWindow.contact,
    duration: clip.duration,
    tracks: clip.tracks.length,
    rig: ROLE_RIG_HASH[role],
    inPlace: true,
  }, null, 2));
}

await main();
