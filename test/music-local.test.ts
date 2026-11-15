import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAudioContext } from '../web/audio/mock-context.ts';
import { AudioEngine } from '../web/audio/engine.ts';
import { LOCAL_MUSIC_NAMES, localMusicBase, mergeLocalMusic, musicCreditMarkup } from '../web/audio/music-local.ts';
import type { AudioManifest } from '../web/audio/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = JSON.parse(readFileSync(join(ROOT, 'web/sfx/nightlords/manifest.json'), 'utf8')) as AudioManifest;
const EXAMPLE = JSON.parse(readFileSync(join(ROOT, 'web/sfx/music-local.example/manifest.json'), 'utf8'));
const CREDIT = 'Musique : Artiste — Titre (lien)';
const BASE = '/web/sfx/nightlords/';
const LOCAL = '/web/sfx/music-local/';

/** fetch simulé : une table url → réponse ; tout le reste répond 404. */
function fakeFetch(routes: Record<string, unknown>, log: string[] = []): typeof fetch {
  return (async (input: string) => {
    const url = String(input);
    log.push(url);
    if (!(url in routes)) return { ok: false, status: 404, json: async () => { throw new Error('404'); }, arrayBuffer: async () => new ArrayBuffer(0) };
    const body = routes[url];
    return {
      ok: true,
      status: 200,
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
      arrayBuffer: async () => new ArrayBuffer(64),
    };
  }) as never;
}

function bankRoutes(): Record<string, unknown> {
  const r: Record<string, unknown> = { [BASE + 'manifest.json']: MAIN };
  for (const s of MAIN.samples) {
    for (const f of [s.file, ...(s.variants ?? [])]) r[BASE + f] = 'audio';
  }
  return r;
}

async function settle() { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); }

test('music-local : dossier dérivé de la base de la banque', () => {
  assert.equal(localMusicBase('/web/sfx/nightlords/'), LOCAL);
  assert.equal(localMusicBase('/web/sfx/nightlords'), LOCAL);
});

test('music-local : la fusion remplace seulement les 3 boucles musique', () => {
  const m = mergeLocalMusic(MAIN, EXAMPLE, LOCAL);
  assert.ok(m);
  assert.deepEqual([...m!.replaced].sort(), [...LOCAL_MUSIC_NAMES].sort());
  assert.equal(m!.manifest.samples.length, MAIN.samples.length);
  for (const s of m!.manifest.samples) {
    const orig = MAIN.samples.find((o) => o.name === s.name)!;
    if (LOCAL_MUSIC_NAMES.includes(s.name)) {
      const l = EXAMPLE.samples.find((e: { name: string }) => e.name === s.name);
      assert.equal(s.file, l.file);
      assert.equal(s.gain, l.gain);
      assert.equal(s.credit, CREDIT);
      assert.equal(s.base, LOCAL);
      assert.equal(s.bus, 'music');
      assert.equal(s.loop, true);
    } else {
      assert.deepEqual(s, orig, s.name + ' inchangé');
    }
  }
  // le manifeste principal n'est pas muté
  assert.equal(MAIN.samples.find((s) => s.name === 'music-combat')!.file, 'music-combat.ogg');
});

test('music-local : une entrée hors musique dans le manifeste local est ignorée', () => {
  const m = mergeLocalMusic(MAIN, { samples: [{ name: 'bolter-shot', file: 'x.ogg', gain: 2 }, { name: 'music-combat', file: 'c.ogg' }] }, LOCAL)!;
  assert.deepEqual(m.replaced, ['music-combat']);
  assert.equal(m.manifest.samples.find((s) => s.name === 'bolter-shot')!.file, 'bolter-shot.ogg');
  assert.equal(m.manifest.samples.find((s) => s.name === 'music-combat')!.gain, 0.5);
});

test('music-local : manifeste local invalide → null', () => {
  assert.equal(mergeLocalMusic(MAIN, null, LOCAL), null);
  assert.equal(mergeLocalMusic(MAIN, '<!doctype html>', LOCAL), null);
  assert.equal(mergeLocalMusic(MAIN, { samples: 'non' }, LOCAL), null);
  assert.equal(mergeLocalMusic(MAIN, { samples: [] }, LOCAL), null);
  assert.equal(mergeLocalMusic(MAIN, { samples: [{ name: 'music-explore', file: '../nightlords/x.ogg' }] }, LOCAL), null);
  assert.equal(mergeLocalMusic(MAIN, { samples: [{ name: 'music-explore', file: 'x.ogg', gain: -1 }] }, LOCAL), null);
});

