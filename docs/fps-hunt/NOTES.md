# Chasse FPS — reprise du 17 novembre 2026

## Référence avant corrections

`before/duel.webm` et `before/mission.webm` sont des parties réelles, graine 527, commandes joueur enregistrées par `scripts/capture-fps-hunt.ts`, sans téléportation ni modification des points de vie. Le duel atteint le tick 55 et la mission le tick 109 avant la mort du joueur. Les traces JSON distinguent le temps réel du tick simulé. Aucune erreur JavaScript dans ces captures.

Les images montrent des passages rapides hors du champ de vision et des préparations au contact. Elles ne suffisent pas, seules, à juger les appuis : la référence détaillée des gestes reste le témoin scénarisé `docs/fps-motion/final/lab` du précédent chantier, utilisant les mêmes modèles et le même animateur au départ de cette reprise.

L'examen du comportement révèle des causes vérifiables : le duel remplace la perception par une simple ligne de vue sans portée ni cône ; les bruits rééchantillonnent leur position à chaque tick ; les directions de déplacement changent sans inertie ; les contournements quantifiés provoquent des zigzags ; les frappes n'ont pas d'arc orienté et la récupération du duel ne bloque pas son mouvement. Les lumières sont fixes dans le rendu actuel : le concept de sabotage et la vision nocturne ne constituent pas encore une mécanique jouable.

Périmètre : mission et duel FPS solo. Modes tactiques, agents IgnitionRL, cartes, personnages, voix et langues conservés. Pas de publication ni de modification de couverture.

## Comportement livré

- Perception du duel limitée au cône, à la portée et aux obstacles. Les sons donnent un contact approximatif renouvelé toutes les 0,6 s ; une cible perdue est recherchée autour du dernier contact. Les décisions de sabotage et de repli utilisent également ce que l'ennemi sait.
- Navigation continue sous l'interface d'actions existante. Les champs de distance trouvent une cellule accessible quand un bruit tombe dans un obstacle, et regardent plusieurs mètres en avant. Accélération bornée, virage progressif, approches réparties de part et d'autre. La séparation de deux ennemis respecte à nouveau les obstacles. Le rôle de couverture ne reste plus indéfiniment immobile.
- Circuits locaux : sabotage préparé pendant 1,2 s, interruptible par un impact, la mort ou l'éloignement du saboteur. Coupure de 6,5 s et délai avant réutilisation. Au rétablissement, les ennemis proches se replient physiquement vers un abri, sans disparition instantanée du modèle ni téléportation. Ils ne tirent pas pendant ce repli.
- Vision nocturne après 0,4 s d'obscurité ; extinction après 0,5 s de lumière stable, avec transition progressive. Indications FR/EN, lampes modulées par circuit et indices sonores issus des sons existants.
- Mêlée préparée 0,6 s, direction engagée sur les trois derniers ticks, portée/obstacles/arc vérifiés à l'impact. Une esquive peut faire manquer le coup. Récupération de 1 s en duel et 0,7 s en mission ; dégâts conservés. Tirs préparés vers une position observée, arrêt pour viser, pas de tir pendant mêlée, esquive, sabotage ou récupération.
- Esquive de mission étalée sur 0,5 s avec accélération/freinage et récupération. Appuis orientés dans le monde jusqu'au pas suivant, transfert de poids et réaction à l'accélération, frappe plus ample puis retour en garde. Les porteurs de bolter frappent désormais avec leur couteau gauche ; les autres conservent leur arme de mêlée droite. Les morts, déplacements verticaux, armures et équipements existants restent utilisés.

## Comparaison et contrôles

`after/duel.webm` et `after/mission.webm` reprennent les entrées de la référence initiale. Ce sont des parties avec commandes automatisées ; le temps réel et donc les positions finales varient légèrement. `combat/duel-fr.webm`, `combat/mission-fr.webm` et `combat/mission-en.webm` sont des parties plus longues : visée par le gestionnaire de souris normal et commandes clavier, sans modification de santé, de position ou d'IA. Les trois ont montré coupure et rétablissement ; la vision nocturne a été observée sur les images et traces. Aucun message d'erreur JavaScript dans ces captures. La capture du duel prolongé montre Talos repartir derrière un pilier au retour des lumières.

`motion-comparison.mp4` : ancien animateur à gauche, version corrigée à droite. Les mouvements du témoin sont scénarisés, ce n'est pas une partie. Le témoin « before/lab » a été capturé avant la correction de l'animateur, mais après l'introduction de l'éclairage : il sert uniquement à comparer les gestes. La préparation finale passe volontairement de 0,4 à 0,6 s. Les images `action-*` détaillent ce passage à 60 Hz, une image tous les deux rendus. La comparaison conserve les mêmes déplacements, arrêts, réception d'impact et tir.

`evaluation-before.json` et `evaluation.json` comparent 24 scénarios déterministes (six graines, mission/duel, observateur/défenseur), politiques et règles réelles avec commandes scénarisées. Ce ne sont pas des essais humains. L'observateur du duel meurt en moyenne à 10 s contre 4,4 s auparavant ; le défenseur qui vise et esquive gagne les six duels contre zéro auparavant. La mission reste mortelle sans défense, avec une durée moyenne de 18,52 s contre 14,65 s. Cela montre une possibilité de riposte, pas une validation de difficulté par le joueur.

Dans ces scénarios, la pénétration maximale d'un obstacle passe de 0,137 m à zéro. Les pauses de mouvement décelées ne constituent pas une preuve générale d'absence de blocage sur toute la carte. Les contrôles ciblés couvrent en plus le contournement d'un pilier, la séparation, le contact sonore, les attaques sans cible valide, l'esquive d'une frappe engagée et le repli physique.

- 67 tests ciblés réussis : chasse, lumière, duel, mission, résilience, animation, déplacements verticaux, menus, langues et déterminisme. Les derniers ajustements de perception des impacts ont aussi passé les 17 contrôles de combat/lumière concernés.
- Vérification élargie : 325 réussites, un test optionnel sauté et 13 échecs. Les 13 sont reproduits sur la version de départ `5c2bf81` dans une copie de contrôle : anciens contrats de vitesse à 2,5 contre le réglage déjà présent à 5, cadrages historiques, gain musical et chemin temporaire du harnais. Un échec supplémentaire propre à la copie de contrôle vient d'un artefact historique absent ; il ne concerne pas la livraison. Ces défauts hors périmètre n'ont pas été masqués.
- Captures à 960 × 600 : médiane d'environ 16,7 ms par image avant/après. P95 du duel 16,7 ms ; mission 33,4 ms avant et 16,8 ms après, dans ces captures courtes. Mesures en navigateur masqué sur cette machine, pas une garantie sur d'autres machines. Le calcul de simulation le plus coûteux au P95 des essais reste sous 21 ms pour un pas de 100 ms ; charge et caches influent sur cette mesure.
- Parcours de l'aperçu Genex : menu, choix du duel et déploiement observés séparément des captures automatisées. La séquence de commandes suivante a été acceptée sans erreur ; son image finale montre le retour à l'accueil. Les effets précis du recul, du tir et de la pause sont donc attestés par les captures automatisées, pas par cette seule image.

Le rapport chiffré est dans `report.json`. Le jeu reste à apprécier dans Reload : menace ressentie, lisibilité des attaques et sensation du poids ne peuvent pas être validées à la place du joueur.
