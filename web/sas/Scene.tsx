import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { INITIAL_CRATES, flashFor, impulseFor, percentiles, type Quality } from './physics';

export type BodyState = { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } };
export type SasDiagnostics = {
  ready: boolean;
  shots: number;
  bodies: () => BodyState[];
  metrics: () => Record<string, unknown>;
  reset: () => void;
};
type Assets = { crate?: THREE.Group; hunter?: THREE.Group; terminator?: THREE.Group; pipes?: THREE.Group; debris?: THREE.Group; chains?: THREE.Group };
type SceneProps = {
  quality: Quality; reducedMotion: boolean; debug: boolean;
  onReady: (fallback: boolean) => void; onFire: () => void;
  fireRef: MutableRefObject<() => void>; resetRef: MutableRefObject<() => void>;
};

function measureHeight(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  let height = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const skin = mesh as THREE.SkinnedMesh;
    if (skin.isSkinnedMesh) skin.computeBoundingBox();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const source = skin.isSkinnedMesh ? skin.boundingBox : mesh.geometry.boundingBox;
    if (!source) return;
    const box = source.clone().applyMatrix4(mesh.matrixWorld);
    height = Math.max(height, box.max.y - Math.min(0, box.min.y));
  });
  return height > 0.01 ? height : 1.7;
}

function preparedModel(source: THREE.Group | undefined, height: number, dim: number) {
  if (!source) return null;
  const root = cloneSkeleton(source);
  root.scale.setScalar(height / measureHeight(root));
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = materials.length === 1 ? materials[0].clone() : materials.map(m => m.clone());
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.color.multiplyScalar(dim);
      material.roughness = Math.max(material.roughness, 0.68);
      material.metalness = Math.min(material.metalness, 0.48);
      material.envMapIntensity = 0.35;
    }
  });
  return root;
}

function StaticProp({ asset, height, position, dim = 0.5 }: { asset?: THREE.Group; height: number; position: [number, number, number]; dim?: number }) {
  const model = useMemo(() => preparedModel(asset, height, dim), [asset, height, dim]);
  return model ? <primitive object={model} position={position} /> : null;
}

function CrateModel({ asset }: { asset?: THREE.Group }) {
  const model = useMemo(() => preparedModel(asset, 0.92, 0.52), [asset]);
  if (model) return <primitive object={model} position={[0, -0.46, 0]} />;
  return <group>
    <mesh castShadow receiveShadow><boxGeometry args={[0.98, 0.9, 0.94]} /><meshStandardMaterial color="#28343b" metalness={0.5} roughness={0.68} /></mesh>
    {[-0.36, 0.36].map(x => <mesh key={x} position={[x, 0, 0.48]} castShadow><boxGeometry args={[0.09, 0.76, 0.05]} /><meshStandardMaterial color="#9c642e" metalness={0.45} roughness={0.62} /></mesh>)}
    <mesh position={[0, 0, 0.505]}><boxGeometry args={[0.3, 0.13, 0.02]} /><meshStandardMaterial color="#0a1014" metalness={0.7} roughness={0.55} /></mesh>
  </group>;
}

function Character({ asset, kind }: { asset?: THREE.Group; kind: 'hunter' | 'terminator' }) {
  const hunter = kind === 'hunter';
  const model = useMemo(() => preparedModel(asset, hunter ? 2.05 : 2.65, hunter ? 0.24 : 0.48), [asset, hunter]);
  return <group>
    {model ? <primitive object={model} /> : <group>
      <mesh position={[0, hunter ? 1.05 : 1.3, 0]} castShadow><capsuleGeometry args={[hunter ? 0.38 : 0.64, hunter ? 1.25 : 1.35, 5, 10]} /><meshStandardMaterial color={hunter ? '#070a0e' : '#282820'} metalness={0.6} roughness={0.63} /></mesh>
      <mesh position={[0, hunter ? 1.82 : 2.25, 0.08]} castShadow><boxGeometry args={[hunter ? 0.54 : 0.8, 0.42, 0.5]} /><meshStandardMaterial color={hunter ? '#080b10' : '#333329'} metalness={0.55} roughness={0.6} /></mesh>
    </group>}
    {hunter && <group position={[0, 1.77, 0.31]}>
      {[-0.105, 0.105].map(x => <mesh key={x} position={[x, 0, 0]}><sphereGeometry args={[0.035, 10, 8]} /><meshBasicMaterial color={[4.5, 0.045, 0.005]} toneMapped={false} /></mesh>)}
    </group>}
  </group>;
}

