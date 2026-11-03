// Tests du plancher de bruit du Terminator (régression de conception « la meute ne trouve plus le Terminator »).
// L'intention de game design : un Terminator est **bruyant** (servomoteurs, armure, réacteurs) et ne peut pas être
// silencieux, même à l'arrêt. La meute n'a que la vue (12 m, cône), la vox (14 m) et l'ouïe (`dist ≤ t.noise`) pour
// réacquérir ; depuis l'inertie, le Terminator plafonne à 1,5-2,5 m/s et ne traverse plus les cônes de vision.
// Sans bruit de fond, une forteresse lente devient invisible dès que la meute est partie à la balise.
//
// Le premier test marche sur le **chemin réel du build jouable** (`web/main.ts:329-333`) : politique entraînée
// `policies/current.json` (`b3@2000`) lue en JSON, `observe/forward/softmax/sample` en JS pur (aucun tfjs),
// `newWorld(3)`, joueur immobile. Un test qui rejoue une meute scriptée ne prouve rien : il passe aussi avec un
// plancher de 18 m, qui ne réveille jamais la meute (voir les chiffres mesurés ci-dessous).
//
// Chemin réel, graine 3, 400 ticks (mesures qui ont fixé le seuil ; « ticks-ouïe » = Night Lord × tick,
// c'est-à-dire la somme des 4 croyances, l'unité des mesures qui ont décidé du seuil) :
//   plancher  18 m :   0 événement, distance min 23,1 m,   0 ticks-ouïe   <- le bug (rien ne se passe)
//   plancher  23 m :   0 événement, distance min 23,1 m,   0 ticks-ouïe   (grille fine)
//   plancher  24 m : 243 événements, distance min 0,6 m,  79 ticks-ouïe   (premier contact à 61)
//   plancher  25 m : 310 événements, distance min 1,0 m, 239 ticks-ouïe   (palier de la mesure d'origine)
//   plancher  30 m : 443 événements, distance min 0,5 m, 184 ticks-ouïe   (saturation, valeur retenue)
//   plancher  40 m : 443 événements, distance min 0,5 m, 184 ticks-ouïe   (identique à 30 m)
// La meute s'établit à 23,1 m (elle marche à la balise, sa croyance initiale) : un plancher sous cette distance ne
// franchit pas là où elle se stabilise, donc elle n'entend jamais. Le basculement est entre 23 et 24 m ; 25 m est
// le premier palier de la mesure d'origine et 30 m sature.
// Au plancher retenu, le test mesure 443 événements, premier contact au tick 67, 0,48 m et **53 ticks** où au moins
// un Night Lord a `belief.heard` (53 ticks × jusqu'à 4 frères ≈ les 184 croyances ci-dessus).
// Exécution : `npm test` (ou `node --import tsx --test test/perception.test.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newWorld, step, observe, dist, T_CFG, OBS_DIM, NL_CFG, T_IDLE, type World, type TAction } from '../src/sim.ts';
import { forward, softmax, sample, type ActorJSON } from '../src/policy.ts';
import { mulberry32 } from '../src/rng.ts';

const SPEED = 400; // ticks mesurés : la manche se joue bien avant, la fenêtre couvre le pire cas
const SEED = 3; // la graine exacte de la régression

/** La politique entraînée du build jouable, lue en JSON : `forward/softmax/sample` sont en JS pur. */
function loadActor(): ActorJSON {
  return JSON.parse(readFileSync(new URL('../policies/current.json', import.meta.url), 'utf8')) as ActorJSON;
}

interface Playback {
  world: World;
  events: number; // tous les événements de simulation (claw, clawArm, hit, whiff…)
  contacts: number; // claw + clawArm : la meute a touché
  firstContact: number | null;
  minDist: number;
  heardTicks: number; // ticks où au moins un Night Lord vivant a `belief.heard`
}

