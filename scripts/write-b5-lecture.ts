import { readFileSync, writeFileSync } from 'node:fs';
import { comparePackRates, wilsonInterval } from '../src/train-b4.ts';

const b4 = JSON.parse(readFileSync('mesures/nn/b4/eval.json', 'utf8'));
const b5 = JSON.parse(readFileSync('mesures/nn/b5/eval.json', 'utf8'));
const cmp = comparePackRates(b4.results, b5.results);
const order = ['march', 'turret', 'brawler', 'backpedal', 'wallHugger', 'kiter', 'elite'];
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const ci = (w: { lo: number; hi: number }) => `${pct(w.lo)}–${pct(w.hi)}`;
let poolB4 = 0, poolB5 = 0;
const rows = order.map(k => {
  const a = b4.results[k], b = b5.results[k], c = cmp[k];
  poolB4 += a.packWinRate; poolB5 += b.packWinRate;
  return { k, a, b, c };
});
const avgB4 = poolB4 / 7, avgB5 = poolB5 / 7;

const b4Table = order.map(k => {
  const a = b4.results[k]; const w = wilsonInterval(a.packWins, a.games);
  const tel = a.reasons['téléporté'] ?? 0, wipe = a.reasons['meute anéantie'] ?? 0;
  return `| ${k} | ${a.unseen ? 'éval (vu b4)' : 'oui'} | ${a.packWins}/200 (${pct(a.packWinRate)}) | ${ci(w)} | ${String(a.medianSeconds).replace('.', ',')} s | ${pct(a.share30to90)} | ${a.meanNightLordsKilled} | ${tel} / ${wipe} |`;
}).join('\n');

const cmpTable = rows.map(({ k, a, b, c }) => {
  const dWr = `${c.deltaRate >= 0 ? '+' : ''}${(c.deltaRate * 100).toFixed(1).replace('.', ',')} pts`;
  const dKill = (b.meanNightLordsKilled - a.meanNightLordsKilled).toFixed(2);
  const dMed = `${(b.medianSeconds - a.medianSeconds).toFixed(1).replace('.', ',')} s`;
  const dShare = `${((b.share30to90 - a.share30to90) * 100).toFixed(1).replace('.', ',')} pts`;
  return `| ${k} | ${pct(a.packWinRate)} (${ci(c.b3)}) | ${pct(b.packWinRate)} (${ci(c.cand)}) | ${dWr} | ${dKill} | ${dMed} | ${dShare} | ${c.regressionVsB3 ? 'oui' : 'non'} |`;
}).join('\n');

const md = `# Lecture b5 vs b4

Politique candidate **b5** : fine-tune PPO depuis b4 (\`policies/current-full.json\`), **seed 5**, 2000 mises à jour, 32 environnements. Curriculum (kiter / elite / wallHugger sur-échantillonnés, mix vu conservé) et shaping **hors** \`src/sim.ts\` (\`src/train-b4.ts\`) : flanc / dos, chasse à distance, coupure de balise, rythme léger. \`NL_CFG.speed\` et \`T_CFG.fwd\` inchangés. **b4 reste le défaut** (\`policies/current.json\`). **b3 n'est pas écrasé.** Le jeu charge b5 via \`?policy=b5\`.

Éval : 200 parties / adversaire, seeds **900000..900199**, \`clawWindup: false\` — même protocole que \`mesures/nn/b4/eval.json\`. \`clawArms\` = 0 partout.

## Faiblesses b4 (rappel chiffré)

Objectif protocole : ≥ 85 % **chaque** adversaire, médiane 30–90 s.

| Adversaire | Vu | Victoires | IC Wilson 95 % | Médiane | 30–90 s | NL tués | Téléport / wipe |
|---|---|---|---|---|---|---|---|
${b4Table}

Lecture : **kiter** 68,5 % et **elite** 71,5 % sous 85 % ; wallHugger 83,5 %. Rush : médianes 19–27 s. Pool moyen **${pct(avgB4)}**.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b4 WR (IC 95 %) | b5 WR (IC 95 %) | Δ WR | Δ NL tués | Δ médiane | Δ 30–90 s | régression (>3 pts) |
|---|---|---|---|---|---|---|---|
${cmpTable}

Pool moyen : b4 **${pct(avgB4)}** → b5 **${pct(avgB5)}** (Δ **${avgB5 >= avgB4 ? '+' : ''}${((avgB5 - avgB4) * 100).toFixed(1).replace('.', ',')} pts**).

## Courbe d'entraînement

Voir \`policies/candidates/b5/metrics.jsonl\` et \`policies/candidates/b5/curve.svg\`. Win-rate train = mélange curriculum, **pas** comparable à l'éval.

## Commandes

\`\`\`
bun dist/train.mjs --preset b5 --updates 2000 --envs 32 --out runs/b5 --seed 5 --init policies/current-full.json
bun dist/eval.mjs --pack policies/candidates/b5/actor.json --n 200 --seedBase 900000 --out mesures/nn/b5/eval.json
\`\`\`

b5 n'est **pas** copié vers \`policies/current.json\`. Humain tranche.
`;

writeFileSync('mesures/nn/b5/LECTURE.md', md);
writeFileSync('mesures/nn/b5/compare.json', JSON.stringify({ avgB4, avgB5, cmp, protocol: 'docs/PROTOCOLE-MESURE-NN.md' }, null, 2));
console.log('LECTURE ok', avgB4, avgB5);