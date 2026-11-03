// Preuves du canal d'état des chasseurs (Lot 5) : c'est un canal de **rendu**, pas une observation
// d'entraînement. On vérifie qu'il lit fidèlement `w.nls`/`NL_CFG`, qu'il ne diverge jamais de la croyance du
// tick courant, et surtout qu'il reste muet hors de la vue de contrôle (`?control=1`).
// Exécution : `node --import tsx --test test/hunter-state.test.ts` (aucun tfjs ici).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, step, NL_CFG, DT, type TAction } from '../src/sim.ts';
import { hunterState } from '../src/hunter-state.ts';
import { HUNTER_EVENT, isControlViewEnabled, publishHunterState } from '../web/hunter-channel.ts';

const IDLE: TAction = { fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false };
const HOLD = [0, 0, 0, 0];

/** Faux `window` : espionne `dispatchEvent` et porte l'URL courante. */
interface FakeWindow {
  dispatched: unknown[];
  location: { search: string };
  dispatchEvent(ev: unknown): boolean;
}
function fakeWindow(search: string): FakeWindow {
  const dispatched: unknown[] = [];
  return { dispatched, location: { search }, dispatchEvent(ev) { dispatched.push(ev); return true; } };
}
/** Installe un faux `window` (ou aucun si `null`) le temps du test, et le retire ensuite. */
function withFakeWindow<T>(win: FakeWindow | null, fn: () => T): T {
  const G = globalThis as unknown as { window?: FakeWindow };
  const saved = G.window;
  if (win) G.window = win; else delete G.window;
  try { return fn(); } finally { if (saved) G.window = saved; else delete G.window; }
}

test('1. quatre entrées, positions/orientations de w.nls, cônes de NL_CFG', () => {
  const w = newWorld(20261103);
  const states = hunterState(w);

  assert.equal(states.length, 4, 'un état par Night Lord');
  assert.deepEqual(states.map(s => s.role), [0, 1, 2, 3], 'les rôles sont ceux de w.nls');
  assert.deepEqual(states.map(s => s.name), ['Talos', 'Uzas', 'Xarl', 'Cyrion']);
  w.nls.forEach((n, i) => {
    assert.equal(states[i].x, n.x, `frère ${i} : x identique`);
    assert.equal(states[i].y, n.y, `frère ${i} : y identique`);
    assert.equal(states[i].facing, n.facing, `frère ${i} : facing identique`);
    assert.equal(states[i].visionHalf, NL_CFG.visionHalf, 'ouverture de cône lue dans NL_CFG');
    assert.equal(states[i].visionRange, NL_CFG.visionRange, 'portée de cône lue dans NL_CFG');
    assert.equal(states[i].lastAction, n.lastAction, 'dernière action recopiée');
  });
  // Le tableau est neuf : le rendu peut le garder sans retenir la simulation.
  assert.notEqual(states[0] as unknown, w.nls[0] as unknown);
});

test('2. un frère mort est signalé alive: false', () => {
  const w = newWorld(7);
  w.nls[2].alive = false;
  const states = hunterState(w);
  assert.equal(states[2].alive, false, 'Xarl tombe');
  assert.equal(states[0].alive, true);
  assert.equal(states[1].alive, true);
  assert.equal(states[3].alive, true);
});

