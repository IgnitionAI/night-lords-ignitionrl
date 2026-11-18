# Tir sous lumière, chasse pendant les coupures — 18 novembre 2026

Périmètre : mission et duel FPS solo, depuis le dernier build livré sur dev. IgnitionRL, personnages, voix, langues et acquis de locomotion conservés. Aucun changement de couverture ni publication.

## Référence

`before/duel.webm` et `before/mission.webm` : commandes joueur automatisées, sans modification des règles, de la santé ou des positions ; aucune erreur JavaScript. Talos arrive au contact alors que le HUD indique un éclairage stable.

`before.json` : témoin de navigation sur six graines par mode, santé initiale portée à 1000 et circuits imposés pour observer 10 s éclairées, 14 s de blackout, puis 16 s de rétablissement. Ce n'est pas une partie normale ni un test de difficulté. Sous lumière, Talos se stabilise à 1,61 m et prépare quatre frappes en dix secondes ; après rétablissement, il revient à la mêlée. Les politiques de mission gardent elles aussi des occasions de charge sous lumière. Ces choix expliquent le retour du joueur.

## Comportement livré

- Sous éclairage, positions de tir recherchées entre 6 et 10 m du dernier contact, maintien de portée et déplacements près des couverts. Les destinations restent mémorisées quelques secondes ; elles sont réévaluées quand le contact bouge. La visée n'utilise pas la position cachée du joueur. Les murs et les frères qui traversent une ligne de feu empêchent le tir.
- Le blackout du circuit occupé déclenche la chasse. Aucun nouveau tir dans le noir, aucune nouvelle frappe sous lumière. Les chasseurs conservent les approches et contournements existants ; lorsqu'un frère proche et visible prépare une frappe, les autres décalent leur assaut et cherchent un autre angle. Les dégâts n'ont pas augmenté.
- Transition après 0,2 s d'obscurité ou 0,3 s de lumière stable, avec au moins 0,8 s entre deux changements de posture. Une frappe déjà préparée et sa récupération se terminent avant de repartir à distance. Les tirs préparés sont annulés par une coupure.
- Sabotage conservé, interruptible. Le détour vers un circuit ne doit plus ramener volontairement le saboteur à moins de 4 m du contact connu. Vision nocturne automatique et indications FR/EN conservées, selon le circuit du joueur, pas celui d'un ennemi éloigné.
- Face au contact observé, déplacement latéral et repli à allure contrôlée, pose de visée progressive, arrêt pour tirer. Talos, Uzas et Xarl gardent leur arme de mêlée et disposent en mission du bolter existant dans leur main libre. Cyrion et Talos en duel conservent leur bolter droit et couteau gauche. Les traits partent de la main armée. Les armes secondaires n'ajoutent pas de projection d'ombre, afin de contenir le coût du rendu.

## Validation et distinction des preuves

`before/` puis `reload/` reprennent les mêmes commandes joueur automatisées de `scripts/capture-fps-hunt.ts`, sans déplacement forcé, santé modifiée ni IA désactivée. Le temps réel varie légèrement entre captures ; les traces donnent les ticks exacts. Sous lumière, pour les ennemis ayant le joueur en vue, la distance médiane passe de **4,34 à 8,22 m en duel**, et de **3,44 à 7,47 m en mission**. Les échantillons où une griffe est préparée sous lumière passent respectivement de 6 et 7 à zéro. Il s'agit de séquences de combat, pas de missions terminées ni d'une évaluation humaine de difficulté.

`after/` est une capture intermédiaire, avant rétablissement de l'esquive sous lumière. `final/` contient le comportement corrigé, avant l'allègement des ombres des armes secondaires. `reload/` est la dernière version reconstruite.

`combat/duel-fr.webm` suit le cycle naturel tir, sabotage, chasse, rétablissement ; le joueur automatisé meurt au tick 265. `combat/mission-fr.webm` et `mission-en.webm` montrent plusieurs ennemis, tirs à distance, sabotage et rétablissement. Le joueur reste principalement dans une zone éclairée : une coupure voisine n'allume donc pas sa vision nocturne. Les textes français et anglais sont conservés. Le joueur ne finit pas l'objectif de mission.

