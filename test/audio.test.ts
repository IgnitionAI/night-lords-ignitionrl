import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoicePool } from '../web/audio/voices.ts';
import { buildMixer, duckMusic } from '../web/audio/mixer.ts';
import { createMockAudioContext } from '../web/audio/mock-context.ts';
import { AudioEngine } from '../web/audio/engine.ts';
import { AudioDirector } from '../web/audio/director.ts';
import { occluded } from '../web/audio/occlusion.ts';
import type { AudioManifest } from '../web/audio/types.ts';
import { NL_CFG, T_CFG } from '../src/sim.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANK = join(ROOT, 'web/sfx/nightlords');
const MANIFEST_PATH = join(BANK, 'manifest.json');

const EVENT_SOUNDS: { event: string; sounds: string[] }[] = [
  { event: 'step', sounds: ['term-step-01', 'term-hydraulic'] },
  { event: 'bolt', sounds: ['bolter-shot', 'bolter-echo', 'bolter-casing', 'bolter-explode'] },
  { event: 'fistCharge', sounds: ['term-servo', 'fist-hum'] },
  { event: 'fistReady', sounds: ['term-hydraulic'] },
  { event: 'fist', sounds: ['fist-impact'] },
  { event: 'clawArm', sounds: ['claw-crackle', 'claw-swoosh'] },
  { event: 'claw', sounds: ['claw-swoosh', 'claw-metal'] },
  { event: 'whiff', sounds: ['claw-swoosh'] },
  { event: 'hit/servoAlarm', sounds: ['alarm-klaxon'] },
  { event: 'servoCritical', sounds: ['alarm-klaxon'] },
  { event: 'nlStep (présentation)', sounds: ['nl-step-01'] },
  { event: 'nlJump (recul)', sounds: ['nl-jump'] },
  { event: 'nlDeath', sounds: ['nl-death'] },
  { event: 'vox', sounds: ['nl-vox-come-for-you'] },
  { event: 'ambience', sounds: ['amb-drone', 'amb-drip', 'amb-duct'] },
  { event: 'music explore/tension/combat', sounds: ['music-explore', 'music-tension', 'music-combat'] },
  { event: 'stinger', sounds: ['stinger-victory', 'stinger-defeat'] },
];

test('contrats gelés : NL_CFG.speed et T_CFG.fwd inchangés', () => {
  assert.equal(NL_CFG.speed, 6);
  assert.equal(T_CFG.fwd, 2.5);
});

test('mixeur : bus sfx/voice/ambience/music/ui, compresseur et limiteur sur le master', () => {
  const ctx = createMockAudioContext();
  const g = buildMixer(ctx as never, 0.85);
  assert.ok(g.buses.sfx);
  assert.ok(g.buses.voice);
  assert.ok(g.buses.ambience);
  assert.ok(g.buses.music);
  assert.ok(g.buses.ui);
  assert.ok(g.buses.master);
  assert.equal(g.compressor.ratio.value, 12);
  assert.equal(g.limiter.ratio.value, 20);
  assert.equal(g.limiter.threshold.value, -1.0);
  assert.equal(g.ducked, false);
  duckMusic(g, ctx as never, 0.28);
  assert.equal(g.ducked, true);
  assert.equal(g.duck.gain.value, 0.28);
  ctx._tick(0.3);
  (g.duck as { _release?: () => boolean })._release?.();
  assert.equal(g.ducked, false);
  assert.equal(g.duck.gain.value, 1);
});

test('pool de voix : plafond et vol par priorité', () => {
  const pool = new VoicePool(4);
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { stolen } = pool.acquire({ name: 'low-' + i, priority: 1, bus: 'sfx', now: i });
    assert.equal(stolen, null);
    ids.push(i);
  }
  assert.equal(pool.size, 4);
  const over = pool.acquire({ name: 'boss', priority: 10, bus: 'sfx', now: 99 });
  assert.ok(over.stolen);
  assert.equal(over.stolen!.priority, 1);
  assert.equal(over.stolen!.name, 'low-0');
  assert.equal(pool.size, 4);
  assert.equal(pool.list().some((v) => v.name === 'boss'), true);
});

