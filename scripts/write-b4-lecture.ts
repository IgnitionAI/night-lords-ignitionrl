import { readFileSync, writeFileSync } from 'node:fs';
import { comparePackRates, wilsonInterval } from '../src/train-b4.ts';

const b3 = JSON.parse(readFileSync('mesures/eval-b3.json', 'utf8'));
const b4 = JSON.parse(readFileSync('mesures/nn/b4/eval.json', 'utf8'));
const cmp = comparePackRates(b3.results, b4.results);
const order = ['march', 'turret', 'brawler', 'backpedal', 'wallHugger', 'kiter', 'elite'];
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const ci = (w: { lo: number; hi: number }) => `${pct(w.lo)}–${pct(w.hi)}`;
let poolB3 = 0, poolB4 = 0;
const rows = order.map(k => {
  const a = b3.results[k], b = b4.results[k], c = cmp[k];
  poolB3 += a.packWinRate; poolB4 += b.packWinRate;
  return { k, a, b, c };
});
const avgB3 = poolB3 / 7, avgB4 = poolB4 / 7;

const b3Table = order.map(k => {
  const a = b3.results[k]; const w = wilsonInterval(a.packWins, a.games);
  const tel = a.reasons['téléporté'] ?? 0, wipe = a.reasons['meute anéantie'] ?? 0;
  return `| ${k} | ${a.unseen ? 'non' : 'oui'} | ${a.packWins}/200 (${pct(a.packWinRate)}) | ${ci(w)} | ${String(a.medianSeconds).replace('.', ',')} s | ${pct(a.share30to90)} | ${a.meanNightLordsKilled} | ${tel} / ${wipe} |`;
}).join('\n');

const cmpTable = rows.map(({ k, a, b, c }) => {
  const dWr = `${c.deltaRate >= 0 ? '+' : ''}${(c.deltaRate * 100).toFixed(1).replace('.', ',')} pts`;
  const dKill = (b.meanNightLordsKilled - a.meanNightLordsKilled).toFixed(2);
  const dMed = `${(b.medianSeconds - a.medianSeconds).toFixed(1).replace('.', ',')} s`;
  const dShare = `${((b.share30to90 - a.share30to90) * 100).toFixed(1).replace('.', ',')} pts`;
  return `| ${k} | ${pct(a.packWinRate)} (${ci(c.b3)}) | ${pct(b.packWinRate)} (${ci(c.cand)}) | ${dWr} | ${dKill} | ${dMed} | ${dShare} | ${c.regressionVsB3 ? 'oui' : 'non'} |`;
}).join('\n');

const md = `# Lecture b4 vs b3

Politique candidate **b4** : fine-tune PPO depuis b3 (\`policies/current-full.json\`), **seed 4**, 800 mises à jour, 16 environnements, ~301 s CPU (4 cœurs). Curriculum (kiter / turret / wallHugger / elite progressivement) et shaping **hors** \`src/sim.ts\` (\`src/train-b4.ts\`) : pénalité canalisation / mort, bonus flanc et interruption de balise. \`NL_CFG.speed\` et \`T_CFG.fwd\` inchangés. **b3 n'est pas écrasé.** Le jeu charge encore \`/policy/current.json\` ; comparaison : \`?policy=b4\`.

Éval : 200 parties / adversaire, seeds **900000..900199**, \`clawWindup: false\` — même protocole que \`mesures/eval-b3.json\`. \`clawArms\` = 0 partout.

## Faiblesses b3 (rappel chiffré)

Objectif protocole : ≥ 85 % **chaque** adversaire, médiane 30–90 s.

| Adversaire | Vu | Victoires | IC Wilson 95 % | Médiane | 30–90 s | NL tués | Téléport / wipe |
|---|---|---|---|---|---|---|---|
${b3Table}

Lecture : **kiter** 28,5 % (wipe 132/200, 3,16 NL tués). **turret** 55,5 % et **wallHugger** 51 % sous 85 %. Canalisation : 7–11 téléports (turret, wallHugger, kiter, elite). Rush : médianes 17–28 s. Pool moyen **${pct(avgB3)}**.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b3 WR (IC 95 %) | b4 WR (IC 95 %) | Δ WR | Δ NL tués | Δ médiane | Δ 30–90 s | régression (>3 pts) |
|---|---|---|---|---|---|---|---|
${cmpTable}

Pool moyen : b3 **${pct(avgB3)}** → b4 **${pct(avgB4)}** (Δ **+${((avgB4 - avgB3) * 100).toFixed(1).replace('.', ',')} pts**).

Seuil 85 % : b4 l'atteint sur march, turret, brawler, backpedal ; wallHugger 83,5 % (IC chevauche 85 %) ; kiter 68,5 % et elite 71,5 % restent sous le seuil mais hors du bruit vs b3. march −2,5 pts : **pas** une régression protocole (> 3 pts).

Durée : médianes toujours sous 30–90 s ; \`share30to90\` monte (turret 20,5 %→35,5 %, kiter 4,5 %→27,0 %). Canalisation : téléports turret 7→0, kiter 11→1, elite 8→1 ; wallHugger 7→7. Survie : NL tués turret 2,48→1,48, kiter 3,16→2,21.

## Courbe d'entraînement

Voir \`policies/candidates/b4/metrics.jsonl\` (800 lignes) et \`policies/candidates/b4/curve.svg\`. Win-rate train ~0,82–0,91 (mélange curriculum, **pas** comparable à l'éval). 5,54 M transitions, 301 s.

## Commandes

\`\`\`
bun dist/train.mjs --preset b4 --updates 800 --envs 16 --out runs/b4 --seed 4 --init policies/current-full.json
bun dist/eval.mjs --pack policies/candidates/b4/actor.json --n 200 --seedBase 900000 --out mesures/nn/b4/eval.json
\`\`\`

b4 n'est **pas** copié vers \`policies/current.json\`. Humain tranche.
`;

writeFileSync('mesures/nn/b4/LECTURE.md', md);
writeFileSync('mesures/nn/b4/compare.json', JSON.stringify({ avgB3, avgB4, cmp, protocol: 'docs/PROTOCOLE-MESURE-NN.md' }, null, 2));
console.log('LECTURE ok', avgB3, avgB4);
