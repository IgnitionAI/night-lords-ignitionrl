// Prototype gris : rendu Three.js (cubes et capsules) d'une sim pure à pas fixe (src/sim.ts).
import * as THREE from 'three';
import { newWorld, step, observe, nlFrame, terminatorPerceives, DT, MAX_TICKS, ARENA, PILLARS, BEACON, ROLES, T_CFG, NL_CFG, NL_ACTIONS, type World, type TAction } from '../src/sim';
import { POOL, UNSEEN, type Tactic } from '../src/tactics';
import { Recorder } from '../src/recorder';
import { forward, softmax, sample, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';

const qs = new URLSearchParams(location.search);
const autoplay = qs.get('autoplay'); const shot = Number(qs.get('shot') ?? 0);
let debug = qs.get('debug') === '1'; let seed = Number(qs.get('seed') ?? (Date.now() % 800000) + 1);
let actor: ActorJSON | null = null; let policyLabel = 'meute naïve (aucune politique chargée)';
const ROLE_COL = [0xd8d8ff, 0xff3030, 0xffa020, 0x30d0ff];
const ROLE_CSS = ['#d8d8ff', '#ff3030', '#ffa020', '#30d0ff'];

// ---------- scène
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020306); scene.fog = new THREE.Fog(0x020306, 30, 70);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
scene.add(new THREE.AmbientLight(0x30364a, 0.35)); scene.add(new THREE.HemisphereLight(0x223355, 0x050505, 0.25));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.w, ARENA.h), new THREE.MeshStandardMaterial({ color: 0x1a1c22, metalness: 0.6, roughness: 0.7 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(ARENA.w / 2, 0, ARENA.h / 2); floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0x2a2f3a, 0x15181f); grid.position.set(20, 0.01, 20); grid.scale.set(1, 1, 0.6); scene.add(grid);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2e36, metalness: 0.5, roughness: 0.6 });
for (const b of PILLARS) { const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 4, b.y1 - b.y0), wallMat); m.position.set((b.x0 + b.x1) / 2, 2, (b.y0 + b.y1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
  const lamp = new THREE.PointLight(0xff2a1a, 6, 7, 2); lamp.position.set((b.x0 + b.x1) / 2, 3.6, b.y0 - 0.3); scene.add(lamp); }
for (const [w, d, x, z] of [[ARENA.w, 0.4, ARENA.w / 2, -0.2], [ARENA.w, 0.4, ARENA.w / 2, ARENA.h + 0.2], [0.4, ARENA.h, -0.2, ARENA.h / 2], [0.4, ARENA.h, ARENA.w + 0.2, ARENA.h / 2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat); m.position.set(x, 0.6, z); scene.add(m); }
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(BEACON.r, BEACON.r, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x00ff33, emissive: 0x00aa55, emissiveIntensity: 1.2 }));
beacon.position.set(BEACON.x, 0.05, BEACON.y); scene.add(beacon); const bl = new THREE.PointLight(0x33ff66, 12, 9, 2); bl.position.set(BEACON.x, 2, BEACON.y); scene.add(bl);

// Terminator : cubes (os/or loyaliste), front marqué par le visor et le storm bolter
const term = new THREE.Group(); const bone = new THREE.MeshStandardMaterial({ color: 0xcdb98a, metalness: 0.5, roughness: 0.45 });
const add = (g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
add(term, new THREE.BoxGeometry(1.3, 1.7, 1.6), bone, 0, 1.25, 0);
add(term, new THREE.BoxGeometry(0.9, 0.9, 2.6), bone, -0.1, 2.05, 0); // épaulières
add(term, new THREE.BoxGeometry(0.55, 0.5, 0.55), bone, 0.35, 2.35, 0);
add(term, new THREE.BoxGeometry(0.12, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.64, 2.38, 0);
add(term, new THREE.BoxGeometry(1.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x333 }), 0.75, 1.5, 0.9); // storm bolter
const fistM = add(term, new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x1122aa }), 0.55, 1.1, -0.95);
const spot = new THREE.SpotLight(0xfff2d0, 60, T_CFG.visionRange + 4, T_CFG.visionHalf * 0.75, 0.5, 1.4); spot.position.set(0.7, 2.4, 0); spot.castShadow = true;
term.add(spot); const tLamp = new THREE.PointLight(0xffe8c0, 25, 6, 2); tLamp.position.set(-1.2, 4, 0); term.add(tLamp); const spotTarget = new THREE.Object3D(); spotTarget.position.set(8, 0, 0); term.add(spotTarget); spot.target = spotTarget; scene.add(term);

