# Lecture b7 vs b6-vis2 vs b5

Politique candidate **b7** retenue : `runs/b7-t2@220` (`policies/candidates/b7/`). Fine-tune depuis vis2 (`policies/candidates/b6/full.json`), seed 8, lr 8e-6, 220 MàJ. **Défaut inchangé** : `current.json` = b5. Jouable : `?policy=b7`. `src/sim.ts`, `NL_CFG.speed` (6), `T_CFG.fwd` (2.5) inchangés. SHA b3/b4/b5/b6 inchangés.

Pas de 33e observation : `observe()` (32) n’a pas la distance T→balise ; l’ajouter empêcherait de charger vis2.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false`.

Arrêt après **3 essais**. Seuils **non tous tenus** : wallHugger 85,5 % (≥ 85 %) mais **−10,5 pts vs b5** (plafond −5) ; kiter **83,5 %** (< 85 %). turret **91,0 % (−4,0 vs b5)** passe le plafond −5.

## Cause (essais)

Le shaping vis2 tire la meute dans le cône. Couper le mur nord sort du cône. L’essai 1 (menace dès x=18 + piquet balise) **augmente les téléports** (29). L’essai 2 retarde le piquet (< 10 m) et récompense la coupe du mur : turret remonte, wallHugger +1,5 pt, kiter casse. L’essai 3 (curriculum kiter depuis t2) empire kiter/elite.

## Tableau b5 / b6-vis2 / b7 (n=200, mêmes seeds)

| Adversaire | b5 WR | b6 vis2 WR | b7 WR | Δ b7 vs b5 | médiane b7 | vis b7 | morts ss dégât T | tel b5 / vis2 / b7 |
|---|---|---|---|---|---|---|---|---|
| march | 98,5 % | 98,5 % | 98,0 % | -0,5 | 36,1 s | 0.686 | 0 | 0 / 0 / 0 |
| turret | 95,0 % | 89,0 % | 91,0 % | -4,0 | 37,8 s | 0.58 | 0 | 0 / 0 / 0 |
| brawler | 97,5 % | 96,0 % | 95,5 % | -2,0 | 37,5 s | 0.657 | 0 | 0 / 1 / 1 |
| backpedal | 99,5 % | 100,0 % | 99,5 % | +0,0 | 36,2 s | 0.66 | 0 | 0 / 0 / 0 |
| wallHugger | 96,0 % | 84,0 % | 85,5 % | -10,5 | 39,2 s | 0.612 | 0 | 2 / 17 / 20 |
| kiter | 87,5 % | 89,0 % | 83,5 % | -4,0 | 38,8 s | 0.599 | 0 | 0 / 0 / 0 |
| elite | 88,5 % | 88,5 % | 85,5 % | -3,0 | 38,7 s | 0.603 | 0 | 0 / 0 / 0 |

Pool : b5 **94,6 %** → vis2 **92,1 %** → b7 **91,2 %**. vis pool vis2 **0.629** → b7 **0.628**.

## Tentatives

| | vis2 | essai 1 (piquet tôt, 240 upd) | essai 2 retenu (wallCut, 220 upd lr 8e-6) | essai 3 (kiter depuis t2, 160 upd) |
|---|---|---|---|---|
| turret | 89,0 % (−6,0) | 86,5 % | **91,0 % (−4,0)** | 90,5 % (−4,5) |
| wallHugger | 84,0 % (17 tel) | 84,0 % (29 tel) | **85,5 %** (20 tel) | 85,0 % (25 tel) |
| kiter | **89,0 %** | 85,0 % | 83,5 % | 81,0 % |
| elite | **88,5 %** | 85,0 % | 85,5 % | 80,0 % |
| pool | **92,1 %** | 89,9 % | 91,2 % | 89,4 % |

## Commandes

```
bun dist/train.mjs --preset b7 --updates 220 --envs 32 --out runs/b7-t2 --seed 8 --lr 8e-6 --init policies/candidates/b6/full.json
bun dist/eval.mjs --pack policies/candidates/b7/actor.json --n 200 --seedBase 900000 --out mesures/nn/b7/eval.json
```

Le défaut du jeu n'est **pas** b7.