test('3. sees/hears/vox recopient belief.seen/heard/vox au même tick (aucune divergence)', () => {
  const w = newWorld(4242);
  // Quelques ticks réels pour obtenir des croyances variées (vues, entendues, muettes) sans les inventer.
  for (let k = 0; k < 20; k++) step(w, IDLE, HOLD);
  const atTick = hunterState(w);
  w.nls.forEach((n, i) => {
    assert.equal(atTick[i].seesTarget, n.belief.seen, `tick ${w.tick}, frère ${i} : seen`);
    assert.equal(atTick[i].hearsTarget, n.belief.heard, `tick ${w.tick}, frère ${i} : heard`);
    assert.equal(atTick[i].voxActive, n.belief.vox, `tick ${w.tick}, frère ${i} : vox`);
    assert.equal(atTick[i].beliefAge, n.belief.age, `tick ${w.tick}, frère ${i} : âge`);
  });

  // Cas explicites, y compris les combinaisons que la sim n'aurait pas produites dans ces 20 ticks.
  w.nls[0].belief = { valid: true, x: 1, y: 2, age: 3, facing: 0.5, seen: true, heard: false, vox: false };
  w.nls[1].belief = { valid: true, x: 3, y: 4, age: 0, facing: null, seen: false, heard: true, vox: false };
  w.nls[2].belief = { valid: true, x: 5, y: 6, age: 7, facing: null, seen: false, heard: false, vox: true };
  w.nls[2].alive = false; // un mort garde sa dernière croyance, telle quelle
  const manual = hunterState(w);
  assert.deepEqual(
    manual.map(s => [s.seesTarget, s.hearsTarget, s.voxActive, s.beliefAge]),
    [[true, false, false, 3], [false, true, false, 0], [false, false, true, 7], [w.nls[3].belief.seen, w.nls[3].belief.heard, w.nls[3].belief.vox, w.nls[3].belief.age]],
  );
});

test('4. isControlViewEnabled : seul control=1 ouvre le canal', () => {
  assert.equal(isControlViewEnabled(''), false);
  assert.equal(isControlViewEnabled('?debug=1'), false);
  assert.equal(isControlViewEnabled('?control=1'), true);
  assert.equal(isControlViewEnabled('?control=0'), false);
  assert.equal(isControlViewEnabled('?debug=1&control=1'), true, 'les deux flags coexistent');
  assert.equal(isControlViewEnabled('?control=1&debug=1'), true);
  assert.equal(isControlViewEnabled('?control'), false, 'paramètre sans valeur');
  assert.equal(isControlViewEnabled('?control=true'), false, 'seule la valeur 1 compte');
});

test('5. publishHunterState n\'émet rien quand le canal est désactivé', () => {
  const states = hunterState(newWorld(11));

  for (const search of ['', '?debug=1', '?control=0', '?control=true']) {
    const win = fakeWindow(search);
    withFakeWindow(win, () => publishHunterState(states));
    assert.equal(win.dispatched.length, 0, `aucun événement pour "${search}"`);
  }

  // Sans hôte à événements (Node, worker) : muet, pas d'exception, même avec control=1.
  withFakeWindow(null, () => {
    assert.doesNotThrow(() => publishHunterState(states, '?control=1'));
  });

  // Contrôle positif : avec control=1, un seul événement, du bon type, avec le détail exact.
  const win = fakeWindow('?control=1');
  withFakeWindow(win, () => publishHunterState(states));
  assert.equal(win.dispatched.length, 1, 'un événement par publication');
  const ev = win.dispatched[0] as { type?: string; detail?: unknown };
  assert.equal(ev.type, HUNTER_EVENT);
  assert.equal(HUNTER_EVENT, 'cogitator:hunters');
  assert.equal(ev.detail, states, 'le détail est exactement l\'état publié');
});

test('5b. le canal n\'altère jamais la simulation (lecture seule)', () => {
  const w = newWorld(99);
  for (let k = 0; k < 5; k++) step(w, IDLE, HOLD);
  const before = JSON.stringify({ tick: w.tick, nls: w.nls, t: w.t });
  const win = fakeWindow('?control=1');
  withFakeWindow(win, () => publishHunterState(hunterState(w)));
  const after = JSON.stringify({ tick: w.tick, nls: w.nls, t: w.t });
  assert.equal(after, before, 'publier un tick ne change pas l\'état simulé');
  assert.equal(DT, 0.1, 'DT inchangé (le canal ne touche pas au pas)');
});
