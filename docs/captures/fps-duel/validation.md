# Première version FPS — 15 novembre 2026

Duel jouable par défaut, sans publication. Les anciennes vues restent accessibles par leurs paramètres cam.

## Réalisé

- Souris directe dans le repère caméra ; solution de repli sans pointer lock pour l’aperçu intégré. Déplacements latéraux, diagonale plafonnée, freinage rapide. Entrées brèves de tir, poing et rechargement mémorisées entre deux ticks.
- Bolter GLB existant, bras et gantelet de premier plan redimensionnés, recul amorti, manipulation pendant le rechargement. Récupération visuelle après la mort de la cible.
- Un Night Lord : déplacement latéral, tir annoncé sur une position mémorisée (esquivable), approche, préparation et impact au contact. Trois impacts de bolter ou un poing au contact le tuent.
- Clips existants conservés : approche, marche/course, esquive, attaque, impacts et mort. Correction de measureForwardStride : Skeleton.pose() réécrivait la transformation du Hips sous une Armature mise à l’échelle. Les transformations locales sont maintenant restaurées exactement. La disparition temporaire du corps pendant les transitions a été observée avant correction.
- Le corps termine son animation de mort après la fin du duel. Écran de victoire propre au prototype ; pas d’appel au réentraînement.

## Vérification

- Compilation web/dist avec bun run build:web réussie, puis computer reload.
- 24 tests ciblés réussis : commandes FPS, visée horizontale/verticale, trois impacts, rechargement, esquive du tir ennemi, poing, caméra/HUD, conservation de la pose de référence et clips existants. Les avertissements de textures blob des tests de squelette viennent du chargement sans navigateur ; les textures sont visibles dans Live.
- Parcours computer réel : tourner à gauche/droite, avancer, se déplacer latéralement, tirer en visant et en visant le plafond, recharger jusqu’à 30, subir un tir annoncé, esquiver un tir, affronter au contact et gagner au poing. Victoire bolter revérifiée après la dernière compilation. Console finale : aucune erreur. Recap : toutes les entrées acceptées.
- Captures : reload.jpg puis reload-complete-strafe.jpg ; melee-anticipation.jpg puis melee-victory.jpg ; aim.jpg, death-motion.jpg et death-settled.jpg. Ces images viennent de plusieurs duels de vérification successifs, pas d’une séquence continue. final-victory.jpg correspond à la dernière compilation.

## Limites connues

Prototype de duel, pas une campagne ni une refonte artistique complète. Le bolter reprend la géométrie existante ; les bras sont construits dans le rendu. Le Night Lord conserve sa géométrie et ses textures détaillées, dont l’aspect reste chargé. Le rechargement est une manipulation de l’arme, pas un démontage du chargeur intégré au GLB.

La suite historique complète n’est pas verte : lors du passage initial, 209 succès, 1 ignoré, 12 échecs. Plusieurs assertions exigent encore 2,5 m/s alors que le déplacement à 5 m/s précédait ce chantier ; deux scénarios caméra historiques dépendent des anciens timings ; un test du harnais refuse le chemin temporaire macOS. Ces tests anciens n’ont pas été réécrits pour masquer ces écarts. Le fichier de capture généré par les tests historiques a été remis à son contenu initial.

Le redimensionnement est pris en charge par les caméras et la cible de rendu ; l’outil computer impose 960 × 600, donc pas de validation visuelle à une seconde taille dans cette passe.
