# Opération Cendres — première mission

## Ce qui est jouable
Le Terminator conserve sa visière, son bolter, son gantelet, ses 30 points d’armure et ses commandes FPS. Quatre Night Lords chassent le joueur dans le vaisseau ; six Genestealers peuvent le repérer, contourner les obstacles, frapper après anticipation et mourir sous ses armes. Les Night Lords conservent leurs armures affinées.

Atteindre le noyau, maintenir E immobile pendant quatre secondes, puis revenir au sas initial et maintenir E deux secondes avant la détonation à 90 secondes. Tirer, bouger ou prendre un coup interrompt l’armement. Éliminer la Griffe met fin à la chasse, sans supprimer le sabotage ni l’extraction. Communications écrites de l’escouade séparée, interception vocale, alertes, sons de griffes spatialisés et changement lumineux du noyau accompagnent la progression.

## Apprentissage et limites mesurées
Le PPO existant est une adaptation locale de `IgnitionAI/ignition@52974ec`, pas une nouvelle connexion à un service hébergé. L’acteur partagé emploie les observations et communications du simulateur ; pas de lecture omnisciente ajoutée aux Night Lords.

Deux premières sessions FPS avec anticipation des griffes ont effectivement terminé : 100 mises à jour / 330 165 transitions, puis 1 000 mises à jour / 3 497 280 transitions / 5 223 épisodes. La seconde repart de la première et diversifie les adversaires scriptés. Les gardes de charge machine restent actives. La correction macOS de `df -i` lit désormais le pourcentage d’inodes, et non celui du disque.

Sur 180 épisodes de combat à graines réservées, six tactiques, sans accessoires ni xenos : baseline 35 victoires, premier entraînement 91, second 98. Après comparaison dans le décor complet, l’acteur du premier entraînement est livré dans `policies/mission.json`; les anciennes politiques restent intactes. Les scripts d’évaluation permettent de reproduire les résultats, avec et sans la petite règle de repli d’un chasseur blessé. Une première règle d’encerclement trop directive a été rejetée car elle dégradait les scores. Le repli résiduel est explicitement scripté, pas présenté comme appris.

La fréquence moyenne des situations d’encerclement passe de 5,66 % à 7,54 % ; la part moyenne des coups arrière ne progresse pas (13,53 % contre 13,25 %). Les victoires restent faibles contre les meilleurs adversaires scriptés : 5/30 contre elite, 1/30 contre kiter. Ce résultat ne démontre ni quasi-invincibilité, ni surentraînement, ni difficulté humaine parfaite. Le PPO est entraîné au combat, pas à la bombe et aux Genestealers.

## Vérifications
- Dix tests de mission passent : sabotage/extraction, temporisation, annulation, détonation, interception des projectiles, anticipation et dégâts xenos, navigation, mort sur le dernier tick d’extraction.
- 30 graines de parcours complet avec **tous les accessoires et collisions**, quatre Night Lords, six xenos : 30 extractions pour le pilote armé. Contrôle sans riposte : 30 morts, aucune bombe posée. Le pilote connaît les positions et vise parfaitement ; ce contrôle prouve l’intégration et l’accessibilité, pas le ressenti d’un humain. Il contourne les passages obstrués par les débris.
- Suite complète : 235 tests passent, 1 ignoré, 12 échecs. Les 12 mêmes noms échouaient sur la révision de départ (contrats de vitesse anciens 2,5 contre 5 actuels, anciennes poses caméra, manifeste musical et écriture du rapport). Voir les deux journaux. Aucune affirmation de suite entièrement verte.
- Compilation web et Node réussie. Avertissement de gros bundle du Sas préexistant.
- Contrôle Chromium : quatre armures skinnées, aucun proxy, aucun `pageerror`; animations du Genestealer examinées en plusieurs poses. Six clones partagent géométrie et textures, avec squelettes indépendants.
- Contrôle Studio : marche, rotation, tirs, consommation de munitions, dégâts et défaite observés. Console sans erreur, récapitulatif sans entrée refusée. Les captures en pause montrent les créatures dans le FPS réel.

## Limites de validation visuelle et sonore
Les captures de détail sont des vues de revue du vrai modèle animé, distinctes des captures de jeu. Le rig généré est bipède : les quatre bras existent visuellement, mais ne disposent pas de quatre chaînes de commandes indépendantes. Les animations sont fournies par le modèle puis mélangées selon les états réels.

Le contrôle graphique automatisé emploie SwiftShader : ses temps d’image ne constituent pas une mesure du GPU du joueur. Aucune garantie de 60 FPS. Les ressources sonores se décodent et les événements spatialisés sont branchés ; l’écoute subjective et le mix au casque ne sont pas certifiés par les captures.

## Références consultées
- https://warhammer40k.fandom.com/wiki/Terminators
- https://warhammer40k.fandom.com/wiki/Genestealer
- https://warhammer40k.fandom.com/wiki/Night_Lords
- https://ignitionai.dev/fr
Les pages Fandom directes ont refusé l’accès automatisé ; leurs extraits indexés ont servi de référence. IgnitionAI a été consulté directement et comparé à la provenance du PPO présent.

Aucune publication effectuée.

## Contrôle avec accessoires
- policies/current.json, repli scripté=False : 21/180 victoires, détail [2, 2, 10, 4, 2, 1].
- policies/current.json, repli scripté=True : 21/180 victoires, détail [2, 2, 10, 4, 2, 1].
- runs/mission-fps/actor.json, repli scripté=False : 53/180 victoires, détail [12, 3, 12, 17, 4, 5].
- runs/mission-fps/actor.json, repli scripté=True : 53/180 victoires, détail [12, 3, 12, 17, 4, 5].
- runs/mission-fps-advanced/actor.json, repli scripté=False : 48/180 victoires, détail [4, 12, 8, 13, 8, 3].
- runs/mission-fps-advanced/actor.json, repli scripté=True : 46/180 victoires, détail [4, 11, 8, 12, 8, 3].

Contrôle final son activé : 34 échantillons, aucun manquant, contexte audio en marche, 3 voix actives. Six Genestealers effectivement chargés ; aucune erreur JavaScript. Le compteur de rendu exposé est celui de la dernière passe de post-traitement et ne mesure pas les triangles de toute la scène.

## Navigation et entraînement dans le décor complet
Un troisième entraînement avec `--props true` a terminé 300 mises à jour, 1 029 873 transitions et 368 épisodes, à partir de la première politique FPS. Son résultat est évalué avant sélection : davantage de mises à jour ne garantit pas une meilleure politique.

Le contournement de secours ne remplace une décision apprise que si le déplacement se dirige vers un obstacle. Il utilise la croyance récente du Night Lord, pas la position réelle cachée du joueur. Deux tests supplémentaires passent et vérifient le contournement et le refus d'utiliser une croyance périmée. Les cartes de navigation et masques de collision sont mis en cache, avec une limite de 16 cartes par partie.

Sur la politique FPS longue, avec tous les accessoires, le contournement porte le résultat de 48 à 52 victoires sur 180. Il est scripté, séparé explicitement du PPO.

## Sélection finale
Sur le sous-ensemble identique de 60 épisodes avec accessoires et navigation : première politique 21/60, politique longue 20/60, politique entraînée avec accessoires 21/60. À égalité, la première est conservée : 4/10 contre elite, contre 1/10 pour la troisième. Ce sous-ensemble sert à la sélection et n'est pas un test indépendant. Les politiques expérimentales et leurs journaux restent disponibles. La promesse de quasi-invincibilité n'est pas atteinte et n'est pas annoncée.
