import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGlb, measureForwardStride, measureHeight } from '../web/stride';
(globalThis as any).self = globalThis;
test('mesurer une foulée préserve chaque transformation locale du squelette redimensionné', async () => {
 const model=await parseGlb(readFileSync('web/models/NL-1.glb'));
 const walk=await parseGlb(readFileSync('web/models/NL-1-walk.glb'));
 model.scene.scale.setScalar(2/measureHeight(model.scene));model.scene.rotation.y=Math.PI/2;
 const before=new Map();model.scene.traverse(o=>before.set(o.uuid,[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]));
 const stride=measureForwardStride(model.scene,walk.animations[0]);assert.ok(stride.stride>0.1);
 model.scene.traverse(o=>assert.deepEqual([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()],before.get(o.uuid),o.name));
});