function Architecture() {
  const ribs = useMemo(() => Array.from({ length: 9 }, (_, i) => -11 + i * 3), []);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[18, 38]} /><meshStandardMaterial color="#182229" metalness={0.55} roughness={0.72} /></mesh>
    <mesh position={[-6.5, 3, -5]} receiveShadow><boxGeometry args={[0.4, 6, 32]} /><meshStandardMaterial color="#111b22" metalness={0.48} roughness={0.77} /></mesh>
    <mesh position={[6.5, 3, -5]} receiveShadow><boxGeometry args={[0.4, 6, 32]} /><meshStandardMaterial color="#111b22" metalness={0.48} roughness={0.77} /></mesh>
    <mesh position={[0, 3, -14]} receiveShadow><boxGeometry args={[13, 6, 0.5]} /><meshStandardMaterial color="#0b131a" metalness={0.4} roughness={0.8} /></mesh>
    {ribs.map(z => <group key={z} position={[0, 0, z]}>
      {[-6.12, 6.12].map(x => <mesh key={x} position={[x, 2.75, 0]} castShadow><boxGeometry args={[0.3, 5.5, 0.4]} /><meshStandardMaterial color="#26343c" metalness={0.65} roughness={0.6} /></mesh>)}
      <mesh position={[0, 5.45, 0]}><boxGeometry args={[12.5, 0.25, 0.4]} /><meshStandardMaterial color="#1e2b34" metalness={0.62} roughness={0.65} /></mesh>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[12, 0.035]} /><meshBasicMaterial color="#43545d" /></mesh>
    </group>)}
    {[-4.9, 4.9].map(x => <group key={x}>
      <mesh position={[x, 0.016, -3]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.07, 25]} /><meshBasicMaterial color="#ad652c" /></mesh>
      {[0, -5, -10].map(z => <mesh key={z} position={[x, 3.4, z]}><boxGeometry args={[0.07, 0.13, 1.6]} /><meshStandardMaterial color="#3a2415" emissive="#bd5920" emissiveIntensity={1.1} /></mesh>)}
    </group>)}
    <mesh position={[0, 0.025, -8]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.5, 1.54, 64]} /><meshBasicMaterial color="#446373" transparent opacity={0.5} /></mesh>
  </group>;
}

