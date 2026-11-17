# Chasse FPS — reprise du 17 novembre 2026

## Référence avant corrections

`before/duel.webm` et `before/mission.webm` sont des parties réelles, graine 527, commandes joueur enregistrées par `scripts/capture-fps-hunt.ts`, sans téléportation ni modification des points de vie. Le duel atteint le tick 55 et la mission le tick 109 avant la mort du joueur. Les traces JSON distinguent le temps réel du tick simulé. Aucune erreur JavaScript dans ces captures.

Les images montrent des passages rapides hors du champ de vision et des préparations au contact. Elles ne suffisent pas, seules, à juger les appuis : la référence détaillée des gestes reste le témoin scénarisé `docs/fps-motion/final/lab` du précédent chantier, utilisant les mêmes modèles et le même animateur au départ de cette reprise.

L'examen du comportement révèle des causes vérifiables : le duel remplace la perception par une simple ligne de vue sans portée ni cône ; les bruits rééchantillonnent leur position à chaque tick ; les directions de déplacement changent sans inertie ; les contournements quantifiés provoquent des zigzags ; les frappes n'ont pas d'arc orienté et la récupération du duel ne bloque pas son mouvement. Les lumières sont fixes dans le rendu actuel : le concept de sabotage et la vision nocturne ne constituent pas encore une mécanique jouable.

Périmètre : mission et duel FPS solo. Modes tactiques, agents IgnitionRL, cartes, personnages, voix et langues conservés. Pas de publication ni de modification de couverture.