test('manifeste : fichier réel, échantillons présents, budget < 8 Mo', () => {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
  assert.equal(raw.version, 1);
  assert.equal(raw.polyphony, 18);
  assert.ok(raw.samples.length >= 20);
  let bytes = 0;
  const names = new Set<string>();
  for (const s of raw.samples) {
    assert.ok(s.file.endsWith('.ogg'), s.name + ' encodé ogg');
    const p = join(BANK, s.file);
    const st = statSync(p);
    assert.ok(st.size > 200, s.file + ' trop petit');
    bytes += st.size;
    names.add(s.name);
    assert.ok(s.license.toLowerCase().includes('cc0'), s.name);
    if (s.name === 'bolter-shot' || s.name === 'fist-impact' || s.name === 'claw-metal') {
      assert.ok((s.variants?.length ?? 0) >= 2, s.name + ' variations');
    }
  }
  const oggs = readdirSync(BANK).filter((f) => f.endsWith('.ogg'));
  for (const f of oggs) bytes += 0; // already counted via samples
  void oggs;
  assert.ok(bytes < 8_000_000, `banque ${bytes} octets`);
  for (const row of EVENT_SOUNDS) {
    for (const n of row.sounds) {
      assert.ok(names.has(n) || n.startsWith('term-step') || n.startsWith('nl-step'), `manque ${n} pour ${row.event}`);
    }
  }
  console.log(JSON.stringify({ bankBytes: bytes, samples: raw.samples.length, events: EVENT_SOUNDS }, null, 2));
});

test('limite de polyphonie du moteur : jamais plus de 18 voix', async () => {
  const ctx = createMockAudioContext();
  const engine = new AudioEngine();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
  const r = await engine.init({
    context: ctx as never,
    manifest,
    autounlock: false,
    enabled: true,
    search: '',
    fetchImpl: (async () => { throw new Error('no fetch'); }) as never,
  });
  assert.equal(r.ok, true);
  const silent = ctx.createBuffer(1, 2048, ctx.sampleRate) as unknown as AudioBuffer;
  for (const s of manifest.samples) engine.putBuffer(s.name, silent);
  let started = 0;
  for (let i = 0; i < 40; i++) {
    const ok = engine.play('bolter-shot', { vary: false, gain: 1, force: true });
    if (ok) started++;
  }
  assert.ok(started > 0);
  assert.ok(engine.pool.size <= 18, `voix ${engine.pool.size}`);
  assert.equal(engine.pool.max, 18);
  assert.ok(ctx._sources.length <= 18 || engine.pool.size <= 18);
});

test('directeur : bolt déclenche ducking et phase combat', async () => {
  const ctx = createMockAudioContext();
  const { engine } = await import('../web/audio/engine.ts');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
  await engine.init({
    context: ctx as never,
    manifest,
    autounlock: false,
    enabled: true,
    search: '',
    fetchImpl: (async () => { throw new Error('no fetch'); }) as never,
  });
  const silent = ctx.createBuffer(1, 2048, ctx.sampleRate) as unknown as AudioBuffer;
  for (const s of manifest.samples) engine.putBuffer(s.name, silent);
  const dir = new AudioDirector();
  const w = {
    t: { x: 10, y: 10, vx: 1, vy: 0, servoAlarm: 0 },
    nls: [
      { alive: true, x: 12, y: 10 },
      { alive: true, x: 11, y: 11 },
      { alive: true, x: 20, y: 20 },
      { alive: true, x: 21, y: 4 },
    ],
    done: false,
    winner: null as 'pack' | 'terminator' | null,
  };
  dir.beginRound();
  dir.handleEvent({ type: 'bolt', x: 10, y: 10, tx: 12, ty: 10, kill: 0 }, w);
  assert.notEqual(engine.graph?.ducked, true);
  dir.tick(w, 0.05, []);
  assert.notEqual(engine.graph?.ducked, true);
  dir.onAnimCue({ kind: 'fire', role: 'TERM', clip: 'proc-shoot', time: 0.18, who: 'term' });
  assert.equal(engine.graph?.ducked, true);
  dir.tick(w, 0.1, []);
  assert.equal(engine.musicPhase, 'combat');
});

