# Lecture : l'armement des griffes change les durées, pas l'issue

Deux évaluations de `policies/current.json`, **200 parties par adversaire** sur les **mêmes graines** (`900000..900199`), 7 adversaires : `mesures/eval-armement-off.json` (`clawWindup: false`, griffe instantanée — c'est la manche des mesures b3) et `mesures/eval-armement-on.json` (`clawWindup: true`, `armTicks = 2`, la griffe est annoncée puis tombe deux ticks plus tard après re-vérification de la portée et de la zone). Les deux fichiers ne diffèrent que par ce champ : même `pack`, mêmes `seeds`, même nombre de parties. La comparaison est donc appariée graine par graine.

`clawArms` compte les annonces `clawArm` ; il reste à 0 quand l'armement est coupé, non pas parce que la griffe ne part pas, mais parce que le compteur n'est incrémenté que sous `clawWindup` (`src/evallib.ts`, boucle de `runGames`).

| Adversaire | Victoire meute OFF | Victoire meute ON | Écart (points) | Durée médiane OFF (s) | Durée médiane ON (s) | `clawArms` ON |
|---|---|---|---|---|---|---|
| march | 91,0 % | 91,0 % | 0,0 | 28,9 | 29,6 | 3 975 |
| turret | 53,0 % | 52,5 % | −0,5 | 38,5 | 38,8 | 2 174 |
| brawler | 73,0 % | 73,0 % | 0,0 | 28,5 | 29,2 | 3 455 |
| backpedal | 98,5 % | 98,5 % | 0,0 | 30,3 | 31,1 | 4 988 |
| wallHugger | 88,5 % | 89,5 % | +1,0 | 42,1 | 42,2 | 4 114 |
| kiter | 43,5 % | 44,5 % | +1,0 | 33,4 | 35,3 | 2 021 |
| elite | 46,5 % | 47,5 % | +1,0 | 34,2 | 35,1 | 1 911 |
| **TOTAL** | **988 / 1400** (70,6 %) | **993 / 1400** (70,9 %) | **+0,4** | — | — | 22 638 |

## Ce que ça montre

Le mécanisme tourne : 22 638 griffes armées sur 1 400 parties (2 021 à 4 988 par adversaire, soit une quinzaine par manche), et les manches s'allongent toutes — de 0,1 s (wallHugger) à 1,9 s (kiter), 0,8 s en moyenne sur les sept médianes. Le télégraphe coûte donc bien du temps de jeu réel. Mais **l'issue ne bouge pas** : 988 victoires sans armement, 993 avec, sur 1 400 parties, et des écarts qui vont de −0,5 à +1,0 point par adversaire, sans direction commune (turret perd un demi-point, les trois adversaires jamais vus à l'entraînement en gagnent un).

## Pourquoi ce n'est pas un échec de mesure

Un écart nul est un résultat, pas une absence de résultat : la question posée était « l'armement change-t-il ce que la meute gagne ? », et la réponse mesurée est non, à cette résolution. La preuve que la bonne règle a tourné est dans les fichiers eux-mêmes : `clawWindup` vaut `false` dans l'un et `true` dans l'autre, et `clawArms` passe de 0 à 22 638 — on ne compare pas deux exécutions du même code. Il faut aussi lire ces écarts à leur taille : sur 200 parties, 1 point vaut 2 parties, et le bruit d'échantillonnage d'un taux voisin de 70 % est de l'ordre de ±3 points ; des écarts de −0,5 à +1,0 point sont dans ce bruit. Ce qui n'est **pas** dans le bruit, c'est la durée médiane et le compteur d'armements : c'est sur eux que repose la conclusion « le mécanisme agit », pas sur un taux de victoire qui ne peut pas la porter à 200 parties.

## L'arithmétique qui explique

La fenêtre d'esquive vaut **2 ticks**, et le pas de simulation est de **0,1 s** (`DT` dans `src/sim.ts`) : la fenêtre dure donc **0,2 s**. À la marche du Terminator (1,5 m/s en arrière ou de côté, `T_CFG.back`/`strafe`) cela fait **0,30 m** de déplacement possible, **0,50 m** à la course (2,5 m/s, `T_CFG.fwd`) — et seulement **0,09 m** depuis l'arrêt, parce que l'inertie impose une rampe (`accel = 3 m/s²`, soit `accel · DT² · 3` sur deux ticks ; voir `test/claw-windup.test.ts` et l'encadré correspondant du `RAPPORT.md`).

Reste à comparer cette fenêtre à ce qu'il faudrait parcourir. La griffe part à `clawRange = 1,75 m` (`NL_CFG`) et n'atterrit que si la cible est encore à portée deux ticks plus tard ; le contact des corps est à 1,25 m (0,45 + 0,80 de rayons), donc la marge à combler pour esquiver est **au plus 0,50 m**, et exactement 0 pour une griffe déclenchée au contact. Or dans ces mêmes 0,2 s le Night Lord qui poursuit va à **6 m/s** (`NL_CFG.speed`) : il comble 1,2 m, soit plus du double de la fuite maximale. L'esquive n'est donc atteignable que si le Terminator est déjà lancé à pleine vitesse **et** que le poursuivant n'avance pas — c'est-à-dire jamais dans la situation où une griffe part. Le `whiff` existe bien dans le code et les tests le prouvent (`test/claw-windup.test.ts`), mais une fenêtre qui ne s'ouvre que par accident n'est pas une fenêtre jouable : le télégraphe ajoute du temps de manche, il ne rend pas la griffe évitable.
