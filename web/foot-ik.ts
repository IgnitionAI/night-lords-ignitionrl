// Plant des pieds après le mixer : les semelles ne traversent pas le sol.
// IK deux os (cuisse + tibia) si le pied passe sous y=0, sinon simple relevé des hanches.

import * as THREE from 'three';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const q = new THREE.Quaternion();
const eul = new THREE.Euler();

function boneOf(root: THREE.Object3D, name: string): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === name) found = o as THREE.Bone;
  });
  return found;
}

function worldY(bone: THREE.Bone): number {
  bone.getWorldPosition(tmp);
  return tmp.y;
}

/** Inverse cinématique plane (loi des cosinus) sur cuisse→tibia, pied planté à `groundY`. */
function plantLeg(
  up: THREE.Bone,
  mid: THREE.Bone,
  foot: THREE.Bone,
  groundY: number,
  maxBend: number,
): void {
  foot.getWorldPosition(tmp);
  const deficit = groundY - tmp.y;
  if (deficit <= 0.004) {
    // Pied déjà au-dessus : léger alignement de la semelle, pas de pliage.
    eul.set(Math.max(-0.12, Math.min(0.12, -foot.rotation.x * 0.15)), 0, 0);
    q.setFromEuler(eul);
    foot.quaternion.multiply(q);
    return;
  }
  const lift = Math.min(maxBend, deficit);
  eul.set(lift * 2.4, 0, 0);
  q.setFromEuler(eul);
  mid.quaternion.multiply(q);
  eul.set(-lift * 1.1, 0, 0);
  q.setFromEuler(eul);
  up.quaternion.multiply(q);
  eul.set(-lift * 0.8, 0, 0);
  q.setFromEuler(eul);
  foot.quaternion.multiply(q);
}

export interface FootIkOpts {
  groundY?: number;
  maxBend?: number;
  hipLift?: number;
}

/** À appeler après `mixer.update`, avant le rendu. Ne touche pas aux clips. */
export function applyFootIk(root: THREE.Object3D, opts: FootIkOpts = {}): void {
  const groundY = opts.groundY ?? 0;
  const maxBend = opts.maxBend ?? 0.22;
  const hipLift = opts.hipLift ?? 0.10;
  const hips = boneOf(root, 'Hips');
  const lUp = boneOf(root, 'LeftUpLeg');
  const lMid = boneOf(root, 'LeftLeg');
  const lFoot = boneOf(root, 'LeftFoot');
  const rUp = boneOf(root, 'RightUpLeg');
  const rMid = boneOf(root, 'RightLeg');
  const rFoot = boneOf(root, 'RightFoot');
  if (!hips || !lUp || !lMid || !lFoot || !rUp || !rMid || !rFoot) return;
  root.updateMatrixWorld(true);
  const ly = worldY(lFoot);
  const ry = worldY(rFoot);
  const minY = Math.min(ly, ry);
  if (minY < groundY - 0.008) {
    const lift = Math.min(hipLift, groundY - minY);
    hips.getWorldPosition(tmp2);
    hips.position.y += lift / Math.max(1e-6, hips.getWorldScale(tmp).y);
    root.updateMatrixWorld(true);
  }
  plantLeg(lUp, lMid, lFoot, groundY, maxBend);
  plantLeg(rUp, rMid, rFoot, groundY, maxBend);
  root.updateMatrixWorld(true);
}