/** Rejoue le tick du build jouable, joueur immobile, meute pilotée par la politique (cf. `web/main.ts:329-333`). */
function playback(actor: ActorJSON): Playback {
  const world = newWorld(SEED);
  // Même graine d'échantillonnage que `web/main.ts:243` : une manche = `mulberry32(seed ^ 0x9e3779b9)`.
  const rng = mulberry32(SEED ^ 0x9e3779b9);
  const out: Playback = { world, events: 0, contacts: 0, firstContact: null, minDist: Infinity, heardTicks: 0 };
  const ta: TAction = T_IDLE; // joueur immobile
  for (let i = 0; i < SPEED; i++) {
    // Exactement la boucle de `web/main.ts:329-333` : un mort ne tire pas de nombre aléatoire.
    const acts = world.nls.map((n, idx) => {
      if (!n.alive) return 0;
      const p = softmax(forward(actor, observe(world, idx)));
      return sample(p, rng);
    });
    step(world, ta, acts);
    out.events += world.events.length;
    for (const e of world.events) if (e.type === 'claw' || e.type === 'clawArm') {
      out.contacts++;
      if (out.firstContact === null) out.firstContact = world.tick;
    }
    let heard = false;
    for (const n of world.nls) {
      const d = dist(n.x, n.y, world.t.x, world.t.y);
      if (d < out.minDist) out.minDist = d;
      if (n.belief.heard) heard = true;
    }
    if (heard) out.heardTicks++;
  }
  return out;
}

test('1. chemin réel (policies/current.json, graine 3, joueur immobile) : la meute trouve, touche et entend', (t) => {
  const actor = loadActor();
  assert.equal(actor.obsDim, OBS_DIM, 'la politique est bien celle des 32 observations de `observe`');

  const r = playback(actor);
  // Diagnostic complet dans chaque message : les trois mesures qui ont fixé le seuil, pour lire l'échec d'un coup.
  const diag = `[plancher ${T_CFG.noiseFloor} m / plafond ${T_CFG.noiseRun} m : ${r.events} événements, ` +
    `1er contact ${r.firstContact ?? '—'}, distance min ${r.minDist.toFixed(2)} m, ${r.heardTicks} ticks-ouïe]`;
  t.diagnostic(diag);

  // 1. au moins un contact : avec un plancher de 18 m la meute s'établit à 23 m et n'émet **rien** du tout.
  assert.ok(r.contacts >= 1,
    `au moins un contact (claw/clawArm) attendu, obtenu ${r.contacts} — 0 signifie que la meute n'a pas trouvé ` +
    `le Terminator (plancher de bruit trop court) ${diag}`);

  // 2. elle entre vraiment au contact : < 5 m, pas seulement « dans l'ouïe ».
  assert.ok(r.minDist < 5,
    `distance minimale ${r.minDist.toFixed(2)} m : doit passer sous 5 m (à 18 m de plancher elle reste à ~23 m) ${diag}`);

  // 3. c'est bien l'**ouïe** qui l'a réveillée : une croyance acquise par le bruit de fond, pas par la vue/vox.
  assert.ok(r.heardTicks >= 1,
    `aucun tick avec belief.heard : la meute n'a jamais entendu le Terminator (bruit min = ${T_CFG.noiseFloor} m, ` +
    `la meute se stabilise à 23-29 m) ${diag}`);
  // La vue (14 m) et la vox (14 m) sont plus courtes que le plancher : l'acquisition initiale ne peut être qu'auditive.
  assert.ok(T_CFG.noiseFloor > NL_CFG.visionRange && T_CFG.noiseFloor > NL_CFG.voxRange,
    `le plancher (${T_CFG.noiseFloor} m) doit dépasser la vue et la vox (${NL_CFG.visionRange} m)`);
});

test('1 bis. le test est déterministe : deux rejeux donnent le même déroulé', () => {
  const actor = loadActor();
  const a = playback(actor), b = playback(actor);
  assert.deepEqual(
    { events: a.events, contacts: a.contacts, firstContact: a.firstContact, minDist: a.minDist, heardTicks: a.heardTicks },
    { events: b.events, contacts: b.contacts, firstContact: b.firstContact, minDist: b.minDist, heardTicks: b.heardTicks },
  );
});