const nlMeshes = ROLES.map((name, i) => {
  const g = new THREE.Group();
  add(g, new THREE.CapsuleGeometry(NL_CFG.radius, 1.1, 6, 12), new THREE.MeshStandardMaterial({ color: 0x14204a, metalness: 0.6, roughness: 0.35 }), 0, 1.0, 0);
  add(g, new THREE.BoxGeometry(0.2, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: ROLE_COL[i] }), 0.38, 1.55, 0); // yeux, côté avant
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24), new THREE.MeshBasicMaterial({ color: ROLE_COL[i], side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d')!; x.font = 'bold 40px system-ui'; x.fillStyle = ROLE_CSS[i]; x.textAlign = 'center'; x.fillText(name, 128, 46);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(2.4, 0.6, 1); s.position.y = 2.5; g.add(s);
  scene.add(g); return g;
});
// vue de contrôle : cônes, croyances, bruit
const dbgGroup = new THREE.Group(); scene.add(dbgGroup);
function fan(half: number, r: number, color: number, op: number) {
  const geo = new THREE.CircleGeometry(r, 24, -half, 2 * half); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); g.position.y = 0.05; return g;
}
const cones = ROLES.map((_, i) => { const c = fan(NL_CFG.visionHalf, NL_CFG.visionRange, ROLE_COL[i], 0.08); dbgGroup.add(c); return c; });
const beliefs = ROLES.map((_, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 24), new THREE.MeshBasicMaterial({ color: ROLE_COL[i], transparent: true, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.08; dbgGroup.add(m); return m; });
const links = ROLES.map((_, i) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: ROLE_COL[i], dashSize: 0.4, gapSize: 0.3 })); dbgGroup.add(l); return l; });
const noiseRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); noiseRing.rotation.x = -Math.PI / 2; noiseRing.position.y = 0.06; dbgGroup.add(noiseRing);
const tCone = fan(T_CFG.visionHalf, T_CFG.visionRange, 0xfff0c0, 0.05); dbgGroup.add(tCone);
const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe080 })); scene.add(tracer); tracer.visible = false;

