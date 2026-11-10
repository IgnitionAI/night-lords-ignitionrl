import { readFileSync, writeFileSync } from 'node:fs';
import { comparePackRates } from '../src/train-b4.ts';

const b5 = JSON.parse(readFileSync('mesures/nn/b6/b5-ref.json', 'utf8'));
const b6 = JSON.parse(readFileSync('mesures/nn/b6/eval.json', 'utf8'));
const b7 = JSON.parse(readFileSync('mesures/nn/b7/eval.json', 'utf8'));
const cmp57 = comparePackRates(b5.results, b7.results);
const order = ['march', 'turret', 'brawler', 'backpedal', 'wallHugger', 'kiter', 'elite'];
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

let pool5 = 0, pool6 = 0, pool7 = 0, vis6 = 0, vis7 = 0;
const rows = order.map(k => {
  const a = b5.results[k], b = b6.results[k], c = b7.results[k];
  pool5 += a.packWinRate; pool6 += b.packWinRate; pool7 += c.packWinRate;
  vis6 += b.shareTicksVisible; vis7 += c.shareTicksVisible;
  const d5 = cmp57[k].deltaRate;
  const tel5 = a.teleports ?? a.reasons['téléporté'] ?? 0;
  const tel6 = b.teleports ?? b.reasons['téléporté'] ?? 0;
  const tel7 = c.teleports ?? c.reasons['téléporté'] ?? 0;
  return `| ${k} | ${pct(a.packWinRate)} | ${pct(b.packWinRate)} | ${pct(c.packWinRate)} | ${d5 >= 0 ? '+' : ''}${(d5 * 100).toFixed(1).replace('.', ',')} | ${String(c.medianSeconds).replace('.', ',')} s | ${c.shareTicksVisible} | ${c.deathsWithoutTermDamage} | ${tel5} / ${tel6} / ${tel7} |`;
});
const avg5 = pool5 / 7, avg6 = pool6 / 7, avg7 = pool7 / 7;

const md = `# Lecture b7 vs b6-vis2 vs b5

Politique candidate **b7** retenue : \`runs/b7-t2@220\` (\`policies/candidates/b7/\`). Fine-tune depuis vis2 (\`policies/candidates/b6/full.json\`), seed 8, lr 8e-6, 220 MàJ. **Défaut inchangé** : \`current.json\` = b5. Jouable : \`?policy=b7\`. \`src/sim.ts\`, \`NL_CFG.speed\` (6), \`T_CFG.fwd\` (2.5) inchangés. SHA b3/b4/b5/b6 inchangés.

Pas de 33e observation : \`observe()\` (32) n’a pas la distance T→balise ; l’ajouter empêcherait de charger vis2.

Éval : 200 parties / adversaire, seeds **900000..900199**, \`clawWindup: false\`.

Arrêt après **3 essais**. Seuils **non tous tenus** : wallHugger 85,5 % (≥ 85 %) mais **−10,5 pts vs b5** (plafond −5) ; kiter **83,5 %** (< 85 %). turret **91,0 % (−4,0 vs b5)** passe le plafond −5.

## Cause (essais)

Le shaping vis2 tire la meute dans le cône. Couper le mur nord sort du cône. L’essai 1 (menace dès x=18 + piquet balise) **augmente les téléports** (29). L’essai 2 retarde le piquet (< 10 m) et récompense la coupe du mur : turret remonte, wallHugger +1,5 pt, kiter casse. L’essai 3 (curriculum kiter depuis t2) empire kiter/elite.

## Tableau b5 / b6-vis2 / b7 (n=200, mêmes seeds)

| Adversaire | b5 WR | b6 vis2 WR | b7 WR | Δ b7 vs b5 | médiane b7 | vis b7 | morts ss dégât T | tel b5 / vis2 / b7 |
|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Pool : b5 **${pct(avg5)}** → vis2 **${pct(avg6)}** → b7 **${pct(avg7)}**. vis pool vis2 **${(vis6 / 7).toFixed(3)}** → b7 **${(vis7 / 7).toFixed(3)}**.

## Tentatives

| | vis2 | essai 1 (piquet tôt, 240 upd) | essai 2 retenu (wallCut, 220 upd lr 8e-6) | essai 3 (kiter depuis t2, 160 upd) |
|---|---|---|---|---|
| turret | 89,0 % (−6,0) | 86,5 % | **91,0 % (−4,0)** | 90,5 % (−4,5) |
| wallHugger | 84,0 % (17 tel) | 84,0 % (29 tel) | **85,5 %** (20 tel) | 85,0 % (25 tel) |
| kiter | **89,0 %** | 85,0 % | 83,5 % | 81,0 % |
| elite | **88,5 %** | 85,0 % | 85,5 % | 80,0 % |
| pool | **92,1 %** | 89,9 % | 91,2 % | 89,4 % |

## Commandes

\`\`\`
bun dist/train.mjs --preset b7 --updates 220 --envs 32 --out runs/b7-t2 --seed 8 --lr 8e-6 --init policies/candidates/b6/full.json
bun dist/eval.mjs --pack policies/candidates/b7/actor.json --n 200 --seedBase 900000 --out mesures/nn/b7/eval.json
\`\`\`

Le défaut du jeu n'est **pas** b7.
`;

writeFileSync('mesures/nn/b7/LECTURE.md', md);
writeFileSync('mesures/nn/b7/compare.json', JSON.stringify({ avg5, avg6, avg7, vis6: vis6 / 7, vis7: vis7 / 7, cmp57, protocol: 'docs/PROTOCOLE-MESURE-NN.md' }, null, 2));
console.log('LECTURE ok', avg5, avg6, avg7);
