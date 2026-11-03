// Balayage du plancher de bruit du Terminator : **rejouer une décision de game design**, pas réparer un bug.
//
// La question mesurée est toujours la même : « avec un plancher de N mètres, la meute retrouve-t-elle le
// Terminator ? ». Le plancher est **reverté** (PR #31) : le jeu se joue sans lui. Cet outil existe pour que la
// décision reste rejouable le jour où on voudra régler la traque — un balayage qui n'est pas rejouable est une
// anecdote, un balayage versionné est une mesure.
//
// Trois choix à ne pas « simplifier » :
//
// 1. **Rien n'est changé dans le jeu.** Le plancher est forcé par réaffectation de `T_CFG` au runtime
//    (`applyFloor`), jamais réintroduit dans `src/sim.ts` : l'outil mesure, il ne modifie pas le code mesuré.
// 2. **On mesure le chemin réel** : la meute est conduite par la politique `policies/current.json` lue en JSON,
//    via `observe/forward/softmax/sample` en JS pur (aucun tfjs), avec la graine d'échantillonnage de la manche
//    (`mulberry32(seed ^ 0x9e3779b9)`, cf. `web/main.ts`) — pas une meute scriptée qui passerait pour de
//    mauvaises raisons.
// 3. **Le branchement du plancher est sondé, pas supposé** (`floorIsWired`) : sur l'arbre où le plancher est
//    reverté, `src/sim.ts` lit encore `noiseIdle`/`noiseMove` ; écrire `T_CFG.noiseFloor` y serait un no-op et le
//    tableau serait plat pour de mauvaises raisons. L'outil le dit en clair (ligne « mode ») et émule alors le
//    plancher par les deux valeurs réellement lues.
//
// Usage (voir README) :
//   npm run sweep:noise -- --seeds 5 --ticks 200                       # petit contrôle
//   npm run sweep:noise -- --player idle --seeds 1 --seed-base 3 --ticks 400 --out mesures/sweep-noise.json
//   -> reproduit la mesure d'origine : 18 m → 0 événement, 25 m → ~310, 30 m → 443 (saturation).
import { readFileSync, writeFileSync } from 'node:fs';
import { T_CFG, newWorld, step, observe, nlFrame, dist, OBS_DIM, T_IDLE, type World, type TAction } from '../src/sim';
import { POOL, type Tactic } from '../src/tactics';
import { forward, softmax, sample, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';

// --- CLI -------------------------------------------------------------------------------------------------------
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`argument inattendu : ${a}`);
    const next = argv[i + 1];
    // `--flag` seul vaut `true` ; `--opt valeur` consomme la valeur suivante.
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = 'true';
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const DEFAULTS = { floors: '18,25,30,35,40', seeds: 20, seedBase: 900000, ticks: 400, player: 'brawler', policy: 'policies/current.json', run: 40 };
const FLOORS = (args.floors ?? DEFAULTS.floors).split(',').map(s => Number(s.trim()))
  .sort((a, b) => a - b);
if (!FLOORS.length || FLOORS.some(f => !Number.isFinite(f) || f < 0)) {
  throw new Error(`--floors invalide : « ${args.floors} » (liste de nombres ≥ 0, ex. 18,25,30,35,40)`);
}
const SEEDS = Number(args.seeds ?? DEFAULTS.seeds);
const SEED_BASE = Number(args['seed-base'] ?? DEFAULTS.seedBase);
const TICKS = Number(args.ticks ?? DEFAULTS.ticks);
if (!(SEEDS > 0) || !(TICKS > 0)) throw new Error('--seeds et --ticks doivent être > 0');
const PLAYER = args.player ?? DEFAULTS.player;
const NOISE_RUN = Number(args.run ?? DEFAULTS.run); // plafond `noiseRun` porté par le plancher ; 40 = largeur de l'arène
// La meute : soit une politique (JSON, chemin), soit un comportement de repli du jeu (`--pack naive|random`).
const PACK_ARG = args.pack ?? (args.policy ?? DEFAULTS.policy);
type Pack = 'naive' | 'random' | ActorJSON;
const PACK: Pack = PACK_ARG === 'naive' || PACK_ARG === 'random' ? PACK_ARG : loadActor(PACK_ARG);
// Garde-fou : une politique d'une autre forme d'observation produirait un `forward` silencieusement faux.
if (typeof PACK !== 'string' && PACK.obsDim !== OBS_DIM) {
  throw new Error(`politique « ${PACK_ARG} » : obsDim ${PACK.obsDim} ≠ OBS_DIM ${OBS_DIM} de src/sim.ts`);
}

function loadActor(path: string): ActorJSON {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ActorJSON;
  } catch (e) {
    throw new Error(`politique illisible « ${path} » : ${(e as Error).message} (voir --pack naive)`);
  }
}