test('moteur : manifeste local présent → boucles chargées depuis music-local, crédit affiché', async () => {
  const log: string[] = [];
  const routes = bankRoutes();
  routes[LOCAL + 'manifest.json'] = EXAMPLE;
  for (const e of EXAMPLE.samples) routes[LOCAL + e.file] = 'audio';
  const engine = new AudioEngine();
  const seen: (string | null)[] = [];
  engine.onMusicCredit((c) => seen.push(c));
  const r = await engine.init({ context: createMockAudioContext() as never, base: BASE, manifest: 'manifest.json', autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch(routes, log) });
  assert.equal(r.ok, true);
  await settle();
  for (const e of EXAMPLE.samples) assert.ok(log.includes(LOCAL + e.file), 'charge ' + e.file);
  assert.ok(!log.includes(BASE + 'music-combat.ogg'), 'pas la boucle CC0');
  assert.ok(log.includes(BASE + 'bolter-shot.ogg'), 'le reste vient de la banque CC0');
  assert.equal(engine.musicCredit, CREDIT);
  assert.ok(seen.includes(CREDIT));
  assert.ok(musicCreditMarkup(engine.musicCredit).includes('Artiste — Titre'));
  // setMusicPhase applique le gain local
  engine.setMusicPhase('combat');
  assert.equal(engine.status().musicPhase, 'combat');
});

test('moteur : manifeste local absent (404) → banque CC0, aucun crédit, aucune erreur', async () => {
  const log: string[] = [];
  const errors: unknown[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const engine = new AudioEngine();
    const r = await engine.init({ context: createMockAudioContext() as never, base: BASE, manifest: 'manifest.json', autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch(bankRoutes(), log) });
    assert.equal(r.ok, true);
    await settle();
    assert.ok(log.includes(LOCAL + 'manifest.json'), 'le manifeste local est tenté');
    assert.ok(log.includes(BASE + 'music-explore.ogg'));
    assert.equal(engine.musicCredit, null);
    assert.equal(musicCreditMarkup(engine.musicCredit), '');
    assert.equal(engine.status().missing.length, 0);
  } finally { console.error = orig; }
  assert.equal(errors.length, 0);
});

test('moteur : manifeste local invalide → banque CC0, aucun crédit', async () => {
  const routes = bankRoutes();
  routes[LOCAL + 'manifest.json'] = { samples: 42 };
  const engine = new AudioEngine();
  const info = console.info;
  console.info = () => {};
  try {
    const r = await engine.init({ context: createMockAudioContext() as never, base: BASE, manifest: 'manifest.json', autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch(routes) });
    assert.equal(r.ok, true);
  } finally { console.info = info; }
  await settle();
  assert.equal(engine.musicCredit, null);
  assert.equal(engine.manifest!.samples.find((s) => s.name === 'music-explore')!.file, 'music-explore.ogg');
});

test('moteur : JSON local illisible (page HTML du serveur de dev) → banque CC0', async () => {
  const routes = bankRoutes();
  routes[LOCAL + 'manifest.json'] = '<!doctype html><html></html>';
  const engine = new AudioEngine();
  const r = await engine.init({ context: createMockAudioContext() as never, base: BASE, manifest: 'manifest.json', autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch(routes) });
  assert.equal(r.ok, true);
  await settle();
  assert.equal(engine.musicCredit, null);
});

test('moteur : manifeste local présent mais fichiers absents → repli CC0 par boucle, pas de crédit', async () => {
  const log: string[] = [];
  const routes = bankRoutes();
  routes[LOCAL + 'manifest.json'] = EXAMPLE;
  const engine = new AudioEngine();
  await engine.init({ context: createMockAudioContext() as never, base: BASE, manifest: 'manifest.json', autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch(routes, log) });
  await settle();
  for (const n of LOCAL_MUSIC_NAMES) {
    assert.ok(log.includes(BASE + n + '.ogg'), 'repli ' + n);
    assert.equal(engine.manifest!.samples.find((s) => s.name === n)!.file, n + '.ogg');
  }
  assert.equal(engine.status().missing.length, 0);
  assert.equal(engine.musicCredit, null);
});

test('moteur : manifeste passé en objet → pas de banque locale tentée', async () => {
  const log: string[] = [];
  const engine = new AudioEngine();
  await engine.init({ context: createMockAudioContext() as never, manifest: MAIN, autounlock: false, enabled: true, search: '', fetchImpl: fakeFetch({}, log) });
  await settle();
  assert.ok(!log.some((u) => u.includes('music-local')));
  assert.equal(engine.musicCredit, null);
});

test('crédit : balise vide sans crédit, texte échappé sinon', () => {
  assert.equal(musicCreditMarkup(null), '');
  assert.equal(musicCreditMarkup(''), '');
  assert.equal(musicCreditMarkup('a <b>'), '<div class="music-credit">a &lt;b&gt;</div>');
});
