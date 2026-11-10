// Ingestion GLB de combat (Genex) : valide les os, renomme le clip, écrit web/models/<role>-<kind>.glb.
// FBX : convertir en GLB avant (Blender). Ne touche pas aux walk/run.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  type CombatClipKind,
  classifyBones,
  combatGlbBasenames,
  canonicalBoneName,
  GENEX_HELPER_NODES,
} from '../web/combat-clips.ts';
import { COMBAT_CLIP_KEYS, pickNamedClip } from '../web/combat-anims.ts';

const ROOT = join(import.meta.dir, '..');
const KINDS: CombatClipKind[] = ['attack', 'shoot', 'hit', 'dodge', 'death'];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseGlbJson(buf: Buffer): { json: Record<string, unknown>; jsonStart: number; jsonLen: number; binStart: number } {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('pas un GLB');
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const json = JSON.parse(buf.toString('utf8', jsonStart, jsonStart + jsonLen));
  const binStart = jsonStart + jsonLen;
  return { json, jsonStart, jsonLen, binStart };
}

function writeGlb(json: Record<string, unknown>, binAndRest: Buffer): Buffer {
  let jsonStr = JSON.stringify(json);
  jsonStr += ' '.repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const total = 12 + 8 + jsonBuf.length + binAndRest.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4E4F534A, 16);
  jsonBuf.copy(out, 20);
  binAndRest.copy(out, 20 + jsonBuf.length);
  return out;
}

const inPath = arg('--in');
const role = arg('--role');
const kind = arg('--kind') as CombatClipKind | undefined;
const outArg = arg('--out');
const dry = process.argv.includes('--dry-run');
if (!inPath || !role || !kind) {
  console.log(`usage: bun scripts/ingest-combat-clips.ts --in clip.glb --role NL-1 --kind attack [--out web/models/NL-1-attack.glb] [--dry-run]
  kinds: ${KINDS.join('|')}
  rôle TERM : attack|shoot|hit|dodge ; NL : attack|hit|dodge|death
  Après commit du GLB : ajouter le kind dans SHIPPED_EXTRA_ANIMS (web/combat-clips.ts) pour éviter un 404.
  FBX non lu ici — exporter GLB (même rig 24 os, +Z, Y-up, Armature ×0,01, 30 fps, in-place).`);
  process.exit(inPath ? 1 : 0);
}
if (!KINDS.includes(kind)) throw new Error(`kind inconnu: ${kind}`);
if (inPath.toLowerCase().endsWith('.fbx')) {
  throw new Error('FBX : convertir en GLB (Blender) puis relancer. Le runtime ne charge que du GLB.');
}

const dest = resolve(outArg ?? join(ROOT, 'web/models', `${role}-${kind}.glb`));
const allowed = new Set(combatGlbBasenames(role));
if (!allowed.has(basename(dest)) && !basename(dest).endsWith(`-${kind}.glb`)) {
  console.warn('nom de sortie hors convention', basename(dest), 'attendu', [...allowed]);
}

const buf = readFileSync(inPath);
const { json, binStart } = parseGlbJson(buf);
const nodes = (json.nodes as { name?: string }[] | undefined) ?? [];
const names = nodes.map((n) => n.name ?? '');
const report = classifyBones(names);
console.log(JSON.stringify({
  in: inPath,
  role,
  kind,
  animations: ((json.animations as { name?: string }[] | undefined) ?? []).map((a) => a.name),
  bones: report,
  extras: (json.asset as { extras?: unknown } | undefined)?.extras,
}, null, 2));
if (report.missing.length) {
  throw new Error(`os manquants (requis 22 clips Genex): ${report.missing.join(', ')}`);
}
if (report.unknown.length) {
  const extra = report.unknown.filter((n) => !GENEX_HELPER_NODES.includes(n as typeof GENEX_HELPER_NODES[number]));
  if (extra.length) console.warn('nœuds inconnus (ignorés si ce ne sont pas des os):', extra);
}

for (const n of nodes) {
  if (!n.name) continue;
  const c = canonicalBoneName(n.name);
  if (c !== n.name) n.name = c;
}

const anims = (json.animations as { name: string }[] | undefined) ?? [];
if (!anims.length) throw new Error('aucune animation dans le GLB');
const picked = pickNamedClip(anims, COMBAT_CLIP_KEYS[kind]);
if (picked) {
  if (!picked.name.toLowerCase().includes(kind)) picked.name = `Armature|${kind}|baselayer`;
} else {
  anims[0].name = `Armature|${kind}|baselayer`;
}

if (dry) {
  console.log('dry-run, pas d\'écriture', dest);
  process.exit(0);
}
const outBuf = writeGlb(json, buf.subarray(binStart));
writeFileSync(dest, outBuf);
console.log('wrote', dest, 'bytes', outBuf.length);
