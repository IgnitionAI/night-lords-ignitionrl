# Reproduire l’essai sur le choix d’objectif

Exécution de référence sur macOS arm64, Node 26.10.0, Bun 1.4.4 et TensorFlow.js Node 4.22.0. Le jeu emploie son adaptation locale de PPO-Clip issue d’IgnitionAI/ignition, dans `src/ppo.ts`. L’acteur et le critique de départ, les acteurs sélectionnés et les résultats individuels sont archivés dans ce dossier.

## Rejouer les parties des modèles gelés

Ces commandes utilisent directement les poids archivés. Les deux évaluations s’effectuent avec les observations individuelles et l’exécuteur du jeu. Les résultats de travail vont dans `runs/boarding/autonomie/`. La dernière commande régénère le verdict et le relevé des parties dans ce dossier.

```sh
for groupe in references 4101 4102 4103; do
  bun scripts/evaluate-boarding-autonomy.ts test "$groupe"
done
bun scripts/evaluate-boarding-autonomy.ts verdict
```

`parties.json.gz` est un objet indexé par contrôleur. Chaque partie contient mission, style loyaliste, configuration, vainqueur, scores et fréquence des objectifs de chaque commandant actif. Le taux de répartition porte sur les tours où les deux commandants ont encore des figurines. Une victoire gagnée ou perdue dans une comparaison appariée correspond au passage entre victoire et toute autre issue sur le même scénario.

## Refaire l’entraînement et la sélection

```sh
node scripts/build-boarding-training.mjs
bun scripts/boarding-demonstrations.ts
for graine in 4101 4102 4103; do
  node runs/train-boarding-autonomy.mjs imitation "$graine"
done
node scripts/run-boarding-autonomy.mjs
bun scripts/audit-boarding-autonomy.ts
for graine in 4101 4102 4103; do
  bun scripts/evaluate-boarding-autonomy.ts select "$graine"
done
bun scripts/evaluate-boarding-autonomy.ts freeze
```

Le dernier appel enregistre les empreintes, la sélection par graine et les politiques exportées. Le candidat et le témoin avec rappels partent de l’acteur obtenu par imitation. Le PPO ordinaire repart directement du modèle historiquement livré. Les deux branches PPO partagent le critique initial. Chaque branche PPO exécute quatre époques par mise à jour avec un lot de 128, Adam à 0,0003 et la récompense de combat du jeu. Les rappels utilisent SGD à 0,003 et exactement les mêmes lots dans les deux branches qui les reçoivent. Le score de sélection est calculé avec les poids exportés arrondis utilisés par le navigateur.

Le contrôle d’intégrité retrouve la politique historiquement livrée à partir de l’archive de départ, vérifie les dimensions des observations, les configurations utilisées par chaque branche, le nombre de décisions et l’extinction des rappels. Sur la machine de référence, une deuxième exécution du préentraînement et du PPO a reproduit exactement les poids des 18 acteurs exportés.

## Vérifier le modèle en partie

```sh
bun run build:studio
bun scripts/check-boarding-policy.ts --experiment
```

Le test joue une mission du build dans Chromium en passant par les commandes de l’interface. Il vérifie l’empreinte des poids reçus, puis les choix, les cartes et les ordres inscrits dans le débrief de fin de partie.