/** Le joueur : une tactique du pool (fabrique, car certaines gardent un état), plus `idle` (scène de la régression). */
function playerFactory(name: string): () => Tactic {
  if (name === 'idle') return () => () => T_IDLE; // joueur immobile : la condition exacte de la mesure d'origine
  const mk = POOL[name];
  if (!mk) throw new Error(`joueur inconnu : « ${name} » (pool : ${Object.keys(POOL).join(', ')}, ou idle)`);
  return mk;
}

// --- Forçage du plancher au runtime ----------------------------------------------------------------------------
type Cfg = Record<string, number>;
const CFG = T_CFG as unknown as Cfg;

/**
 * Le plancher est-il **réellement lu** par `src/sim.ts` ?
 * Sonde comportementale, pas test de présence de clé : une constante peut exister sans être branchée. On pose un
 * plancher absurde, on fait un tick à l'arrêt, et on regarde le bruit produit par la simulation. Sur l'arbre où le
 * plancher est reverté (`noise = moving ? noiseMove : noiseIdle`), le bruit reste à `noiseIdle` et la sonde le voit.
 */
const PROBE = 1000;
function floorIsWired(): boolean {
  const before: Record<string, number | undefined> = {};
  for (const k of ['noiseFloor', 'noiseRun']) before[k] = CFG[k];
  try {
    CFG.noiseFloor = PROBE; CFG.noiseRun = PROBE;
    const w = newWorld(1);
    step(w, T_IDLE, [0, 0, 0, 0]);
    return w.t.noise >= PROBE;
  } finally {
    for (const k of ['noiseFloor', 'noiseRun']) {
      if (before[k] === undefined) delete CFG[k]; else CFG[k] = before[k]!;
    }
  }
}
const FLOOR_WIRED = floorIsWired();

/**
 * Force un plancher (et son plafond) pour toute la durée du balayage.
 * Pourquoi une réaffectation et non une valeur dans `T_CFG` : le plancher est une **hypothèse de mesure**, pas une
 * règle du jeu. L'écrire dans `src/sim.ts` reviendrait à trancher la décision pour pouvoir la mesurer.
 * Si le plancher n'est pas branché (arbre d'aujourd'hui), on l'émule par les deux valeurs que `sim.ts` lit
 * vraiment : bruit = plancher à l'arrêt, plafond à pleine vitesse — une marche, pas la rampe linéaire d'origine.
 */
function applyFloor(floor: number): void {
  const run = Math.max(NOISE_RUN, floor); // un plafond sous le plancher n'a pas de sens
  if (FLOOR_WIRED) { CFG.noiseFloor = floor; CFG.noiseRun = run; }
  else { CFG.noiseIdle = floor; CFG.noiseMove = run; }
}

// --- Mesure d'une graine ---------------------------------------------------------------------------------------
const NEAR = 14; // « contact » : une griffe **et** une distance minimale sous 14 m (au-delà, la meute n'a pas trouvé)
interface SeedRun {
  seed: number; events: number; contacts: number; firstContact: number | null; minDist: number;
  heardTicks: number; heardBeliefs: number; roundTicks: number; eventsToEnd: number;
  winner: 'pack' | 'terminator' | null; reason: string;
}

/**
 * Une manche : `newWorld(seed)`, joueur conduit par la tactique, meute conduite par la politique (ou le repli naïf).
 * La boucle reproduit celle du build jouable (`web/main.ts:329-338`), y compris la graine d'échantillonnage et le
 * fait qu'un Night Lord mort ne tire pas de nombre aléatoire.
 *
 * La fenêtre est **fixe** (`--ticks` ticks, 400 par défaut) et ne s'arrête pas à la fin de manche : c'est ce que
 * faisait la mesure d'origine, et s'arrêter au `done` rendrait les totaux d'événements incomparables à l'archive
 * (une meute victorieuse continue de tourner autour du Terminator abattu). La durée réelle de la manche est donc
 * reportée à part (`roundTicks`) : c'est elle qui compte pour le rythme, `events` compte la fenêtre.
 */
function runSeed(seed: number, player: () => Tactic, maxTicks: number): SeedRun {
  const w: World = newWorld(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9); // même tirage que la manche dans le jeu
  const tactic = player();
  const out: SeedRun = { seed, events: 0, contacts: 0, firstContact: null, minDist: Infinity,
    heardTicks: 0, heardBeliefs: 0, roundTicks: 0, eventsToEnd: 0, winner: null, reason: '' };
  while (w.tick < maxTicks) {
    const ta: TAction = tactic(w);
    const acts = w.nls.map((n, i) => {
      if (!n.alive) return 0;
      if (PACK === 'random') return Math.floor(rng() * 8);
      if (PACK === 'naive') { const f = nlFrame(n); return f.d < 1.6 ? 7 : 1; } // repli du jeu sans politique
      return sample(softmax(forward(PACK, observe(w, i))), rng);
    });
    step(w, ta, acts);
    // `step` vide `w.events` au tick suivant : les événements se comptent ici, sinon ils sont perdus.
    out.events += w.events.length;
    for (const e of w.events) {
      if (e.type !== 'claw' && e.type !== 'clawArm') continue;
      out.contacts++;
      if (out.firstContact === null) out.firstContact = w.tick;
    }
    let heard = false;
    for (const n of w.nls) {
      const d = dist(n.x, n.y, w.t.x, w.t.y);
      if (d < out.minDist) out.minDist = d;
      if (n.belief.heard) { heard = true; out.heardBeliefs++; } // croyance acquise par l'ouïe, Night Lord par tick
    }
    if (heard) out.heardTicks++;
    if (out.roundTicks === 0 && w.done) { out.roundTicks = w.tick; out.eventsToEnd = out.events; }
  }
  if (out.roundTicks === 0) { out.roundTicks = w.tick; out.eventsToEnd = out.events; } // pas de fin : la fenêtre fait foi
  out.minDist = +out.minDist.toFixed(3); // 3 décimales : lisible dans l'archive, sans perdre le contact
  out.winner = w.winner;
  out.reason = w.reason;
  return out;
}