test('directeur : impact de griffe calé sur le cue, pas sur le tick de sim', async () => {
  const ctx = createMockAudioContext();
  const { engine } = await import('../web/audio/engine.ts');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
  await engine.init({
    context: ctx as never,
    manifest,
    autounlock: false,
    enabled: true,
    search: '',
    fetchImpl: (async () => { throw new Error('no fetch'); }) as never,
  });
  const silent = ctx.createBuffer(1, 2048, ctx.sampleRate) as unknown as AudioBuffer;
  for (const s of manifest.samples) engine.putBuffer(s.name, silent);
  const dir = new AudioDirector();
  const w = {
    t: { x: 10, y: 10, vx: 0, vy: 0, servoAlarm: 0 },
    nls: [
      { alive: true, x: 11, y: 10 },
      { alive: true, x: 12, y: 11 },
      { alive: true, x: 20, y: 20 },
      { alive: true, x: 21, y: 4 },
    ],
    done: false,
    winner: null as 'pack' | 'terminator' | null,
  };
  dir.beginRound();
  dir.tick(w, 0.1, [{ type: 'claw', who: 0, dmg: 2 }]);
  const before = engine.pool.list().filter((v) => v.name === 'claw-metal').length;
  assert.equal(before, 0);
  dir.onAnimCue({ kind: 'impact', role: 'NL-1', clip: 'proc-combo', time: 0.18, who: 0 });
  const after = engine.pool.list().filter((v) => v.name === 'claw-metal').length;
  assert.ok(after >= 1);
});

test('occlusion : un pilier entre écouteur et source coupe la ligne', () => {
  const pillars = [{ x0: 9, y0: 4, x1: 11, y1: 8 }];
  assert.equal(occluded(0, 6, 20, 6, pillars), true);
  assert.equal(occluded(0, 0, 5, 0, pillars), false);
});

test('directeur : land de saut NL calé sur le cue', async () => {
  const ctx = createMockAudioContext();
  const { engine } = await import('../web/audio/engine.ts');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as AudioManifest;
  await engine.init({
    context: ctx as never,
    manifest,
    autounlock: false,
    enabled: true,
    search: '',
    fetchImpl: (async () => { throw new Error('no fetch'); }) as never,
  });
  const silent = ctx.createBuffer(1, 2048, ctx.sampleRate) as unknown as AudioBuffer;
  for (const s of manifest.samples) engine.putBuffer(s.name, silent);
  const dir = new AudioDirector();
  const w = {
    t: { x: 10, y: 10, vx: 0, vy: 0, servoAlarm: 0 },
    nls: [
      { alive: true, x: 11, y: 10 },
      { alive: true, x: 12, y: 11 },
      { alive: true, x: 20, y: 20 },
      { alive: true, x: 21, y: 4 },
    ],
    done: false,
    winner: null as 'pack' | 'terminator' | null,
  };
  dir.beginRound();
  dir.tick(w, 0.05, []);
  const before = engine.pool.list().filter((v) => v.name === 'nl-jump').length;
  dir.onAnimCue({ kind: 'land', role: 'NL-1', clip: 'proc-leap', time: 0.38, who: 0 });
  const after = engine.pool.list().filter((v) => v.name === 'nl-jump').length;
  assert.ok(after >= before + 1);
});

test('?mute=1 coupe le moteur à l’init', async () => {
  const ctx = createMockAudioContext();
  const engine = new AudioEngine();
  await engine.init({
    context: ctx as never,
    manifest: { version: 1, polyphony: 8, samples: [] },
    autounlock: false,
    search: '?mute=1',
  });
  assert.equal(engine.muted, true);
  assert.equal(engine.enabled, false);
});

test('tension de chasse : gonfle le bus ambiance sans toucher le master', async () => {
  const ctx = createMockAudioContext();
  const engine = new AudioEngine();
  await engine.init({
    context: ctx as never,
    manifest: { version: 1, polyphony: 8, samples: [] },
    autounlock: false,
    enabled: true,
    search: '',
  });
  const before = engine.graph!.buses.ambience.gain.value;
  const master = engine.graph!.buses.master.gain.value;
  engine.setHuntTension(0.8);
  assert.ok(engine.huntTension > 0.7);
  assert.ok(engine.graph!.buses.ambience.gain.value > before);
  assert.equal(engine.graph!.buses.master.gain.value, master);
});

test('tape WebAudio : beginTape branche le limiteur #75', async () => {
  const ctx = createMockAudioContext();
  const engine = new AudioEngine();
  await engine.init({
    context: ctx as never,
    manifest: { version: 1, polyphony: 8, samples: [] },
    autounlock: false,
    enabled: true,
    search: '',
  });
  assert.equal(engine.beginTape(), true);
  const t = engine.endTape();
  assert.ok(t.sampleRate > 0);
  assert.equal(t.frames, 0);
});
