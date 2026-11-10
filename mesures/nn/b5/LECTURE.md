# Lecture b5 vs b4

Politique **b5** (défaut du jeu, validée) : fine-tune PPO depuis b4, **seed 5**, 2000 mises à jour, 32 environnements. Curriculum (kiter / elite / wallHugger sur-échantillonnés, mix vu conservé) et shaping **hors** `src/sim.ts` (`src/train-b4.ts`) : flanc / dos, chasse à distance, coupure de balise, rythme léger. `NL_CFG.speed` et `T_CFG.fwd` inchangés.

b4 est **archivé byte-identique** dans `policies/b4/` (SHA `d43de9da…06c7` / `32b7ea45…fbb1`). b3 reste dans `policies/b3/` (`950b924f…ef9f` / `7c4e37f9…ba4c`). Le jeu charge b5 via `/policy/current.json` sans paramètre ; `?policy=b4` et `?policy=b3` relisent les archives.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false` — même protocole que `mesures/nn/b4/eval.json`. `clawArms` = 0 partout.

## Faiblesses b4 (rappel chiffré)

Objectif protocole : ≥ 85 % **chaque** adversaire, médiane 30–90 s.

| Adversaire | Vu | Victoires | IC Wilson 95 % | Médiane | 30–90 s | NL tués | Téléport / wipe |
|---|---|---|---|---|---|---|---|
| march | oui | 185/200 (92,5 %) | 88,0 %–95,4 % | 21,7 s | 10,0 % | 1.05 | 0 / 15 |
| turret | oui | 174/200 (87,0 %) | 81,6 %–91,0 % | 26,6 s | 35,5 % | 1.48 | 0 / 26 |
| brawler | oui | 181/200 (90,5 %) | 85,6 %–93,8 % | 21,9 s | 10,5 % | 1.57 | 0 / 19 |
| backpedal | oui | 200/200 (100,0 %) | 98,1 %–100,0 % | 19,8 s | 2,5 % | 0.16 | 0 / 0 |
| wallHugger | éval (vu b4) | 167/200 (83,5 %) | 77,7 %–88,0 % | 25,2 s | 28,0 % | 1.59 | 7 / 26 |
| kiter | éval (vu b4) | 137/200 (68,5 %) | 61,8 %–74,5 % | 24,8 s | 27,0 % | 2.21 | 1 / 62 |
| elite | éval (vu b4) | 143/200 (71,5 %) | 64,9 %–77,3 % | 25,2 s | 27,5 % | 2.21 | 1 / 56 |

Lecture : **kiter** 68,5 % et **elite** 71,5 % sous 85 % ; wallHugger 83,5 %. Rush : médianes 19–27 s. Pool moyen **84,8 %**.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b4 WR (IC 95 %) | b5 WR (IC 95 %) | Δ WR | Δ NL tués | Δ médiane | Δ 30–90 s | régression (>3 pts) |
|---|---|---|---|---|---|---|---|
| march | 92,5 % (88,0 %–95,4 %) | 98,5 % (95,7 %–99,5 %) | +6,0 pts | -0.59 | -3,5 s | -2,0 pts | non |
| turret | 87,0 % (81,6 %–91,0 %) | 95,0 % (91,0 %–97,3 %) | +8,0 pts | -0.52 | -5,5 s | -18,5 pts | non |
| brawler | 90,5 % (85,6 %–93,8 %) | 97,5 % (94,3 %–98,9 %) | +7,0 pts | -0.74 | -2,9 s | -1,5 pts | non |
| backpedal | 100,0 % (98,1 %–100,0 %) | 99,5 % (97,2 %–99,9 %) | -0,5 pts | 0.14 | -2,1 s | 1,5 pts | non |
| wallHugger | 83,5 % (77,7 %–88,0 %) | 96,0 % (92,3 %–98,0 %) | +12,5 pts | -0.85 | -5,1 s | -15,0 pts | non |
| kiter | 68,5 % (61,8 %–74,5 %) | 87,5 % (82,2 %–91,4 %) | +19,0 pts | -0.95 | -3,4 s | -10,0 pts | non |
| elite | 71,5 % (64,9 %–77,3 %) | 88,5 % (83,3 %–92,2 %) | +17,0 pts | -0.97 | -4,5 s | -12,5 pts | non |

Pool moyen : b4 **84,8 %** → b5 **94,6 %** (Δ **+9,9 pts**).

Seuil 85 % : **atteint sur les 7 adversaires**. kiter 68,5 %→87,5 %, elite 71,5 %→88,5 %, wallHugger 83,5 %→96,0 %. backpedal −0,5 pt : **pas** une régression protocole (> 3 pts).

Durée : médianes **plus courtes** (18–21 s vs 20–27 s chez b4). La meute tue plus vite et perd moins (NL tués kiter 2,21→1,26, téléports wallHugger 7→2, kiter/elite 1→0). Objectif 30–90 s **non atteint** : allonger sans casser le WR n'a pas été prioritaire (le `pace` 0,0005 / tick n'a pas compensé l'efficacité). `share30to90` recule.

## Curriculum et shaping (hors sim.ts)

- **Init** : `policies/current-full.json` (b4). Seed **5**, lr **5e-5**, entCoef **0,025**, 2000 MàJ, 32 envs, 26,85 M transitions, 1370 s CPU.
- **Curriculum** : sac dur 48 %→75 % (kiter 42 %, elite 40 %, wallHugger 18 %). Reste : turret 28 %, brawler 20 %, randomized 28 %, march 14 %, backpedal 10 %.
- **Shaping** : mort −0,55, canal −0,40, interruption +0,40, bande μ=6 m, face −0,016, dos +0,014, chasse si d>9, intercept balise, 3+ vivants, rythme +0,0005/tick, rush tôt en face −0,003.

## Courbe d'entraînement

Voir `policies/candidates/b5/metrics.jsonl` et `policies/candidates/b5/curve.svg`. Win-rate train = mélange curriculum, **pas** comparable à l'éval.

## Commandes

```
bun dist/train.mjs --preset b5 --updates 2000 --envs 32 --out runs/b5 --seed 5 --init policies/current-full.json
bun dist/eval.mjs --pack policies/candidates/b5/actor.json --n 200 --seedBase 900000 --out mesures/nn/b5/eval.json
```

Salim a validé : `policies/current.json` = b5 (`runs/b5@2000`). Archive `policies/b4/`. b3 inchangé.
