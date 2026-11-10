# Lecture b6 vs b5

Politique candidate **b6** (`runs/b6-vis2@700`) : fine-tune lisibilité depuis le candidat mergé (spawn-camp hors cône). Shaping **hors** `src/sim.ts` : cône de vision, flancs hors couloir de bolter, pénalité stall/spawn. `NL_CFG.speed` et `T_CFG.fwd` inchangés. **Défaut inchangé** : `current.json` reste b5. Jouable : `?policy=b6`.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false` — même protocole que `mesures/nn/b5/eval.json`.

Objectifs : médiane **30–90 s** chaque adversaire ; WR ≥ 85 % ; pas plus de 5 pts sous b5 ; pool ≥ 88 %.

## Tableau comparatif (n=200, mêmes seeds)

| Adversaire | b5 WR (IC 95 %) | b6 WR (IC 95 %) | Δ WR | NL tués | Téléports | b5 médiane (p25–p75) | b6 médiane (p25–p75) | engagements | ticks visibles | morts sans dégât T |
|---|---|---|---|---|---|---|---|---|---|---|
| march | 98,5 % (95,7 %–99,5 %) | 98,5 % (95,7 %–99,5 %) | +0,0 pts | 0.46 → 0.79 | 0 → 0 (0/p) | 18,2 s (16,3–21,5) | 37,3 s (35,2–39,8) | 1.04 | 0.69 | 0 |
| turret | 95,0 % (91,0 %–97,3 %) | 89,0 % (83,9 %–92,6 %) | -6,0 pts | 0.96 → 1.39 | 0 → 0 (0/p) | 21,1 s (18,1–26,2) | 38,2 s (36,1–41,4) | 1.01 | 0.556 | 0 |
| brawler | 97,5 % (94,3 %–98,9 %) | 96,0 % (92,3 %–98,0 %) | -1,5 pts | 0.83 → 1.23 | 0 → 1 (0.005/p) | 19 s (17,1–22,6) | 38,4 s (36–40,9) | 0.99 | 0.653 | 0 |
| backpedal | 99,5 % (97,2 %–99,9 %) | 100,0 % (98,1 %–100,0 %) | +0,5 pts | 0.3 → 0.59 | 0 → 0 (0/p) | 17,7 s (15,6–21) | 37,1 s (34,7–39,2) | 1.05 | 0.664 | 0 |
| wallHugger | 96,0 % (92,3 %–98,0 %) | 84,0 % (78,3 %–88,4 %) | -12,0 pts | 0.74 → 1.5 | 2 → 17 (0.085/p) | 20,1 s (17,4–25) | 39,3 s (36,8–42,6) | 1.01 | 0.607 | 0 |
| kiter | 87,5 % (82,2 %–91,4 %) | 89,0 % (83,9 %–92,6 %) | +1,5 pts | 1.26 → 1.69 | 0 → 0 (0/p) | 21,4 s (18–26,5) | 40,1 s (37,6–43,9) | 1 | 0.621 | 0 |
| elite | 88,5 % (83,3 %–92,2 %) | 88,5 % (83,3 %–92,2 %) | +0,0 pts | 1.24 → 1.67 | 0 → 0 (0/p) | 20,7 s (18,1–25,8) | 40,2 s (36,7–43,2) | 0.95 | 0.615 | 0 |

Pool moyen : b5 **94,6 %** → b6 **92,1 %**.

## Commandes

```
bun dist/train.mjs --preset b6 --updates 700 --envs 32 --out runs/b6-vis2 --seed 12 --init policies/candidates/b6/full.json
bun dist/eval.mjs --pack policies/candidates/b6/actor.json --n 200 --seedBase 900000 --out mesures/nn/b6/eval.json
```

Le défaut du jeu n'est **pas** b6.