function World({ assets, quality, reducedMotion, onFire, fireRef, resetRef, onReady }: Omit<SceneProps, 'debug' | 'onReady'> & { assets: Assets; onReady: (fallback: boolean) => void }) {
  const bodies = useRef<RapierRigidBody[]>([]);
  const flash = useRef<THREE.PointLight>(null);
  const tracer = useRef<THREE.Group>(null);
  const { camera, gl, scene } = useThree();
  const lastShot = useRef(-10000);
  const shots = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const collisionCount = useRef(0);
  const start = useRef(performance.now());
  const [resetKey, setResetKey] = useState(0);

  const reset = useCallback(() => {
    bodies.current.forEach((body, i) => {
      if (!body) return;
      const [x, y, z] = INITIAL_CRATES[i];
      body.setTranslation({ x, y, z }, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    lastShot.current = -10000; shots.current = 0; collisionCount.current = 0;
    setResetKey(k => k + 1);
  }, []);

  const fire = useCallback(() => {
    bodies.current.forEach((body, i) => {
      if (!body) return;
      const { impulse, torque } = impulseFor(i, reducedMotion);
      body.applyImpulse(impulse, true);
      body.applyTorqueImpulse(torque, true);
    });
    lastShot.current = performance.now(); shots.current += 1; onFire();
  }, [onFire, reducedMotion]);

  useEffect(() => { fireRef.current = fire; resetRef.current = reset; }, [fire, reset, fireRef, resetRef]);
  useEffect(() => {
    camera.lookAt(0, 1.3, -3.2);
    gl.setClearColor('#05080d');
    gl.info.autoReset = false;
    const context = gl.getContext();
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    const backend = extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER);
    const diagnostics: SasDiagnostics = {
      ready: true, shots: 0,
      bodies: () => bodies.current.filter(Boolean).map(body => ({ position: body.translation(), rotation: body.rotation() })),
      metrics: () => ({
        backend, quality, reducedMotion, bodies: bodies.current.filter(Boolean).length,
        calls: gl.info.render.calls, triangles: gl.info.render.triangles,
        textures: gl.info.memory.textures, geometries: gl.info.memory.geometries,
        collisions: collisionCount.current, frameTimesMs: percentiles(frameTimes.current),
        uptimeMs: performance.now() - start.current,
      }),
      reset,
    };
    Object.defineProperty(diagnostics, 'shots', { get: () => shots.current });
    window.__SAS = diagnostics;
    if (new URLSearchParams(location.search).get('debug') === '1') (window as any).__SAS_DEBUG = { THREE, scene, camera };
    onReady(!assets.crate || !assets.hunter || !assets.terminator);
    return () => { delete window.__SAS; };
  }, [assets, camera, gl, onReady, quality, reducedMotion, reset]);

  useFrame(() => {
    gl.info.reset();
    const elapsed = performance.now() - lastShot.current;
    const flashParams = flashFor(reducedMotion);
    if (flash.current) flash.current.intensity = elapsed < flashParams.duration ? flashParams.intensity * (1 - elapsed / flashParams.duration) : 0;
    if (tracer.current) tracer.current.visible = elapsed < flashParams.tracerDuration;
    if (performance.now() - start.current > 1200) {
      frameTimes.current.push(useFrameClock.delta * 1000);
      if (frameTimes.current.length > 600) frameTimes.current.shift();
    }
  });

  return <>
    <fog attach="fog" args={['#08131b', 9, 29]} />
    <ambientLight intensity={0.55} color="#6d8b9d" />
    <hemisphereLight args={['#8fb5c9', '#182027', 0.75]} />
    <directionalLight position={[2, 7, 4]} intensity={2.2} color="#9cc6db" castShadow={quality === 'high'} shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-0.0004} />
    <spotLight position={[-3, 4.5, 5]} target-position={[0, 0, -2]} intensity={38} angle={0.48} penumbra={0.75} distance={18} color="#ffd7a0" castShadow={quality === 'high'} shadow-mapSize={[1024, 1024]} />
    <pointLight position={[0, 2.5, -9]} intensity={30} distance={8} color="#578daa" />
    <pointLight ref={flash} position={[-1.55, 1.9, 3.0]} intensity={0} distance={12} decay={2} color="#ffd0a0" />
    <Architecture />
    <group position={[-2.1, 0, 2.6]} rotation={[0, Math.PI + 0.15, 0]}><Character asset={assets.terminator} kind="terminator" /></group>
    <group position={[0.25, 0, -6.4]}><Character asset={assets.hunter} kind="hunter" /></group>
    <StaticProp asset={assets.pipes} height={2.5} position={[-5.75, 0, -2.8]} />
    <StaticProp asset={assets.debris} height={0.65} position={[4.7, 0, -3.5]} />
    <StaticProp asset={assets.chains} height={2.1} position={[4.9, 2.6, -5]} dim={0.4} />
    <group ref={tracer} visible={false}>
      <Line points={[[-1.55, 1.9, 3.0], [0, 1.35, -1.2]]} color="#ffd19a" lineWidth={2} transparent opacity={0.85} />
    </group>
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} debug={false}>
      <RigidBody type="fixed" colliders={false} position={[0, -0.25, -4]}><CuboidCollider args={[6.5, 0.25, 17]} /></RigidBody>
      <RigidBody type="fixed" colliders={false} position={[0, 2.5, -13.6]}><CuboidCollider args={[6.5, 2.5, 0.25]} /></RigidBody>
      {INITIAL_CRATES.map((position, index) => <RigidBody key={`${resetKey}-${index}`} ref={body => { if (body) bodies.current[index] = body; }} position={position} colliders={false} mass={7} friction={0.72} restitution={0.08} linearDamping={0.18} angularDamping={0.28} onCollisionEnter={() => { collisionCount.current += 1; }}>
        <CrateModel asset={assets.crate} />
        {/* Cuboid explicite : le visuel Genex détaillé ne devient jamais un trimesh dynamique. */}
        <CuboidCollider args={[0.5, 0.47, 0.48]} />
      </RigidBody>)}
    </Physics>
    {quality === 'high' && <EffectComposer multisampling={0}><Bloom intensity={0.55} luminanceThreshold={1.05} luminanceSmoothing={0.2} mipmapBlur /><Vignette eskil={false} offset={0.22} darkness={0.58} /></EffectComposer>}
  </>;
}

// Horloge module-local écrite par le composant ci-dessous : évite un setState par frame.
const useFrameClock = { delta: 1 / 60 };
function Clock() { useFrame((_, delta) => { useFrameClock.delta = delta; }); return null; }

export function Scene(props: SceneProps) {
  const [assets, setAssets] = useState<Assets>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const loader = new GLTFLoader();
    const load = async (path: string) => (await loader.loadAsync(path)).scene;
    Promise.allSettled([load('/web/models/props/crate.glb'), load('/web/models/NL-1.glb'), load('/web/models/TERM.glb'), load('/web/models/props/pipes.glb'), load('/web/models/props/debris.glb'), load('/web/models/props/chains.glb')]).then(([crate, hunter, terminator, pipes, debris, chains]) => {
      if (!live) return;
      const value = (result: PromiseSettledResult<THREE.Group>) => result.status === 'fulfilled' ? result.value : undefined;
      setAssets({ crate: value(crate), hunter: value(hunter), terminator: value(terminator), pipes: value(pipes), debris: value(debris), chains: value(chains) });
      setLoaded(true);
    });
    return () => { live = false; };
  }, []);
  return <><Clock />{loaded && <World {...props} assets={assets} />}</>;
}