// ---------- état de jeu
let w: World, prev: { t: [number, number, number]; n: [number, number, number][] }, rec: Recorder, rng: () => number, tactic: Tactic | null;
let roundNo = 0, score = { pack: 0, term: 0 }, paused = false, acc = 0, hitstop = 0, shake = 0, lastActs: number[] = [0, 0, 0, 0], lastP: number[] = [0, 0, 0, 0], tracerT = 0;
let roundOver = false, lastSummary = '';
const keys = new Set<string>();
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV') debug = !debug; if (e.code === 'KeyP') paused = !paused; if (e.code === 'Enter' && roundOver) startRound(); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
const snap = () => ({ t: [w.t.x, w.t.y, w.t.facing] as [number, number, number], n: w.nls.map(n => [n.x, n.y, n.facing] as [number, number, number]) });
function startRound() {
  // le build jouable garde l'armement des griffes (défaut) : il n'est plus celui des mesures b3
  roundNo++; roundOver = false; seed = seed + 1; w = newWorld(seed); prev = snap(); rec = new Recorder(autoplay ? `autoplay ${autoplay}` : 'joueur'); rng = mulberry32(seed ^ 0x9e3779b9);
  tactic = autoplay ? (POOL[autoplay] ?? UNSEEN[autoplay] ?? POOL.march)() : null;
  nlMeshes.forEach(m => { m.rotation.set(0, 0, 0); m.visible = true; });
  (document.getElementById('msg') as HTMLElement).style.display = 'none';
}
function playerAction(): TAction {
  const k = (c: string) => keys.has(c);
  return { fwd: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), strafe: (k('KeyA') ? 1 : 0) - (k('KeyD') ? 1 : 0), turn: (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0), bolt: k('Space'), fist: k('KeyF') || k('ShiftLeft') };
}
function floatText(x: number, y: number, text: string, color: string) {
  const v = new THREE.Vector3(x, 2.5, y).project(camera); const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color;
  el.style.left = `${(v.x + 1) / 2 * innerWidth}px`; el.style.top = `${(1 - v.y) / 2 * innerHeight}px`; document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(-40px)'; el.style.opacity = '0'; }); setTimeout(() => el.remove(), 800);
}
function tick() {
  prev = snap();
  const ta = tactic ? tactic(w) : playerAction(); rec.record(w, ta);
  const acts = w.nls.map((n, i) => {
    if (!n.alive) return 0;
    if (!actor) { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; }
    const p = softmax(forward(actor, observe(w, i))); const a = sample(p, rng); lastP[i] = p[a]; return a;
  }); lastActs = acts;
  step(w, ta, acts);
  for (const e of w.events) {
    if (e.type === 'bolt') { tracer.geometry.setFromPoints([new THREE.Vector3(e.x, 1.5, e.y), new THREE.Vector3(e.tx, 1.2, e.ty)]); tracer.visible = true; tracerT = 0.08; shake = Math.max(shake, 0.15); }
    if ((e.type === 'bolt' || e.type === 'fist') && e.kill >= 0) { hitstop = 0.09; shake = 0.5; const n = w.nls[e.kill]; floatText(n.x, n.y, `${ROLES[e.kill]} abattu`, '#ffd27a'); flash(0.25); }
    if (e.type === 'clawArm') { const n = w.nls[e.who]; floatText(n.x, n.y, 'GRIFFES', '#fb6'); shake = Math.max(shake, 0.08); } // annonce : l'impact tombe 2 ticks plus tard
    if (e.type === 'claw') { const n = w.nls[e.who]; if (e.dmg === 0) floatText(n.x, n.y, 'ARMURE', '#9cf'); else { floatText(w.t.x, w.t.y, `-${e.dmg} ${e.zone === 'rear' ? 'DOS' : 'FLANC'}`, '#f44'); shake = Math.max(shake, 0.3); } }
  }
  if (w.done) endRound();
}
function flash(o: number) { const f = document.getElementById('flash')!; f.style.transition = 'none'; f.style.opacity = String(o); requestAnimationFrame(() => { f.style.transition = 'opacity .25s'; f.style.opacity = '0'; }); }
async function endRound() {
  roundOver = true; if (w.winner === 'pack') score.pack++; else score.term++;
  const msg = document.getElementById('msg')!; msg.style.display = 'block';
  msg.innerHTML = `<b>Manche ${roundNo} : ${w.winner === 'pack' ? 'la meute gagne' : 'le Terminator gagne'}</b> (${w.reason})<br>La meute étudie ta tactique…`;
  if (shot) return;
  try {
    const r = await fetch('/api/round', { method: 'POST', body: JSON.stringify(rec.toJSON(`${w.winner} — ${w.reason}`)) }).then(r => r.json());
    lastSummary = r.summary;
    if (r.ok) { await loadPolicy(); msg.innerHTML += `<br>Ce qu'elle a lu : ${r.summary}.<br>Fantôme appris par imitation sur tes ${r.roundsUsed} dernière(s) manche(s), meute ré-entraînée contre lui (${r.updates} mises à jour PPO, ${r.seconds.toFixed(0)} s).`; }
    else msg.innerHTML += `<br>Ce qu'elle a lu : ${r.summary}.<br>Pas de ré-entraînement : ${r.reason ?? 'échec'}.`;
  } catch { msg.innerHTML += '<br>Serveur local absent : pas de ré-entraînement.'; }
  msg.innerHTML += '<br><br>Entrée : manche suivante';
}
async function loadPolicy() {
  try { const j = await fetch('/policy/current.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null); if (j) { actor = j; policyLabel = `politique ${j.version}`; } } catch { /* naïve */ }
}
function hud() {
  const t = w.t; const h = document.getElementById('hud')!;
  h.innerHTML = `<b>TERMINATOR</b> — manche ${roundNo} · meute ${score.pack} / ${score.term} Terminator · ${((MAX_TICKS - w.tick) * DT).toFixed(0)} s<div class="bar"><i style="width:${t.hp / T_CFG.hp * 100}%"></i></div>`
    + `${t.channel ? `<b style="color:#6f6">Téléportation ${Math.round(t.channel / T_CFG.channel * 100)} %</b> · ` : ''}Armure ${t.hp}/${T_CFG.hp} · bolter ${t.boltCd ? '…' : 'prêt'} · gantelet ${t.fistCd ? '…' : 'prêt'} · Night Lords debout : ${w.nls.filter(n => n.alive).length}/4<br><small>${policyLabel}${autoplay ? ` · Terminator en autoplay (${autoplay})` : ''}</small>`;
  const d = document.getElementById('dbg')!; d.style.display = debug ? 'block' : 'none';
  if (debug) d.innerHTML = `<b>Vue de contrôle — ce que perçoit chaque Night Lord</b><table><tr><th>rôle</th><th>état</th><th>voit</th><th>entend</th><th>vox</th><th>âge</th><th>action (p)</th></tr>`
    + w.nls.map((n, i) => `<tr style="color:${ROLE_CSS[i]}"><td>${ROLES[i]}</td><td>${n.alive ? 'debout' : 'mort'}</td><td>${n.alive && n.belief.seen ? '●' : '·'}</td><td>${n.alive && n.belief.heard ? '●' : '·'}</td><td>${n.alive && n.belief.vox ? '●' : '·'}</td><td>${n.alive && n.belief.valid ? (n.belief.age * DT).toFixed(1) + ' s' : '—'}</td><td>${n.alive ? NL_ACTIONS[lastActs[i]] + (actor ? ` (${lastP[i].toFixed(2)})` : '') : ''}</td></tr>`).join('')
    + `</table>Anneau blanc = portée du bruit du Terminator (${w.t.noise} m). Anneaux colorés = où chaque frère croit qu'il est. Le Terminator perçoit : ${terminatorPerceives(w).map(i => ROLES[i]).join(', ') || 'personne'}.`;
}
function render(alpha: number) {
  const lerp = (a: number, b: number) => a + (b - a) * alpha; const la = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * alpha; };
  const tx = lerp(prev.t[0], w.t.x), ty = lerp(prev.t[1], w.t.y), tf = la(prev.t[2], w.t.facing);
  term.position.set(tx, 0, ty); term.rotation.y = -tf; fistM.position.x = w.t.fistCd > 8 ? 1.2 : 0.55;
  w.nls.forEach((n, i) => { const g = nlMeshes[i]; g.position.set(lerp(prev.n[i][0], n.x), 0, lerp(prev.n[i][1], n.y)); if (n.alive) g.rotation.y = -la(prev.n[i][2], n.facing); else { g.rotation.set(Math.PI / 2, 0, 0); g.position.y = 0.4; } });
  dbgGroup.visible = debug;
  if (debug) {
    w.nls.forEach((n, i) => { cones[i].visible = n.alive; cones[i].position.set(n.x, 0.05, n.y); cones[i].rotation.y = -n.facing;
      const b = n.belief; beliefs[i].visible = n.alive && b.valid; beliefs[i].position.set(b.x, 0.08 + i * 0.01, b.y); (beliefs[i].material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 1 - b.age / 50);
      links[i].visible = n.alive && b.valid; links[i].geometry.setFromPoints([new THREE.Vector3(n.x, 0.1, n.y), new THREE.Vector3(b.x, 0.1, b.y)]); links[i].computeLineDistances(); });
    noiseRing.position.set(w.t.x, 0.06, w.t.y); noiseRing.scale.setScalar(w.t.noise); tCone.position.set(w.t.x, 0.04, w.t.y); tCone.rotation.y = -w.t.facing;
  }
  // caméra ¾ haute qui suit le Terminator ; en portrait elle recule pour garder la meute dans le cadre
  const portrait = innerHeight > innerWidth;
  const sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  // paysage : caméra derrière (ouest), haute ; portrait : plus haute, pour que l'arène (24 m) tienne en largeur
  if (portrait) { camera.position.set(tx - 7 + sx, 36, ty + sz); camera.lookAt(tx + 7 + sx, 0, ty + sz); }
  else { camera.position.set(tx - 10 + sx, 22, ty + sz); camera.lookAt(tx + 8 + sx, 0, ty + sz); }
  camera.up.set(0, 1, 0);
  renderer.render(scene, camera);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = innerHeight > innerWidth ? 75 : 50; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

await loadPolicy(); resize(); startRound();
if (shot) { // capture : on avance la sim de N ticks sans attendre le temps réel, puis on rend une image
  while (w.tick < shot && !w.done) tick();
  hitstop = 0; shake = 0; prev = snap(); hud(); render(1); document.title = 'READY';
} else {
  let last = performance.now();
  const loop = (now: number) => {
    let dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (hitstop > 0) { hitstop -= dt; dt = 0; }
    if (!paused && !roundOver) { acc += dt; while (acc >= DT) { acc -= DT; tick(); if (roundOver) break; } }
    shake *= 0.85; if (tracerT > 0) { tracerT -= dt; if (tracerT <= 0) tracer.visible = false; }
    hud(); render(roundOver ? 1 : acc / DT); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