// --- Fixture des tests de formule : Terminator à (3, 12) face à +x, meute qui tient sa position ----------------
/** Monde sans obstacle sur le trajet testé : Terminator à (3, 12) face à +x, meute au fond (x 26-38). */
function arena(seed = 20261103): World {
  return newWorld(seed, { x: 3, y: 12, facing: 0 });
}
/** La meute tient sa position : les tests 2 à 4 ne parlent que du bruit du Terminator. */
const HOLD = [0, 0, 0, 0];
const speedOf = (w: World) => Math.hypot(w.t.vx, w.t.vy);

test('2. plancher : à l\'arrêt, t.noise ne descend jamais sous noiseFloor (100 ticks)', () => {
  const w = arena();
  for (let i = 0; i < 100; i++) {
    step(w, T_IDLE, HOLD);
    assert.ok(w.t.noise >= T_CFG.noiseFloor, `tick ${w.tick} : bruit ${w.t.noise} < plancher ${T_CFG.noiseFloor}`);
  }
  assert.equal(w.t.moving, false, 'le Terminator est bien à l\'arrêt');
  assert.equal(w.t.noise, T_CFG.noiseFloor, 'à l\'arrêt, le bruit vaut exactement le plancher');
});

test('3. plafond : à vitesse maximale, t.noise atteint noiseRun (à ±1 m)', () => {
  const w = arena();
  for (let i = 0; i < 30; i++) step(w, { ...T_IDLE, fwd: 1 }, HOLD);
  assert.ok(Math.abs(speedOf(w) - T_CFG.fwd) < 1e-9, 'vitesse stabilisée à T_CFG.fwd');
  assert.ok(Math.abs(w.t.noise - T_CFG.noiseRun) <= 1,
    `bruit ${w.t.noise.toFixed(2)} m à pleine vitesse : attendu noiseRun = ${T_CFG.noiseRun} m (±1)`);
  assert.ok(w.t.noise >= T_CFG.noiseFloor, 'la montée part du plancher, elle ne le franchit pas à la baisse');
});

test('4. un geste ne baisse pas le fond : bolter puis retour au plancher, gantelet sous le plancher', () => {
  const w = arena();
  for (let i = 0; i < 10; i++) step(w, T_IDLE, HOLD);
  assert.equal(w.t.noise, T_CFG.noiseFloor, 'bruit de fond à l\'arrêt avant le geste');

  // Bolter : `Math.max(bruit de fond, noiseBolt)` — le tir ne peut pas rendre le Terminator plus silencieux.
  step(w, { ...T_IDLE, bolt: true }, HOLD);
  assert.ok(w.events.some(e => e.type === 'bolt'), 'le bolter a bien tiré');
  assert.ok(w.t.noise >= T_CFG.noiseBolt, `tick du tir : bruit ${w.t.noise} ≥ noiseBolt ${T_CFG.noiseBolt}`);
  assert.ok(w.t.noise >= T_CFG.noiseFloor, 'le tir ne descend pas sous le plancher');

  // Tick suivant, à l'arrêt : le fond, pas moins — le `max` du tick précédent n'a rien « consommé ».
  step(w, T_IDLE, HOLD);
  assert.equal(w.t.noise, T_CFG.noiseFloor, 'au tick suivant, le bruit revient au plancher, jamais en dessous');

  // Gantelet : `noiseFist` (12) est **sous** le plancher (30). Le `max` doit garder le fond : un geste discret ne
  // rend pas le Terminator plus silencieux que ses servomoteurs.
  assert.ok(T_CFG.noiseFist < T_CFG.noiseFloor, 'hypothèse du test : le geste est moins bruyant que le moteur');
  assert.ok(T_CFG.noiseBolt <= T_CFG.noiseFloor, 'hypothèse du test : même le bolter ne dépasse pas le plancher');
  step(w, { ...T_IDLE, fist: true }, HOLD);
  assert.ok(w.events.some(e => e.type === 'fistCharge'), 'le gantelet est engagé');
  assert.equal(w.t.noise, T_CFG.noiseFloor, 'la charge du gantelet ne rabaisse pas le bruit de fond');
  step(w, T_IDLE, HOLD);
  assert.ok(w.t.noise >= T_CFG.noiseFloor, 'la charge en cours ne rabaisse pas le fond au tick suivant');
});