`blackout/mission-fr.webm` prolonge volontairement l'approche et retarde les tirs du joueur jusqu'à 18 s pour observer l'obscurité. Les règles, la santé et les positions ne sont pas modifiées. La vision nocturne est active sur 61 échantillons ; la meute passe en chasse et se rapproche, puis le joueur peut la repousser en reculant et en tirant. L'image 168 montre le contact en vision nocturne ; l'image 228 montre l'éclairage rétabli. L'absence de frappe dans cette séquence avec recul ne prouve pas la synchronisation des impacts : celle-ci est vérifiée dans les tests et le témoin suivant.

`before.json` et `after.json` comparent **12 témoins déterministes** (six graines, deux modes). Ils imposent les horaires des circuits et une santé initiale de 1000 pour observer tous les états : ce ne sont pas des parties normales. Le duel passe d'une médiane de 1,61 m sous lumière à 8,34 m ; après rétablissement, il revient à 7,46 m. Les douze témoins finaux ne démarrent aucune griffe dans leurs phases éclairées et ne tirent pas pendant leur phase sombre. Quelques impacts après rétablissement proviennent de frappes engagées avant la lumière, comme demandé. Les ennemis non encore en contact dans les grandes cartes de mission sont inclus dans les distances du témoin. Pénétration maximale des murs : moins de 10⁻¹⁴ m (précision numérique). Coût CPU P95 le plus élevé : 10,68 ms pour un pas de 100 ms, sur cette machine.

`motion-mission/` est un **témoin de gestes scénarisés**, utilisant les modèles et l'animateur réels. Les images suivent visée, pas latéraux, repli, retour en garde, frappe droite et tir gauche. Aucun message d'erreur ; contacts plantés stables dans ce témoin. Les tests de mouvement couvrent aussi le couteau gauche du duel, les changements de direction et les cadences 30/60/120 Hz.

## Contrôles et limites

- Dix contrôles ciblés de tactique lumineuse passent : portée, repli, perception, obstacles et alliés, circuits locaux, assauts décalés, restauration pendant la frappe, récupération immobile, changement rapide de zone et sabotage avec vision nocturne.
- Dix tests de mouvement passent, dont la transition visée/repli vers l'arme de mêlée de mission. L'esquive sous visée reste fonctionnelle : une régression de priorité a été détectée et corrigée avant livraison.
- Vérification élargie : **338 réussites, 1 test optionnel sauté, 13 échecs historiques**, de mêmes noms que ceux consignés dans `docs/fps-hunt/NOTES.md` (vitesses historiques, cadrages, gain musical, chemin du harnais). La suite complète n'est donc pas verte ; ces échecs n'ont pas été masqués. Détail dans `tests.log`.
- Aucune erreur JavaScript dans les captures normales, prolongées et de gestes. Dernières captures à 960 × 600 : médiane et P95 d'environ **16,7 ms par image** dans les deux modes. La capture intermédiaire de mission atteignait une médiane de 33,2 ms ; la dernière mesure, après suppression des ombres des armes secondaires, revient à 16,7 ms. Ce sont des mesures de navigateur masqué sur cette machine, sensibles à la charge.
- Reconstruction Studio réussie, avec l'avertissement préexistant de taille de bundle. Les politiques, modèles approuvés, mode tactique et contenus de couverture n'ont pas changé. Le rapport chiffré est `report.json`.

Le ressenti de menace, de précision des gestes et de plaisir reste à apprécier par le joueur dans Reload.

Vérification finale dans l'aperçu Genex : accueil, choix du duel, déploiement et pause observés. `ui-duel.jpg` montre Talos préparant un tir sous lumière. Le récapitulatif confirme quatre entrées acceptées, aucune refusée ou sans effet, et aucune erreur console. Les comparaisons de distance et de mouvement reposent sur les traces et vidéos ci-dessus, pas sur cette seule image.
