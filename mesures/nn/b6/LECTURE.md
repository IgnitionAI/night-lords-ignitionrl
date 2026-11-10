# Lecture b5 vs b6 (#66) vs b6 lisibilité (vis2)

Politique candidate **b6** retenue : `runs/b6-vis2@700` (`policies/candidates/b6/`). Fine-tune lisibilité depuis le candidat mergé #66. **Défaut inchangé** : `current.json` = b5. Jouable : `?policy=b6`. `src/sim.ts`, `NL_CFG.speed` (6), `T_CFG.fwd` (2.5) inchangés.

Éval : 200 parties / adversaire, seeds **900000..900199**, `clawWindup: false`.

Deux tentatives depuis vis2 pour remonter wallHugger/turret (curriculum + intercept ; puis wallTrack + lr 8e-6) : **wallHugger reste < 85 %**. vis2 reste le meilleur compromis mesuré.

## Tableau b5 / b6 #66 / b6 vis2 (n=200, mêmes seeds)

| Adversaire | b5 WR | b6 #66 WR | b6 vis2 WR | Δ vis2 vs b5 | médiane #66 | médiane vis2 | vis vis2 | morts sans dégât T | téléports vis2 |
|---|---|---|---|---|---|---|---|---|---|
| march | 98,5 % | 97,5 % | 98,5 % | +0,0 | 38,4 s | 37,3 s | 0,690 | 0 | 0 |
| turret | 95,0 % | 91,0 % | 89,0 % | −6,0 | 43,8 s | 38,2 s | 0,556 | 0 | 0 |
| brawler | 97,5 % | 95,5 % | 96,0 % | −1,5 | 38,7 s | 38,4 s | 0,653 | 0 | 0,005/p |
| backpedal | 99,5 % | 100,0 % | 100,0 % | +0,5 | 37,3 s | 37,1 s | 0,664 | 0 | 0 |
| wallHugger | 96,0 % | 91,5 % | 84,0 % | −12,0 | 39,0 s | 39,3 s | 0,607 | 0 | 0,085/p |
| kiter | 87,5 % | 86,5 % | 89,0 % | +1,5 | 41,2 s | 40,1 s | 0,621 | 0 | 0 |
| elite | 88,5 % | 87,0 % | 88,5 % | +0,0 | 40,8 s | 40,2 s | 0,615 | 0 | 0 |

Pool : b5 **94,6 %** → #66 **92,7 %** → vis2 **92,1 %**. Moyenne `shareTicksVisible` vis2 **0,629** (≥ 0,6).

## Tentatives wallHugger/turret depuis vis2 (arrêt après 2)

| | vis2 (retenu) | essai 1 (curriculum WH+turret, intercept élargi, 160 upd) | essai 2 (wallTrack mur nord, 180 upd lr 8e-6) |
|---|---|---|---|
| turret WR | 89,0 % (−6,0) | **90,5 % (−4,5)** | **90,5 % (−4,5)** |
| wallHugger WR | **84,0 %** (17 téléports) | 82,0 % (24 téléports) | 81,5 % (22 téléports) |
| kiter WR | **89,0 %** | 78,0 % | 88,0 % |
| elite WR | 88,5 % | 81,5 % | 90,5 % |
| pool | 92,1 % | 89,1 % | 91,5 % |
| vis pool | 0,629 | 0,652 | 0,657 |

Cause : wallHugger colle le mur nord (`y=22,5`) puis la balise. Le shaping de lisibilité tire la meute dans le **cône / couloir** (facing 0). Intercepter le mur sort du cône → `unseenPack` / `outOfCone` combattent l’interception. Forcer le mur (essai 1–2) augmente les téléports et, si on pousse trop, casse kiter.

## Commandes

```
bun dist/train.mjs --preset b6 --updates 700 --envs 32 --out runs/b6-vis2 --seed 12 --init policies/candidates/b6/full.json
bun dist/eval.mjs --pack policies/candidates/b6/actor.json --n 200 --seedBase 900000 --out mesures/nn/b6/eval.json
```

Le défaut du jeu n'est **pas** b6.
