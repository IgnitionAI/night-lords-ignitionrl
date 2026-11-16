# Communications VOX — version complète

- 42 répliques loyalistes : sélection des quatre Terminators, ordres, actions et comptes rendus.
- 6 répliques Night Lords : deux provocations, deux cris de guerre, une réaction de blessure, des dernières paroles.
- 2 vocalisations Night Lords réutilisées : cri de combat et râle de mort.
- 170 fichiers livrés dans la version jouable, dont les variantes de casque des loyalistes.
- Les 77 rendus précédemment présents sont inchangés (empreintes contrôlées).

Les huit interventions Night Lords utilisent le traitement `chaos-vox3` : souffle chuchoté issu des prises existantes, registre grave, bande radio étroite, saturation légère, grésillement et ouverture/fermeture du canal. Le rendu Terminator validé reste inchangé. Le menu **Son → VOX NIGHT LORDS** permet une écoute directe sans dévoiler un ennemi ; **VOX TERMINATORS** reste disponible à côté.

Les voix ennemies proviennent exclusivement des observations du joueur. Une voix et sa file d’attente sont coupées lorsque l’ennemi sort de vue. Une mort déjà observée peut terminer son râle. Les blessures, pertes et fins de partie ont priorité sur les ordres et provocations. Un seul canal vocal joue à la fois ; les répétitions sont espacées et la musique baisse temporairement.

## Vérification

- `completion-check.json` : couverture du catalogue et copie exacte des sons dans la version construite.
- `runtime-check.json` : décodage des 170 sons, lecture des 50 entrées, visibilité et priorité du canal.
- `interaction-check.json` : sélection, ordres, aperçu Night Lords, volumes, mémorisation, baisse puis retour de la musique, affichage mobile.
- `match-check.json` : partie complète de 14 tours résolus, victoire de l’Imperium, 53 interventions vocales et aucun chevauchement ni média manquant. Jouée par commandes de l’interface, avec les observations du joueur uniquement.
- `live-check.json` et `nightlords-radio-menu.jpg` : aperçu accessible dans le menu Son de Genex, sans erreur de console.
- Tests des règles, présentation et voix : 34 réussis.

Les contrôles automatisés valident les médias et leurs déclenchements ; ils ne constituent pas une écoute humaine du nouveau traitement Night Lords.