interface FloorRow {
  floor: number; noiseRun: number; seeds: number; seedsOk: number; okRate: number;
  events: number; firstContactMedianTick: number | null; minDist: number; heardTicks: number; heardBeliefs: number;
  packWins: number; meanRoundTicks: number; perSeed: SeedRun[];
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1);
};

function sweepFloor(floor: number, player: () => Tactic): FloorRow {
  applyFloor(floor);
  const perSeed: SeedRun[] = [];
  for (let g = 0; g < SEEDS; g++) perSeed.push(runSeed(SEED_BASE + g, player, TICKS));
  const ok = perSeed.filter(r => r.contacts >= 1 && r.minDist < NEAR);
  return {
    floor, noiseRun: Math.max(NOISE_RUN, floor), seeds: SEEDS, seedsOk: ok.length, okRate: +(ok.length / SEEDS).toFixed(3),
    events: perSeed.reduce((a, r) => a + r.events, 0),
    firstContactMedianTick: median(perSeed.map(r => r.firstContact).filter((t): t is number => t !== null)),
    minDist: +Math.min(...perSeed.map(r => r.minDist)).toFixed(2),
    heardTicks: perSeed.reduce((a, r) => a + r.heardTicks, 0),
    heardBeliefs: perSeed.reduce((a, r) => a + r.heardBeliefs, 0),
    packWins: perSeed.filter(r => r.winner === 'pack').length,
    meanRoundTicks: +(perSeed.reduce((a, r) => a + r.roundTicks, 0) / SEEDS).toFixed(0),
    perSeed,
  };
}

// --- Sortie ----------------------------------------------------------------------------------------------------
const player = playerFactory(PLAYER);
const packLabel = typeof PACK === 'string' ? PACK : PACK_ARG;
const rows = FLOORS.map(f => sweepFloor(f, player));

console.log(`# balayage du plancher de bruit — joueur ${PLAYER}, meute ${packLabel}, ${SEEDS} graine(s) `
  + `(base ${SEED_BASE}), ${TICKS} ticks max, plafond ${NOISE_RUN} m`);
if (!FLOOR_WIRED) {
  console.log('# mode : plancher NON branché dans src/sim.ts (revert #31) → émulé par noiseIdle=plancher / '
    + 'noiseMove=plafond (paliers, pas la rampe linéaire d\'origine).');
} else {
  console.log('# mode : plancher branché (T_CFG.noiseFloor / noiseRun lus par src/sim.ts), rampe linéaire réelle.');
}

const head = ['plancher', `graines OK (griffe + < ${NEAR} m)`, 'événements', '1er contact (méd.)', 'dist. min', 'ticks-ouïe', 'meute gagne'];
const cells = rows.map(r => [
  `${r.floor} m`, `${r.seedsOk}/${r.seeds}`, String(r.events),
  r.firstContactMedianTick === null ? '—' : `tick ${r.firstContactMedianTick}`,
  `${r.minDist.toFixed(2)} m`, String(r.heardTicks), `${r.packWins}/${r.seeds}`,
]);
const widths = head.map((h, i) => Math.max(h.length, ...cells.map(c => c[i].length)));
const line = (c: string[]) => c.map((v, i) => (i === 0 ? v.padEnd(widths[i]) : v.padStart(widths[i]))).join('  ');
console.log(line(head));
console.log(widths.map(w => '─'.repeat(w)).join('  '));
for (const c of cells) console.log(line(c));

const report = {
  tool: 'sweep-noise',
  // `clawWindup: true` : `newWorld(seed)` sans options ⇒ armement des griffes actif, donc les règles réellement jouées.
  config: { floors: FLOORS, seeds: SEEDS, seedBase: SEED_BASE, ticks: TICKS, player: PLAYER, pack: packLabel,
    floorWired: FLOOR_WIRED, noiseRun: NOISE_RUN, nearMetres: NEAR, clawWindup: true },
  results: rows,
};
if (args.out) { writeFileSync(args.out, `${JSON.stringify(report, null, 1)}\n`); console.log(`\n# JSON écrit : ${args.out}`); }
