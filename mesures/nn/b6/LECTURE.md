# Lecture b6 vs b5

Politique candidate **b6** (`runs/b6@1950`) : fine-tune PPO **en 3 paliers** depuis b5 (`policies/candidates/b5/full.json`), 32 environnements, lr 2e-5. Shaping **hors** `src/sim.ts` (`src/train-b4.ts`) : encerclement, harcèlement, feintes, interdiction melee/griffes avant 30 s, pénalité victoire trop rapide, commit ensuite. `NL_CFG.speed` et `T_CFG.fwd` inchangés. **Défaut inchangé** : `current.json` reste b5. Jouable : `?policy=b6`.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false` — même protocole que `mesures/nn/b5/eval.json`.

Objectifs : médiane **30–90 s** chaque adversaire ; WR ≥ 85 % ; pas plus de 5 pts sous b5 ; pool ≥ 88 %.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b5 WR (IC 95 %) | b6 WR (IC 95 %) | Δ WR | NL tués | Téléports | b5 médiane (p25–p75) | b6 médiane (p25–p75) | engagements | ticks loin |
|---|---|---|---|---|---|---|---|---|---|
| march | 98,5 % (95,7 %–99,5 %) | 97,5 % (94,3 %–98,9 %) | -1,0 pts | 0.46 → 0.79 | 0 → 0 | 18,2 s (16,3–21,5) | 38,4 s (35,2–42,2) | 0.99 | 0.53 |
| turret | 95,0 % (91,0 %–97,3 %) | 91,0 % (86,2 %–94,2 %) | -4,0 pts | 0.96 → 1.46 | 0 → 0 | 21,1 s (18,1–26,2) | 43,8 s (39,6–48,7) | 0.94 | 0.638 |
| brawler | 97,5 % (94,3 %–98,9 %) | 95,5 % (91,7 %–97,6 %) | -2,0 pts | 0.83 → 1.33 | 0 → 0 | 19 s (17,1–22,6) | 38,7 s (35,7–42,1) | 0.97 | 0.56 |
| backpedal | 99,5 % (97,2 %–99,9 %) | 100,0 % (98,1 %–100,0 %) | +0,5 pts | 0.3 → 0.23 | 0 → 0 | 17,7 s (15,6–21) | 37,3 s (35,1–40,1) | 1.01 | 0.561 |
| wallHugger | 96,0 % (92,3 %–98,0 %) | 91,5 % (86,8 %–94,6 %) | -4,5 pts | 0.74 → 1.33 | 2 → 2 | 20,1 s (17,4–25) | 39 s (34,4–46,4) | 1.03 | 0.52 |
| kiter | 87,5 % (82,2 %–91,4 %) | 86,5 % (81,1 %–90,6 %) | -1,0 pts | 1.26 → 1.81 | 0 → 0 | 21,4 s (18–26,5) | 41,2 s (37,9–46,1) | 0.93 | 0.575 |
| elite | 88,5 % (83,3 %–92,2 %) | 87,0 % (81,6 %–91,0 %) | -1,5 pts | 1.24 → 1.78 | 0 → 0 | 20,7 s (18,1–25,8) | 40,8 s (37,2–45) | 0.89 | 0.579 |

Pool moyen : b5 **94,6 %** → b6 **92,7 %**.

## Commandes

```
bun dist/train.mjs --preset b6 --updates 900 --envs 32 --out runs/b6 --seed 6 --init policies/candidates/b5/full.json
bun dist/train.mjs --preset b6 --updates 700 --envs 32 --out runs/b6-tempo2 --seed 7 --init runs/b6/full.json
bun dist/train.mjs --preset b6 --updates 350 --envs 32 --out runs/b6-tempo4 --seed 9 --init runs/b6-tempo2/full.json
bun dist/eval.mjs --pack policies/candidates/b6/actor.json --n 200 --seedBase 900000 --out mesures/nn/b6/eval.json
```

Le défaut du jeu n'est **pas** b6.
