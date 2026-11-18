import { mkdirSync, writeFileSync } from 'node:fs';
import { boardingAction, boardingObservation } from '../src/strategy/boarding-agents';
import { createOperation } from '../src/strategy/engine';
import { argmax, forward, sample, softmax } from '../src/policy';
import { mulberry32 } from '../src/rng';
import { playerPlan } from './boarding-scenarios';
import { advance, commanderViews, initialActor, runRoot, trainingCase } from './boarding-experiment';

export type Demo = { observation: number[]; objective: number; postures: number[] };

if (import.meta.main) {
  const shipped = initialActor(), rng = mulberry32(7041);
  const rows: Demo[] = [], counts = [0, 0, 0];
  for (let episode = 0; episode < 108; episode++) {
    const { seed, mission, style } = trainingCase(episode);
    const w = createOperation(seed, mission);
    let intentions = [-1, -1];
    while (!w.winner) {
      const views = commanderViews(w);
      const choices = views.map((v, i) => {
        const ally = intentions[1 - i], observation = boardingObservation(v, ally);
        const objective = boardingAction(v, ally) % 3;
        const probabilities = softmax(forward(shipped, observation));
        const postures = [0, 1, 2, 3].map(s => probabilities.slice(s * 3, s * 3 + 3).reduce((a, b) => a + b, 0));
        if (v.units.length) {
          rows.push({ observation, objective, postures });
          counts[objective]++;
        }
        // The teacher supplies only the system. Vary the shipped posture to cover different views.
        const decision = episode % 3 === 0 ? sample(probabilities, rng) : argmax(probabilities);
        return objective + 3 * Math.floor(decision / 3);
      });
      advance(w, views, choices, playerPlan(w, style));
      intentions = choices;
    }
  }
  mkdirSync(runRoot, { recursive: true });
  writeFileSync(runRoot + '/demos.json', JSON.stringify(rows));
  console.log({ episodes: 108, examples: rows.length, counts });
}
