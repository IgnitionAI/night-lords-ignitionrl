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

### Informations transmises au PPO

Le mode PPO emploie **72 entrées** et garde ses 12 choix, soit trois systèmes et quatre postures. Les 45 entrées du modèle précédent forment le début du vecteur. Pour chaque système, le commandant reçoit aussi sa valeur dans la mission, son exploration, la fraction du groupe à portée d’interaction, sa valeur rapportée au délai de capture estimé, la proximité des derniers contacts pondérée par leur âge et la présence d’un écho dans le secteur. Les autres entrées décrivent la posture alliée annoncée, le type d’incident et l’exposition du groupe à une décompression, les possibilités de tir groupé, les blessures d’une cible à portée et celles du frère le plus touché. Les quatre postures radio valent toutes zéro pendant le brouillage.

Des tests par paires reproduisent trois situations identiques pour le premier réseau. Un verrouillage et une décompression produisaient la même observation, tout comme deux secteurs d’écho ou deux postures alliées visant le même système. Le nouveau vecteur les distingue. Un contact transmis par radio peut renseigner un secteur. Pour compter comme cible de tir il faut aussi qu’il soit visible et à portée.

### Entraînements comparés

Dans le premier programme, le numéro de mission et le style loyaliste dépendaient tous deux du numéro de partie modulo trois. Dans le programme croisé, chaque configuration autorisée rencontre les trois styles sur chacune des trois missions en 81 épisodes. Les configurations réservées restent exclues. Les règles, les ordres, les récompenses de combat et les scripts loyalistes de l’entraînement sont communs aux témoins de chaque expérience.

Trois paires de tirages (8341, 8342 et 8343) ont été entraînées pour chaque programme. Chaque branche de chaque paire dispose de 540 épisodes et de 90 mises à jour. Les fins de mission font varier le nombre de décisions. Les poids initiaux des entrées communes sont identiques et ceux des nouvelles entrées commencent à zéro. La reproduction du premier entraînement à 45 entrées retrouve les poids exportés du modèle d’origine.

- **Programme initial.** Avec le tirage d’origine, le PPO enrichi gagne 19/27 contre 21/27 pour le témoin. [Comparaison des trois tirages](perception-original.json)
- **Missions et adversaires croisés, depuis zéro.** Sur les trois tirages, les PPO enrichis gagnent respectivement 18, 16 et 17 scénarios sur 27. Les témoins en gagnent 21, 16 et 21. [Comparaison appariée](perception-crossed.json)
- **Reprise des poids livrés.** Chaque branche repart du même acteur et du même critique à 45 entrées, avec un taux d’apprentissage de 0,0001. L’entraînement supplémentaire se déroule en missions complètes. Le choix final dans chaque famille utilise 162 parties de développement sur les neuf configurations autorisées et six styles. Le classement privilégie les victoires sur la mission la plus faible, puis les victoires totales et l’écart de score. Le candidat enrichi retenu (8341) a appris sur **18 310 décisions supplémentaires**. [Sélection et essais supplémentaires](perception-continued.json)

### Résultats du modèle livré

Sur le pont du Noctis, les trois configurations réservées (graines 10001, 10004 et 10007) sont combinées avec trois missions et trois styles loyalistes automatisés. Le contrôle à 45 entrées rejoue exactement les résultats précédemment archivés, tout comme les deux références. Le premier essai sur ces scénarios a motivé la comparaison des programmes d’entraînement. Le choix des tirages a été fait sur les configurations de développement. [Résultats par partie](evaluation.json)

| Commandants | Victoires Night Lords | Score NL moyen | Score loyaliste moyen | Survivants NL moyens |
| --- | ---: | ---: | ---: | ---: |
| Scriptés | 23/27 | 21,70 | 9,37 | 2,48 |
| Heuristiques | 23/27 | 23,44 | 10,00 | 2,52 |
| Ancien PPO livré, 45 entrées | 21/27 | 15,26 | 12,48 | 2,67 |
| Nouveau PPO livré, 72 entrées | 21/27 | 14,93 | 12,30 | 2,85 |

Avec le même entraînement supplémentaire, les paires à 45 et 72 entrées totalisent chacune 59 victoires sur les trois répétitions des 27 scénarios. Face à trois nouveaux adversaires qui changent de stratégie pendant une partie, le PPO livré et son prédécesseur gagnent chacun 10/27. La carte et les règles restent communes aux essais.

Sur les 916 décisions du nouveau PPO dans les scénarios historiques, l’ancien modèle aurait choisi un autre objectif 0 fois et une autre posture 339 fois. Avec les poids du nouveau modèle, masquer les 27 entrées ajoutées change le choix final **0 fois sur 916**. L’encodeur transporte davantage d’informations et le réentraînement a changé le comportement. Ces mesures ne permettent pas d’attribuer ces changements aux nouveaux signaux ni de conclure à un gain de victoires.

Une partie complète a également été jouée dans Chromium via les commandes de reconnaissance et de surveillance. La politique reçue par le navigateur correspond à celle livrée, et chacune des 32 décisions des deux commandants sur 16 tours a été reproduite à partir de la vue et du rapport allié du tour correspondant. [Vérification du débrief](ppo-match.json)

Les 54 contrôles tactiques, radio, présentation et langue passent. La suite complète compte 341 réussites, un test ignoré et 13 échecs. Les intitulés des 13 échecs correspondent exactement à ceux du relevé FPS antérieur (dont locomotion, cadrage, musique et harnais de test).

## Reproduction

Depuis la racine du projet, pour reproduire les trois paires finales et le choix du modèle livré, générer d’abord le point de départ historique avec le premier tirage.

```sh
node scripts/build-boarding-training.mjs
node runs/train-boarding.mjs --historical --legacy --seed 8341
for seed in 8341 8342 8343; do
  node runs/train-boarding.mjs --legacy --seed "$seed" --resume runs/boarding/original/boarding-v1-8341/full.json
  node runs/train-boarding.mjs --seed "$seed" --resume runs/boarding/original/boarding-v1-8341/full.json
done
bun scripts/boarding-perception.ts --continued --install
bun scripts/boarding-evaluate.ts
bun test test/boarding.test.ts test/strategy.test.ts test/strategy-presentation.test.ts test/strategy-vox.test.ts test/i18n.test.ts
bun run build:studio
bun scripts/check-boarding-policy.ts
```

Les expériences depuis zéro se reproduisent avec les mêmes tirages et sans `--resume`. Ajouter `--historical` à l’entraînement et à la comparaison pour reproduire le premier programme. La sélection installe les poids uniquement si `--install` est demandé.

Le test navigateur `scripts/check-boarding-ui.ts` utilise exclusivement les boutons et les clics sur la carte, avec la vue joueur en lecture seule pour préparer ses ordres. Aucun score, position ou état interne n’est injecté. Il vérifie un dépassement de budget refusé, la réserve, les cartes, une capacité, une partie complète contre PPO, le bilan comparatif, les autres briefings et la largeur mobile. Les preuves sont conservées dans ce dossier. Aucune publication.

Prochain jalon : faire jouer cette mission à Salim, recueillir son verdict sur le rythme et les compromis. La campagne persistante commence seulement après ce verdict.
