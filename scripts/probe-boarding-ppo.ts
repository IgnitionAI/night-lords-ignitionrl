// Run with bun scripts/probe-boarding-ppo.ts. This probe never installs weights.
import { readFileSync } from 'node:fs';
import { argmax, forward, sample, softmax, type ActorJSON } from '../src/policy';
import { mulberry32 } from '../src/rng';
import { boardingAction, boardingObservation, boardingPlan } from '../src/strategy/boarding-agents';
import { createOperation, getView, resolve, shareReports } from '../src/strategy/engine';
import { MISSIONS, type MissionId } from '../src/strategy/tactics';
import { EVAL_SEEDS, loyalistPlan } from './boarding-scenarios';

const actor: ActorJSON = JSON.parse(readFileSync(new URL('../policies/boarding-actor.json', import.meta.url), 'utf8'));
const missions = Object.keys(MISSIONS) as MissionId[];
const variants = ['shipped', 'scripted', 'heuristic', 'splitOpening', 'splitThroughout', 'adaptiveObjective', 'sampled'] as const;
type Variant = typeof variants[number];
const suites = { historical: [0, 1, 2], switching: [9, 10, 11], newOpponents: [12, 13, 14] };
const archivedModes: Partial<Record<Variant, string>> = { shipped: 'ppo', scripted: 'baseline', heuristic: 'adaptive' };

function play(mission: MissionId, style: number, seed: number, variant: Variant, repeat: number) {
  const world = createOperation(seed, mission);
  const rng = mulberry32((((seed * 3 + missions.indexOf(mission)) * 16 + style) * 8) + repeat);
  let intentions = [-1, -1];
  const counts = Array<number>(actor.nAct).fill(0);
  let maxProbabilitySum = 0;
  while (!world.winner) {
    const raw = [getView(world, 0), getView(world, 1)];
    const views = raw.map((view, i) => shareReports(view, raw[1 - i]));
    const actions = views.map((view, i) => {
      const ally = intentions[1 - i];
      if (variant === 'scripted') return i === 0 ? 0 : 2;
      if (variant === 'heuristic') return boardingAction(view, ally);
      const logits = forward(actor, boardingObservation(view, ally));
      const preferred = argmax(logits);
      const probs = softmax(logits);
      maxProbabilitySum += probs[preferred];
      const posture = preferred - preferred % 3;
      if (variant === 'sampled') return sample(probs, rng);
      if (variant === 'adaptiveObjective') return posture + boardingAction(view, ally) % 3;
      if (variant === 'splitThroughout' || (variant === 'splitOpening' && view.turn === 1)) {
        return posture + (i === 0 ? 0 : 2);
      }
      return preferred;
    });
    const plans = views.map((view, i) => boardingPlan(view, actions[i]));
    const player = loyalistPlan(world, style);
    resolve(world, [...player.orders, ...plans.flatMap(p => p.orders)], [], {
      '-1': { card: player.card }, '0': { card: plans[0].card }, '1': { card: plans[1].card },
    });
    actions.forEach(action => counts[action]++);
    intentions = actions;
  }
  return { winner: world.winner, score: world.score, win: world.winner === 'nightlords', draw: world.winner === 'draw',
    margin: world.score.nightlords - world.score.imperium, counts, maxProbabilitySum };
}

const archived = JSON.parse(readFileSync(new URL('../docs/boarding/evaluation.json', import.meta.url), 'utf8'));
for (const [suite, styles] of Object.entries(suites)) {
  for (const variant of variants) {
    const repetitions = variant === 'sampled' ? 8 : 1;
    const counts = Array<number>(actor.nAct).fill(0);
    const winsByRepeat = Array<number>(repetitions).fill(0);
    const winsByMission = Array<number>(missions.length).fill(0);
    let games = 0, draws = 0, margin = 0, maxProbabilitySum = 0;
    for (const [i, mission] of missions.entries()) {
      for (const style of styles) for (const seed of EVAL_SEEDS) for (let rep = 0; rep < repetitions; rep++) {
        const result = play(mission, style, seed, variant, rep);
        const mode = archivedModes[variant];
        if (suite === 'historical' && mode) {
          const reference = archived.rows.find((r: { mode: string; mission: string; style: number; seed: number }) =>
            r.mode === mode && r.mission === mission && r.style === style && r.seed === seed);
          if (reference?.winner !== result.winner || reference.score.imperium !== result.score.imperium
            || reference.score.nightlords !== result.score.nightlords) throw Error('Archived game mismatch');
        }
        games++;
        winsByRepeat[rep] += Number(result.win);
        winsByMission[i] += Number(result.win);
        draws += Number(result.draw);
        margin += result.margin;
        maxProbabilitySum += result.maxProbabilitySum;
        result.counts.forEach((n, a) => counts[a] += n);
      }
    }
    console.log(JSON.stringify({ suite, variant, games, winsByRepeat, winsByMission, draws,
      meanScoreMargin: margin / games, actionCounts: counts,
      meanTopProbability: maxProbabilitySum ? maxProbabilitySum / counts.reduce((sum, n) => sum + n, 0) : null }));
  }
}
