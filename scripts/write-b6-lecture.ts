import { readFileSync, writeFileSync } from 'node:fs';
import { comparePackRates, wilsonInterval } from '../src/train-b4.ts';

const b5 = JSON.parse(readFileSync('mesures/nn/b6/b5-ref.json', 'utf8'));
const b6 = JSON.parse(readFileSync('mesures/nn/b6/eval.json', 'utf8'));
const cmp = comparePackRates(b5.results, b6.results);
const order = ['march', 'turret', 'brawler', 'backpedal', 'wallHugger', 'kiter', 'elite'];
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const ci = (w: { lo: number; hi: number }) => `${pct(w.lo)}–${pct(w.hi)}`;
let poolB5 = 0, poolB6 = 0;
const rows = order.map(k => {
  const a = b5.results[k], b = b6.results[k], c = cmp[k];
  poolB5 += a.packWinRate; poolB6 += b.packWinRate;
  return { k, a, b, c };
});
const avgB5 = poolB5 / 7, avgB6 = poolB6 / 7;

const cmpTable = rows.map(({ k, a, b, c }) => {
  const dWr = `${c.deltaRate >= 0 ? '+' : ''}${(c.deltaRate * 100).toFixed(1).replace('.', ',')} pts`;
  const telA = a.reasons['téléporté'] ?? 0;
  const telB = b.teleports ?? b.reasons['téléporté'] ?? 0;
  const p25 = String(b.p25Seconds ?? '—').replace('.', ',');
  const p75 = String(b.p75Seconds ?? '—').replace('.', ',');
  const p25a = String(a.p25Seconds ?? '—').replace('.', ',');
  const p75a = String(a.p75Seconds ?? '—').replace('.', ',');
  return `| ${k} | ${pct(a.packWinRate)} (${ci(c.b3)}) | ${pct(b.packWinRate)} (${ci(c.cand)}) | ${dWr} | ${a.meanNightLordsKilled} → ${b.meanNightLordsKilled} | ${telA} → ${telB} (${b.meanTeleports ?? '—'}/p) | ${String(a.medianSeconds).replace('.', ',')} s (${p25a}–${p75a}) | ${String(b.medianSeconds).replace('.', ',')} s (${p25}–${p75}) | ${b.meanEngagements ?? '—'} | ${b.shareTicksVisible ?? '—'} | ${b.deathsWithoutTermDamage ?? '—'} |`;
}).join('\n');

const md = `# Lecture b6 vs b5

Politique candidate **b6** (\`runs/b6@1950\`) : fine-tune PPO **en 3 paliers** depuis b5 (\`policies/candidates/b5/full.json\`), 32 environnements, lr 2e-5. Shaping **hors** \`src/sim.ts\` (\`src/train-b4.ts\`) : encerclement, harcèlement, feintes, interdiction melee/griffes avant 30 s, pénalité victoire trop rapide, commit ensuite. \`NL_CFG.speed\` et \`T_CFG.fwd\` inchangés. **Défaut inchangé** : \`current.json\` reste b5. Jouable : \`?policy=b6\`.

Éval : 200 parties / adversaire, seeds **900000..900199**, \`clawWindup: false\` — même protocole que \`mesures/nn/b5/eval.json\`.

Objectifs : médiane **30–90 s** chaque adversaire ; WR ≥ 85 % ; pas plus de 5 pts sous b5 ; pool ≥ 88 %.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b5 WR (IC 95 %) | b6 WR (IC 95 %) | Δ WR | NL tués | Téléports | b5 médiane (p25–p75) | b6 médiane (p25–p75) | engagements | ticks visibles | morts sans dégât T |
|---|---|---|---|---|---|---|---|---|---|---|
${cmpTable}

Pool moyen : b5 **${pct(avgB5)}** → b6 **${pct(avgB6)}**.

## Commandes

\`\`\`
bun dist/train.mjs --preset b6 --updates 900 --envs 32 --out runs/b6 --seed 6 --init policies/candidates/b5/full.json
bun dist/train.mjs --preset b6 --updates 700 --envs 32 --out runs/b6-tempo2 --seed 7 --init runs/b6/full.json
bun dist/train.mjs --preset b6 --updates 350 --envs 32 --out runs/b6-tempo4 --seed 9 --init runs/b6-tempo2/full.json
bun dist/eval.mjs --pack policies/candidates/b6/actor.json --n 200 --seedBase 900000 --out mesures/nn/b6/eval.json
\`\`\`

Le défaut du jeu n'est **pas** b6.
`;

writeFileSync('mesures/nn/b6/LECTURE.md', md);
writeFileSync('mesures/nn/b6/compare.json', JSON.stringify({ avgB5, avgB6, cmp, protocol: 'docs/PROTOCOLE-MESURE-NN.md' }, null, 2));
console.log('LECTURE ok', avgB5, avgB6);
