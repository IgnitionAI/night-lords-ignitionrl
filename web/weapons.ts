// Armes tenues par les frères Night Lords. Les modèles Genex rigés perdent l'arme du concept : on la remet
// à part, fixée à l'os de la main. L'axe principal de l'arme (ACP sur ses sommets) est orienté selon `dir`,
// exprimé dans le repère du personnage (+Z = avant) et appliqué dans la pose d'attente : l'arme suit ensuite
// la main dans toutes les animations. `flip` choisit le bout tenu, `grip` place la paume le long du manche.
import * as THREE from 'three';
export type WeaponSpec = { bone: 'RightHand' | 'LeftHand'; length: number; flip?: boolean; grip?: number; roll?: number; dir?: [number, number, number] };
export function principalAxis(obj: THREE.Object3D) {
  const pts: THREE.Vector3[] = []; obj.updateMatrixWorld(true);
  obj.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; const p = m.geometry.getAttribute('position'); const step = Math.max(1, Math.floor(p.count / 3000));
    for (let i = 0; i < p.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)); });
  const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (const p of pts) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[r * 3 + k] += d[r] * d[k]; }
  let v = new THREE.Vector3(1, 1, 1).normalize(); for (let it = 0; it < 50; it++) { v = new THREE.Vector3(C[0] * v.x + C[1] * v.y + C[2] * v.z, C[3] * v.x + C[4] * v.y + C[5] * v.z, C[6] * v.x + C[7] * v.y + C[8] * v.z).normalize(); }
  let lo = Infinity, hi = -Infinity; for (const p of pts) { const t = p.clone().sub(c).dot(v); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return { c, v, lo, hi };
}
export function attachWeapon(root: THREE.Object3D, weapon: THREE.Object3D, spec: WeaponSpec) {
  // Orientation en espace personnage : l'axe de l'arme suit spec.dir (repère du perso, +Z = avant) dans la pose courante.
  let hand: THREE.Object3D | undefined; root.traverse(o => { if (o.name === spec.bone) hand = o; }); if (!hand) return null;
  weapon.position.set(0, 0, 0); weapon.quaternion.identity(); weapon.scale.setScalar(1);
  const { c, v, lo, hi } = principalAxis(weapon); const len = hi - lo; const dir = spec.flip ? v.clone().negate() : v.clone();
  const handle = c.clone().addScaledVector(v, spec.flip ? hi : lo);
  weapon.position.copy(handle.addScaledVector(dir, (spec.grip ?? .12) * len)).negate();
  const pivot = new THREE.Group(); pivot.add(weapon);
  root.updateMatrixWorld(true);
  const want = new THREE.Vector3(...(spec.dir ?? [0, 0, 1])).normalize().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  const qW = new THREE.Quaternion().setFromUnitVectors(dir, want);
  if (spec.roll) qW.premultiply(new THREE.Quaternion().setFromAxisAngle(want, spec.roll));
  pivot.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qW));
  const ws = hand.getWorldScale(new THREE.Vector3()).x || 1; const rs = root.getWorldScale(new THREE.Vector3()).x || 1;
  pivot.scale.setScalar(spec.length / len * rs / ws);
  hand.add(pivot); return pivot;
}

/** Armes par rôle, dans l'ordre du jeu : Talos, Uzas, Xarl, Cyrion. */
export const NL_WEAPONS: [string, WeaponSpec][][] = [
  [['epee', { bone: 'RightHand', length: 1.35, grip: .1, dir: [.1, .35, 1] }]],
  [['hache', { bone: 'RightHand', length: 1.25, grip: .1, dir: [.1, .6, 1] }]],
  [['tronco', { bone: 'RightHand', length: 1.6, flip: true, grip: .12, dir: [.15, 1, .35] }]],
  [['bolter', { bone: 'RightHand', length: .95, grip: .35, dir: [0, 0, 1] }], ['couteau', { bone: 'LeftHand', length: .55, grip: .15, dir: [0, -.4, 1] }]],
];

/** Fixe les armes d'un rôle. Le personnage est posé un instant sur `idle` (1,2 s) pour orienter les armes,
 *  puis rendu à son mixer. À appeler avant de rattacher la racine à la scène. */
export async function equipNl(root: THREE.Object3D, role: number, idle: THREE.AnimationClip | null, load: (url: string) => Promise<{ scene: THREE.Object3D }>) {
  const list = NL_WEAPONS[role] ?? [];
  const meshes = await Promise.all(list.map(([w]) => load(`/web/models/weapons/${w}.glb`).then((g) => g.scene, () => null)));
  const tmp = idle ? new THREE.AnimationMixer(root) : null;
  if (tmp && idle) { tmp.clipAction(idle).play(); tmp.update(1.2); }
  root.updateMatrixWorld(true);
  list.forEach(([, spec], k) => {
    const w = meshes[k]; if (!w) return;
    w.traverse((o) => {
      o.frustumCulled = false; const m = o as THREE.Mesh; if (!m.isMesh) return; m.castShadow = true;
      // Même calage que les armures : l'or et l'acier Genex sortent éclairés studio, trop chauds dans le couloir.
      const mat = m.material as THREE.MeshStandardMaterial; if (mat?.color) { mat.color.multiplyScalar(.5); mat.envMapIntensity = .25; }
    });
    attachWeapon(root, w, spec);
  });
  if (tmp) { tmp.stopAllAction(); tmp.uncacheRoot(root); }
}
