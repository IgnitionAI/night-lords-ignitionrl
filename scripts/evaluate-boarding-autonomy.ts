import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createOperation } from '../src/strategy/engine';
import { boardingAction } from '../src/strategy/boarding-agents';
import type { ActorJSON } from '../src/policy';
import { loyalistPlan, EVAL_SEEDS } from './boarding-scenarios';
import { reservedOpponent } from './boarding-holdout';
import { actorPath, advance, commanderViews, digest, evidence, initialActor, missions, readJSON, runRoot, seeds } from './boarding-experiment';

type Mode = 'model' | 'fixed' | 'heuristic' | 'hybrid';
const development = { seeds: [36007, 36009, 36010], styles: [0, 1, 2, 6, 7, 8] };
const diagnostic = { seeds: EVAL_SEEDS, styles: [0, 1, 2, 9, 10, 11, 12, 13, 14] };
const reserved = { seeds: EVAL_SEEDS, styles: [15, 16, 17, 18, 19, 20] };
const families = ['imitation', 'reminders', 'ordinary', 'candidate'] as const;
type Family = typeof families[number];
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const fileHash = (file: string) => digest(readFileSync(file));

function matches(suite: typeof diagnostic, mode: Mode, actor: ActorJSON) {
  const rows = [];
  for (const mission of missions) for (const style of suite.styles) for (const seed of suite.seeds) {
    const w = createOperation(seed, mission);
    let intents = [-1, -1], activePairTurns = 0, distinctObjectives = 0;
    const objectiveCounts = [[0, 0, 0], [0, 0, 0]], allActions = Array<number>(12).fill(0);
    while (!w.winner) {
      const views = commanderViews(w);
      const actions = views.map((v, i) => {
        if (mode === 'fixed') return i === 0 ? 0 : 2;
        const ally = intents[1 - i];
        if (mode === 'heuristic') return boardingAction(v, ally);
        const action = boardingAction(v, ally, actor);
        return mode === 'hybrid' ? action - action % 3 + boardingAction(v, ally) % 3 : action;
      });
      actions.forEach((a, i) => {
        if (views[i].units.length) objectiveCounts[i][a % 3]++;
        allActions[a]++;
      });
      if (views.every(v => v.units.length > 0)) {
        activePairTurns++;
        distinctObjectives += Number(actions[0] % 3 !== actions[1] % 3);
      }
      const player = style >= 15 ? reservedOpponent(w, style) : loyalistPlan(w, style);
      advance(w, views, actions, player);
      intents = actions;
    }
    rows.push({ mission, style, seed, winner: w.winner, score: w.score, turns: w.history.length,
      activePairTurns, distinctObjectives, objectiveCounts, allActions });
  }
  return rows;
}
type Rows = ReturnType<typeof matches>;
function summary(rows: Rows) {
  const counts = [[0,0,0],[0,0,0]];
  for (const r of rows) for (const [i, group] of r.objectiveCounts.entries()) group.forEach((n, a) => counts[i][a] += n);
  const pairTurns = rows.reduce((s, r) => s + r.activePairTurns, 0);
  return { games: rows.length, wins: rows.filter(r => r.winner === 'nightlords').length,
    draws: rows.filter(r => r.winner === 'draw').length,
    margin: rows.reduce((s, r) => s + r.score.nightlords - r.score.imperium, 0) / rows.length,
    missionWins: missions.map(m => rows.filter(r => r.mission === m && r.winner === 'nightlords').length),
    objectivesByCommander: counts, activePairTurns: pairTurns,
    splitRate: rows.reduce((s, r) => s + r.distinctObjectives, 0) / pairTurns };
}
type Entry = { family: Family; update: number; seed: number; hash: string; development: ReturnType<typeof summary> };
type Selection = { checkpoints: Entry[]; perSeed: Entry[]; selected: Record<Family, Entry> };
function rank(a: Entry, b: Entry) {
  return b.development.wins - a.development.wins || b.development.margin - a.development.margin
    || a.update - b.update || a.seed - b.seed;
}
function atSeed(seed: number) {
  assert.ok(seeds.includes(seed));
  const entries: Entry[] = [];
  for (const family of families) for (const update of family === 'imitation' ? [0] : family === 'reminders' ? [30] : [45, 90]) {
    const path = actorPath(seed, family, update);
    entries.push({family, seed, update, hash: fileHash(path), development: summary(matches(development, 'model', readJSON(path)))});
  }
  write(runRoot + '/select-' + seed + '.json', entries);
}
function freeze() {
  const checkpoints: Entry[] = seeds.flatMap(seed => readJSON(runRoot + '/select-' + seed + '.json'));
  const perSeed = seeds.flatMap(seed => families.map(family => checkpoints.filter(e => e.seed === seed && e.family === family).sort(rank)[0]));
  const selected = Object.fromEntries(families.map(family => [family, perSeed.filter(e => e.family === family).sort(rank)[0]]));
  const actors = Object.fromEntries(perSeed.map(e => [e.hash,readJSON(actorPath(e.seed,e.family,e.update))]));
  const archive = gzipSync(JSON.stringify(actors));
  writeFileSync(evidence + '/acteurs.json.gz', archive);
  write(evidence + '/selection.json', {checkpoints, perSeed, selected, archiveSHA256:digest(archive)});
  console.log('Selected', Object.values(selected).map(e => [e.family, e.seed, e.update, e.development.wins]));
}
function test(id: string) {
  const frozen: Selection & {archiveSHA256:string} = readJSON(evidence + '/selection.json');
  const shipped = initialActor();
  const results: Record<string,{diagnostic: Rows; reserved: Rows}> = {};
  const run = (key: string, mode: Mode, actor: ActorJSON) => {
    results[key] = {diagnostic: matches(diagnostic, mode, actor), reserved: matches(reserved, mode, actor)};
  };
  if (id === 'references') {
    for (const mode of ['fixed', 'heuristic', 'hybrid', 'model'] as const) run(mode === 'model' ? 'shipped' : mode, mode, shipped);
    assert.equal(summary(results.shipped.diagnostic).wins, 47);
    assert.equal(summary(results.hybrid.diagnostic).wins, 66);
  } else {
    const seed = Number(id); assert.ok(seeds.includes(seed));
    const archive = readFileSync(evidence + '/acteurs.json.gz');
    assert.equal(digest(archive), frozen.archiveSHA256);
    const actors = JSON.parse(gunzipSync(archive).toString());
    for (const e of frozen.perSeed.filter(e => e.seed === seed)) {
      const actor = actors[e.hash];
      assert.equal(digest(JSON.stringify(actor)), e.hash);
      run(e.family + '-' + seed, 'model', actor);
    }
  }
  write(runRoot + '/test-' + id + '.json', results);
}
function paired(a: Rows, b: Rows) {
  assert.equal(a.length,b.length);
  let gained = 0, lost = 0;
  a.forEach((r, i) => {
    const other = b[i];
    assert.deepEqual([r.mission,r.seed,r.style],[other.mission,other.seed,other.style]);
    const won = r.winner === 'nightlords', wasWin = other.winner === 'nightlords';
    gained += Number(won && !wasWin); lost += Number(!won && wasWin);
  });
  return {gained,lost,net:gained-lost};
}
function verdict() {
  const frozen: Selection = readJSON(evidence + '/selection.json');
  const data: Record<string,{diagnostic: Rows; reserved: Rows}> =
    Object.assign({}, ...['references', ...seeds].map(id => readJSON(runRoot + '/test-' + id + '.json')));
  const scores = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, {diagnostic:summary(v.diagnostic), reserved:summary(v.reserved)}]));
  const selected = (family: Family) => family + '-' + frozen.selected[family].seed;
  const candidate = selected('candidate');
  const pairedResults = Object.fromEntries(['shipped','fixed','heuristic','hybrid',...families.filter(x => x !== 'candidate').map(selected)].map(k => [
    k, {diagnostic:paired(data[candidate].diagnostic,data[k].diagnostic),reserved:paired(data[candidate].reserved,data[k].reserved)}]));
  const repetitions = seeds.map(seed => {
    const key = (family:Family) => data[family+'-'+seed].reserved;
    return {seed, versusImitation:paired(key('candidate'),key('imitation')),versusReminders:paired(key('candidate'),key('reminders')),
      versusOrdinary:paired(key('candidate'),key('ordinary'))};
  });
  const replicated = repetitions.filter(r => r.versusImitation.net > 0 && r.versusReminders.net > 0).length;
  const ppoGain = replicated >= 2 && ['shipped',selected('imitation'),selected('reminders'),selected('ordinary')].every(k => pairedResults[k].reserved.net > 0);
  const integrate = ppoGain && pairedResults.shipped.diagnostic.net > 0;
  writeFileSync(evidence + '/parties.json.gz', gzipSync(JSON.stringify(data)));
  write(evidence + '/resultats.json', {selectionSHA256:fileHash(evidence+'/selection.json'), candidate, scores, pairedResults, repetitions, replicated, ppoGain, integrate});
  console.log('Selected results', ...['shipped','fixed','heuristic','hybrid',...families.map(selected)].map(k => [k,scores[k].diagnostic.wins,scores[k].reserved.wins]));
  console.log('Matched repetitions', repetitions, {replicated,ppoGain,integrate});
}
const [command, id] = process.argv.slice(2);
mkdirSync(runRoot, {recursive:true});
if (command === 'select') atSeed(Number(id));
else if (command === 'freeze') freeze();
else if (command === 'test') test(id);
else if (command === 'verdict') verdict();
else throw Error('Use select <seed>, freeze, test <seed|references>, or verdict');
