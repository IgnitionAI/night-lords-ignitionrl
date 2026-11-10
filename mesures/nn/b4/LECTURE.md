# Lecture b4 vs b3

Politique **b4** (défaut du jeu, validée) : fine-tune PPO depuis b3, **seed 4**, 800 mises à jour, 16 environnements, ~301 s CPU. Curriculum et shaping hors `src/sim.ts`. `NL_CFG.speed` et `T_CFG.fwd` inchangés.

b3 est **archivé byte-identique** dans `policies/b3/` (SHA `950b924f…ef9f` / `7c4e37f9…ba4c`). Le jeu charge b4 via `/policy/current.json` sans paramètre ; `?policy=b3` relit l'archive.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false` — même protocole que `mesures/eval-b3.json`. `clawArms` = 0 partout.

## Faiblesses b3 (rappel chiffré)

Objectif protocole : ≥ 85 % **chaque** adversaire, médiane 30–90 s.

| Adversaire | Vu | Victoires | IC Wilson 95 % | Médiane | 30–90 s | NL tués | Téléport / wipe |
|---|---|---|---|---|---|---|---|
| march | oui | 190/200 (95,0 %) | 91,0 %–97,3 % | 17,3 s | 0,5 % | 0.81 | 1 / 9 |
| turret | oui | 111/200 (55,5 %) | 48,6 %–62,2 % | 21,1 s | 20,5 % | 2.48 | 7 / 82 |
| brawler | oui | 161/200 (80,5 %) | 74,5 %–85,4 % | 19,2 s | 1,5 % | 2 | 4 / 35 |
| backpedal | oui | 196/200 (98,0 %) | 95,0 %–99,2 % | 21 s | 2,5 % | 0.54 | 2 / 2 |
| wallHugger | non | 102/200 (51,0 %) | 44,1 %–57,8 % | 28,1 s | 35,5 % | 2.57 | 7 / 91 |
| kiter | non | 57/200 (28,5 %) | 22,7 %–35,1 % | 19,3 s | 4,5 % | 3.16 | 11 / 132 |
| elite | non | 127/200 (63,5 %) | 56,6 %–69,9 % | 21,2 s | 6,5 % | 2.6 | 8 / 65 |

Lecture : **kiter** 28,5 % (wipe 132/200, 3,16 NL tués). **turret** 55,5 % et **wallHugger** 51 % sous 85 %. Canalisation : 7–11 téléports (turret, wallHugger, kiter, elite). Rush : médianes 17–28 s. Pool moyen **67,4 %**.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b3 WR (IC 95 %) | b4 WR (IC 95 %) | Δ WR | Δ NL tués | Δ médiane | Δ 30–90 s | régression (>3 pts) |
|---|---|---|---|---|---|---|---|
| march | 95,0 % (91,0 %–97,3 %) | 92,5 % (88,0 %–95,4 %) | -2,5 pts | 0.24 | 4,4 s | 9,5 pts | non |
| turret | 55,5 % (48,6 %–62,2 %) | 87,0 % (81,6 %–91,0 %) | +31,5 pts | -1.00 | 5,5 s | 15,0 pts | non |
| brawler | 80,5 % (74,5 %–85,4 %) | 90,5 % (85,6 %–93,8 %) | +10,0 pts | -0.43 | 2,7 s | 9,0 pts | non |
| backpedal | 98,0 % (95,0 %–99,2 %) | 100,0 % (98,1 %–100,0 %) | +2,0 pts | -0.38 | -1,2 s | 0,0 pts | non |
| wallHugger | 51,0 % (44,1 %–57,8 %) | 83,5 % (77,7 %–88,0 %) | +32,5 pts | -0.98 | -2,9 s | -7,5 pts | non |
| kiter | 28,5 % (22,7 %–35,1 %) | 68,5 % (61,8 %–74,5 %) | +40,0 pts | -0.95 | 5,5 s | 22,5 pts | non |
| elite | 63,5 % (56,6 %–69,9 %) | 71,5 % (64,9 %–77,3 %) | +8,0 pts | -0.39 | 4,0 s | 21,0 pts | non |

Pool moyen : b3 **67,4 %** → b4 **84,8 %** (Δ **+17,4 pts**).

Seuil 85 % : b4 l'atteint sur march, turret, brawler, backpedal ; wallHugger 83,5 % (IC chevauche 85 %) ; kiter 68,5 % et elite 71,5 % restent sous le seuil mais hors du bruit vs b3. march −2,5 pts : **pas** une régression protocole (> 3 pts).

Durée : médianes toujours sous 30–90 s ; `share30to90` monte (turret 20,5 %→35,5 %, kiter 4,5 %→27,0 %). Canalisation : téléports turret 7→0, kiter 11→1, elite 8→1 ; wallHugger 7→7. Survie : NL tués turret 2,48→1,48, kiter 3,16→2,21.

## Courbe d'entraînement

Voir `policies/candidates/b4/metrics.jsonl` (800 lignes) et `policies/candidates/b4/curve.svg`. Win-rate train ~0,82–0,91 (mélange curriculum, **pas** comparable à l'éval). 5,54 M transitions, 301 s.

## Commandes

```
bun dist/train.mjs --preset b4 --updates 800 --envs 16 --out runs/b4 --seed 4 --init policies/current-full.json
bun dist/eval.mjs --pack policies/candidates/b4/actor.json --n 200 --seedBase 900000 --out mesures/nn/b4/eval.json
```

Salim a validé : `policies/current.json` = b4 (`runs/b4@800`). Archive `policies/b3/`.
