# Chasse : rythme et information imparfaite

La politique PPO livrée reste inchangée. Le nouveau rythme est une couche de mise en scène déterministe : observation initiale, recherche à couvert, assaut de cinq secondes par une paire alternée, puis repli physique. Les déplacements utilisent les croyances et des patrouilles prédéfinies quand le contact est perdu. Aucun déplacement instantané, bonus de résistance ou changement des armes du Terminator.

Les positions de couverture sont recherchées derrière les obstacles avec une marge pour le corps. La navigation tient compte du rayon du chasseur. Une erreur numérique au contact exact des caisses pouvait bloquer tout départ ; le test de pénétration utilise maintenant la même tolérance que le balayage de collision.

En mission, les flèches de localisation permanente sont retirées. Les directions des impacts restent présentes. La musique de proximité est remplacée par du silence musical ; les événements de combat déclenchent brièvement la tension. Les pas spatialisés, les anticipations des griffes et les voix demeurent ; les provocations sont espacées de 37 secondes.

## Vérifications

- 24 tests ciblés réussis : mission, chasse, collisions des accessoires, non-régression sans accessoires.
- Six graines indépendantes, observateur immobile non armé au carrefour (27,12), tous les accessoires, jusqu’à 116 secondes. Aucun nouveau tir ni armement de griffes hors assaut. Un coup déjà annoncé peut finir au début du repli.
- Pendant 342 secondes cumulées de repli : tous les chasseurs sont hors ligne de vue géométrique pendant 81,2 % du temps ; présence à moins de quatre mètres pendant 5,3 %. Ce sont des mesures de simulation, pas une mesure de peur humaine.
- Parcours complet automatisé : 30 extractions sur 30 avec le contrôleur armé, aucune sur 30 sans armes. Ce contrôleur vise parfaitement : cela ne prédit pas la difficulté humaine.
- Les poids PPO ne sont pas réentraînés et ce travail ne démontre aucun « surentraînement ».

## Limites

Le rythme est écrit et périodique, avec une durée d’approche variable selon le cycle. Les Genestealers restent une menace distincte qui peut interrompre le calme. La peur et le mix sonore doivent être appréciés par une personne ; les captures et statistiques ne les certifient pas.

## Contrôle visuel FPS

Séquence de 66,8 secondes simulées à vitesse normale, après une courte avance depuis le sas : couloir vide, apparition de la Griffe, déplacement latéral puis disparition derrière les piliers. Captures à 10, 25, 33, 44 et 65 secondes dans `docs/captures/hunt/`. Aucun marqueur de position affiché, aucune erreur JavaScript, six Genestealers et les quatre armures chargés, audio déverrouillé sans ressource manquante. Le joueur est resté à distance et n’a subi aucune attaque dans cette séquence ; les impacts et les replis après combat sont couverts séparément par la simulation et les tests. Ce contrôle ne constitue donc pas une validation humaine complète de la peur ni du mix sonore.
