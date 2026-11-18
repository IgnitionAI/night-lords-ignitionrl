import { writeFileSync } from 'node:fs';
import type { PPO } from '../src/ppo';
import { mulberry32 } from '../src/rng';
import { sample } from '../src/policy';
import { createOperation, type World } from '../src/strategy/engine';
import { boardingObservation, BOARD_ACTIONS } from '../src/strategy/boarding-agents';
import { playerPlan } from './boarding-scenarios';
import { advance, commanderViews, trainingCase } from './boarding-experiment';

function standing(w: World) {
  return { score: w.score.nightlords - w.score.imperium, owned: w.objectives.filter(o => o.owner === 'nightlords').length,
    ownHP: w.units.reduce((sum, u) => sum + (u.side === 'nightlords' ? u.hp : 0), 0),
    enemyHP: w.units.reduce((sum, u) => sum + (u.side === 'imperium' ? u.hp : 0), 0) };
}
export function trainReinforcement(ppo: PPO, seed: number, dir: string, branch: string,
  afterUpdate: (update: number) => void, save: (update: number, extra: Record<string, unknown>) => void) {
  const rng = mulberry32(seed);
  const trainingSeeds: number[] = [], metrics = [];
  let transitions = 0;
  for (let update = 1; update <= 90; update++) {
    const observations: number[] = [], actions: number[] = [], logps: number[] = [], advantages: number[] = [], returns: number[] = [];
    let wins = 0, rewardSum = 0;
    for (let episode = 0; episode < 6; episode++) {
      const index = (update - 1) * 6 + episode;
      const permuted = 108 * Math.floor(index / 108) + (index * 53) % 108;
      const game = trainingCase(permuted);
      trainingSeeds.push(game.seed);
      const w = createOperation(game.seed, game.mission);
      let intentions = [-1, -1], previous = standing(w);
      type Step = { obs: number[]; action: number; logp: number; value: number; reward: number };
      const tracks: Step[][] = [[], []];
      while (!w.winner) {
        const views = commanderViews(w);
        const inputs = views.map((v, i) => boardingObservation(v, intentions[1 - i]));
        const {probs, values} = ppo.act(Float32Array.from(inputs.flat()), 2);
        const distributions = [probs.subarray(0, BOARD_ACTIONS), probs.subarray(BOARD_ACTIONS)];
        const choices = distributions.map(p => sample(p, rng));
        advance(w, views, choices, playerPlan(w, game.style));
        const next = standing(w);
        const scoreDelta = next.score - previous.score;
        // Same team reward as the combat stage of train-boarding.ts.
        const reward = .14 * scoreDelta + .25 * (next.owned - previous.owned)
          - .025 * (previous.ownHP - next.ownHP) + .02 * (previous.enemyHP - next.enemyHP)
          + (w.winner === 'nightlords' ? 3 : w.winner === 'imperium' ? -3 : 0)
          + (choices[0] % 3 !== choices[1] % 3 && scoreDelta > 0 ? .04 : 0) - .005;
        for (let i = 0; i < 2; i++) tracks[i].push({obs: inputs[i], action: choices[i],
          logp: Math.log(distributions[i][choices[i]] + 1e-8), value: values[i], reward});
        previous = next;
        rewardSum += reward;
        intentions = choices;
      }
      wins += Number(w.winner === 'nightlords');
      for (const track of tracks) {
        let target = 0;
        for (let t = track.length - 1; t >= 0; t--) {
          const step = track[t];
          target = step.reward + .97 * target;
          observations.push(...step.obs); actions.push(step.action); logps.push(step.logp);
          returns.push(target); advantages.push(target - step.value);
        }
      }
    }
    const stats = ppo.update(Float32Array.from(observations), Int32Array.from(actions), Float32Array.from(logps),
      Float32Array.from(advantages), Float32Array.from(returns));
    if (!Object.values(stats).every(Number.isFinite)) throw Error('Non-finite PPO statistics');
    afterUpdate(update);
    transitions += actions.length;
    metrics.push({ update, stage: 'combat', transitions, wins, episodes: 6, meanTeamReturn: rewardSum / 6,
      reminderStrength: branch === 'candidate' ? Math.max(0, (31 - update) / 30) : 0, ...stats });
    if (update % 15 === 0) console.log(branch, seed, update, transitions);
    if (update === 45 || update === 90) {
      save(update, { transitions, trainingSeeds, episodes: update * 6, learningRate: ppo.cfg.lr, gamma: .97,
        curriculum: 'autonomie-1', excludedConfigurations: [5, 8, 11], stages: [{ name: 'combat', updates: update, horizon: 18 }],
        demoEpisodes: branch === 'candidate' ? 108 : 0, inference: 'argmax, individual view, 72 inputs' });
      writeFileSync(dir + '/' + branch + '-training-' + update + '.json', JSON.stringify(metrics));
    }
  }
}
