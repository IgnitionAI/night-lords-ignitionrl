# Mission tactique — premier jalon à valider

Cette version ajoute au mode plateau une économie commune de commandement, une main de cartes, quatre capacités et des incidents annoncés. Le mode FPS, les figurines et les voix livrées sont préservés. La campagne à embranchements reste volontairement en attente du verdict du joueur sur cette mission, conformément au plan approuvé.

## Règles jouables

- Quatre Terminators partagent 6 PC par tour. Chacun des deux commandants Night Lords dispose de 4 PC pour ses trois soldats. Une seule action par unité. Sans ordre : attente gratuite, sans surveillance automatique.
- Déplacement (trois cases), surveillance, reconnaissance, interaction : 1 PC. Tir ciblé et capacité : 2 PC. Réserve : 1 PC supplémentaire, réduction de 2 sur le premier impact reçu pendant la résolution. Une réserve inutilisée réduit de 1 les dégâts de décompression.
- Vael rallie : réduit le bruit de 2 et apporte 1 PC au prochain tour. Tor tire pour 2 dégâts et immobilise la cible au tour suivant. Cael stabilise un frère adjacent (+3 armure). Brann ouvre une porte visible à trois cases. Deux charges chacun pour toute la mission.
- Une carte de la main de trois par tour, coût 1 PC. Une carte revient tous les deux tours ; aucune pioche payante. Tir croisé, brèche, couverture, brouillage côté loyaliste ; leurre, sabotage, tir croisé, couverture chez chaque commandant adverse.
- Tir croisé demande deux tirs alliés sur la même case et ajoute un dégât par tir du groupe concerné. Un déplacement simultané peut les faire manquer. Couverture réduit chaque impact de 1. Brèche ouvre les portes adjacentes avant les déplacements mais fait du bruit. Brouillage réduit la vision adverse de deux cases et coupe les échanges de contacts et d’intention au prochain tour. Les leurres ne sont que des échos de secteur, dissipés par reconnaissance à proximité. Sabotage supprime les points des systèmes au contact du groupe ce tour ; reprendre le contrôle ou tuer/éloigner les saboteurs peut le contrer.
- Menace : +1 par tour, plus un point par tranche de trois bruits. Chaque tir compte un bruit, une brèche deux. À chaque seuil de sept, l’incident déjà annoncé frappe un secteur : décompression (2 dégâts dans un rayon de trois cases, protections possibles) ou verrouillage d’une porte. Le seuil et le secteur suivants sont affichés immédiatement.
- Archives : interagir pour obtenir les données, puis les rapporter au sas (3,10) pour 6 points, une fois. Le porteur peut être perdu ; les données redeviennent récupérables aux archives. Stabiliser un frère vivant à 5 armure ou moins apporte 3 points, une fois. Il faut renoncer à d’autres ordres pour investir dans ces actions.

Trois variantes réutilisent le pont et ses trois systèmes. Les points commencent au tour 4. Brèche du pont VII : relais/alimentation/archives valent 1/1/2, seuil de victoire 24 ; Sous tension : 1/3/1, seuil 27 ; Mémoire du Noctis : 2/1/1, seuil 24. Meilleur score après 18 tours, seuil atteint ou élimination décident la victoire. Trois configurations initiales de portes, mains et premier incident sont accessibles au briefing. Le relais garde son bonus de vision et l’alimentation sa réparation locale. Les variantes ne prétendent pas être trois nouvelles cartes géographiques.

## Entraînement effectif

Le projet utilise sa classe `PPO` dans `src/ppo.ts`, adaptation locale MIT d’IgnitionAI/ignition@52974ec. Le framework complet n’est pas installé comme nouvelle dépendance. L’apprentissage met réellement les poids à jour et exporte un acteur chargé par le navigateur, sans appel distant ni apprentissage pendant la partie.

Deux commandants partagent le réseau mais reçoivent des vues différentes : propres unités, contacts datés réellement vus, états connus des portes et objectifs, scores publics, main et budget propres, pression et incident publics. Le brouillage retire aussi l’intention alliée. Ils ne voient ni le monde complet ni les ordres en préparation du joueur.

45 observations, 12 choix : trois objectifs × progression/reconnaissance/pression coordonnée/défense. L’exécuteur mécanique est identique pour la politique apprise, les heuristiques et la référence à objectifs fixes. Les ordres individuels et la navigation sont encore scriptés : ce réseau apprend les priorités et postures, pas chaque pas ni un langage de communication.

540 épisodes / 90 mises à jour / 16 064 transitions : 12 mises à jour de déplacement (6 tours), 18 d’objectifs (12 tours), 60 de combat complet (jusqu’à 18 tours). Les deux premières étapes gardent les loyalistes immobiles ; la dernière emploie trois styles scriptés. Le moteur est le même que celui de la partie. Récompenses de mission, capture, survie, dommages et coopération effective, détaillées dans `training.json`. Retours Monte-Carlo actualisés à 0,97, deux couches de 48 neurones. Les empreintes des poids initiaux/finals et des règles attestent l’export correspondant.

## Évaluation réservée et limites

L’entraînement exclut totalement les configurations dont la graine modulo 12 vaut 5, 8 ou 11. L’évaluation utilise ces trois combinaisons portes/main/incident avec chacune des trois missions et des trois styles de joueur : 27 scénarios par contrôleur, 81 parties. Les cartes géographiques, familles d’adversaires et règles restent connues ; ce n’est pas une preuve de généralisation à un nouveau jeu ou à des joueurs humains. Les répétitions sont déterministes, sans intervalle statistique revendiqué. L’évaluation finale n’a pas été utilisée pour choisir un autre modèle.

| Commandants | Victoires NL | Score NL moyen | Score loyaliste moyen | Survivants NL moyens |
| --- | ---: | ---: | ---: | ---: |
| Scriptés | 23/27 | 21,70 | 9,37 | 2,48 |
| Heuristiques | 23/27 | 23,44 | 10,00 | 2,52 |
| PPO appris | 21/27 | 15,26 | 12,48 | 2,67 |

Le PPO ne dépasse pas la référence sur les victoires et les points. Il conserve un peu plus d’unités. Le mode heuristique reste le choix initial ; PPO et référence sont sélectionnables. Ces chiffres sont affichés dans le débrief avec les décisions réellement prises, les cartes, le bruit et la dépense de PC. Les données cachées ne sont déclassifiées qu’à la fin ou après un abandon explicite.

## Reproduction

```sh
node scripts/build-boarding-training.mjs
node runs/train-boarding.mjs
bun scripts/boarding-evaluate.ts
bun test test/boarding.test.ts test/strategy.test.ts test/strategy-presentation.test.ts test/strategy-vox.test.ts
bun run build:studio
python3 scripts/check-vox-assets.py
```

Le test navigateur `scripts/check-boarding-ui.ts` utilise exclusivement les boutons et les clics sur la carte, avec la vue joueur en lecture seule pour préparer ses ordres. Aucun score, position ou état interne n’est injecté. Il vérifie un dépassement de budget refusé, la réserve, les cartes, une capacité, une partie complète contre PPO, le bilan comparatif, les autres briefings et la largeur mobile. Les preuves sont conservées dans ce dossier. Aucune publication.

Prochain jalon : faire jouer cette mission à Salim, recueillir son verdict sur le rythme et les compromis. La campagne persistante commence seulement après ce verdict.
