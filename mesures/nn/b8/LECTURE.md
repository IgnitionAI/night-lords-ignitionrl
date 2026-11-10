# b8 — observation T→balise + garde conditionnelle (depuis vis2)

Fine-tune PPO après **chirurgie** de vis2 (`runs/b6-vis2`) : `obsDim` 32→34, première couche agrandie, **poids à zéro** sur les deux nouvelles entrées (distance T→balise normalisée, composante de vitesse vers la balise). `src/sim.ts` inchangé (`observe()` reste 32). Le runtime lit `pack.obsDim`.

Candidat retenu : **essai 2** (`runs/b8-t2@140`, `?policy=b8`). Défaut inchangé : **b5**.

Arrêt après **3 essais**. Aucun ne tient tous les seuils. Meilleur compromis : essai 2 (kiter/elite/turret tenables, wallHugger encore sous 85 %).

## Tentatives

| | vis2 | essai 1 (220 upd, lr 8e-6, visKeep 0,12) | essai 2 retenu (140 upd, lr 5e-6, visKeep 0,45) | essai 3 (t2+90 upd, plus de wallCut) |
|---|---|---|---|---|
| turret | 89,0 % | 94,0 % | **91,5 % (−3,5)** | 86,5 % (−8,5) |
| wallHugger | 84,0 % (17 tel) | 81,5 % (23 tel) | **82,5 %** (26 tel) | 74,5 % (36 tel) |
| kiter | **89,0 %** | 80,5 % | 83,0 % | **87,0 %** |
| elite | **88,5 %** | 82,5 % | **85,0 %** | 86,0 % |
| pool | **92,1 %** | 90,1 % | **90,7 %** | 89,4 % |

## Tableau b5 / vis2 / b7 / b8 (n=200, seeds 900000–900199, clawWindup false)

b7 = PR #68 essai 2, non mergée (référence, non touchée).

| Adversaire | b5 WR | vis2 WR | b7 WR | b8 WR | Δ b8 vs b5 | médiane b8 | vis b8 | morts ss dégât T | tel b5 / vis2 / b7 / b8 |
|---|---|---|---|---|---|---|---|---|---|
| march | 98,5 % | 98,5 % | 98,0 % | 98,0 % | −0,5 | 37,5 s | 0,719 | 0 | 0 / 0 / 0 / 0 |
| turret | 95,0 % | 89,0 % | 91,0 % | **91,5 %** | **−3,5** | 38,6 s | 0,600 | 0 | 0 / 0 / 0 / 0 |
| brawler | 97,5 % | 96,0 % | 95,5 % | 95,0 % | −2,5 | 37,8 s | 0,680 | 0 | 0 / 1 / 1 / 1 |
| backpedal | 99,5 % | 100,0 % | 99,5 % | 100,0 % | +0,5 | 36,9 s | 0,681 | 0 | 0 / 0 / 0 / 0 |
| wallHugger | 96,0 % | 84,0 % | 85,5 % | **82,5 %** | **−13,5** | 39,8 s | 0,619 | 0 | 2 / 17 / 20 / 26 |
| kiter | 87,5 % | 89,0 % | 83,5 % | **83,0 %** | −4,5 | 39,6 s | 0,629 | 0 | 0 / 0 / 0 / 2 |
| elite | 88,5 % | 88,5 % | 85,5 % | 85,0 % | −3,5 | 40,0 s | 0,635 | 0 | 0 / 0 / 0 / 2 |

Pool : b5 **94,6 %** → vis2 **92,1 %** → b7 **91,2 %** → b8 **90,7 %** (≥ 88 %). vis pool b8 **0,652** (≥ 0,6). `deathsWithoutTermDamage = 0`. Médianes 36,9–40,0 s.

**Seuils non tenus** : wallHugger 82,5 % (< 85 % et −13,5 vs b5) ; kiter 83,0 % (< 85 %). turret passe (−3,5).

Les deux features ne suffisent pas, en 140 MàJ à 5e-6, à apprendre le basculement « lisible → coupe-route » sans recréer le trade-off kiter de b7. Pousser le wallCut (essai 3) fait exploser les téléports wallHugger.

Jouable : `?policy=b8`. Défaut : b5.
