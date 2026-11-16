# Guerre de coursives — prototype de stratégie

Le concept a été approuvé dans la conversation : quatre Terminators contre deux commandants Night Lords, trois systèmes disputés, ordres simultanés. Le FPS reste accessible par `web/fps.html` ; son HTML original est conservé à cet emplacement et ses modules ne sont pas modifiés. La page d’entrée présente désormais la stratégie. Rien n’est publié.

## Partie

Une action par unité et par tour. Déplacement jusqu’à trois cases, tir dirigé vers une case visible, surveillance (un tir de réaction), reconnaissance, interaction adjacente avec une porte ou un système. Les échanges de tirs sont simultanés : une unité touchée mortellement conserve son tir préparé ce tour. Les tirs ne suivent pas une cible qui change de case. La surveillance constitue une riposte aux déplacements.

Les systèmes donnent des points à partir du tour 4. Relais : un point et une case de portée visuelle supplémentaire. Alimentation : un point et réparation d’un point d’armure pour une unité proche, chaque tour. Archives : deux points. Victoire à 36 points ou au meilleur score après 24 tours ; élimination totale également décisive. Égalité possible. Une opération abandonnée est explicitement identifiée comme telle.

La durée de 15–20 minutes est une cible de conception, pas une mesure validée sur des joueurs humains. Le temps de réflexion n’est pas limité. Les tests automatiques jouent beaucoup plus vite.

Commandes : clic sur une unité ou carte d’escouade, bouton d’action, cible sur la carte. Une interaction sur la case occupée par l’unité est possible. Maj + clic adresse un ordre à une case occupée par un allié. 1–4 sélectionnent les unités ; M/T/G/R/E choisissent déplacement/tir/surveillance/reconnaissance/interaction ; Entrée exécute. Les ordres peuvent être modifiés ou effacés avant résolution. Sans ordre : surveillance. La colonne de commandes défile sur les petits écrans ; le bouton d’exécution reste accessible.

## Frontière entre règles et agents

- `src/strategy/engine.ts` : géométrie, collisions, visibilité, mémoire, légalité des actions, résolution simultanée, dégâts, objectifs et victoire. Les routes préparées utilisent les portes connues ; une porte cachée fermée bloque le chemin sans fournir un détour omniscient.
- `src/strategy/agents.ts` : chaque commandant reçoit un `View` indépendant contenant ses propres unités, les contacts et leurs dates, les états de portes/objectifs effectivement observés, les scores publics. Aucun accès à `World` ni aux ordres préparés par le joueur. Les contacts sont transmis par radio sans changer leurs dates. L’intention alliée reçue est celle du tour précédent, pour éviter un ordre de calcul privilégiant un agent.
- Les agents choisissent l’un de six objectifs tactiques : trois systèmes × assaut ou reconnaissance. L’exécution des ordres individuels est scriptée et identique dans tous les modes : navigation, tir sur un contact visible, capture, ouverture de porte, reconnaissance/surveillance. Ce prototype n’apprend pas les règles de mouvement ni un langage de communication.
- Chaque commandant contrôle trois Night Lords. Les deux politiques partagent leurs poids, avec un indicateur de commandant dans l’observation. Ils ont des états d’information distincts ; ce ne sont pas deux réseaux entraînés séparément.
- Vision de base : six cases, reconnaissance dix, bonus du relais un. Les souvenirs expirent après trois tours sans confirmation et sont invalidés lorsqu’une ancienne position est inspectée et trouvée vide. La carte structurelle et l’emplacement des portes/objectifs sont publics ; leur état non observé est inconnu (porte supposée ouverte pour planifier). Les scores sont publiquement diffusés.

## IgnitionAI et apprentissage effectif

La dépendance npm du framework complet n’est pas installée ici. Le projet possède `src/ppo.ts`, une adaptation locale attribuée à `IgnitionAI/ignition@52974ec`, PPO-Clip acteur-critique sous MIT. Le nouveau script appelle réellement cette classe `PPO`, effectue les mises à jour, exporte les poids et les charge dans le navigateur via l’inférence pure JS de `src/policy.ts`. Il ne s’agit ni d’un LLM interrogé à chaque tour, ni d’une intégration annoncée sans exécution.

L’observation compte 25 valeurs, toutes dérivées du `View` et de l’intention alliée reçue : phase, effectifs/armure propres, contacts connus, scores, contrôle connu/distances/contacts autour de chaque système, visibilité, état de reconnaissance stratégique et identité de commandant. Six sorties correspondent aux choix ci-dessus.

Entraînement : récompense commune aux deux commandants, `0.1 × variation de différence de score + 0.025 × variation de différence d’armure + victoire/défaite ±2`. Retours Monte-Carlo actualisés à 0,97, PPO-Clip, deux couches de 32 neurones, graine 2718. Les adversaires d’entraînement n’utilisent que la vue du joueur. Les poids sont gelés en partie ; aucune adaptation des poids aux clics du joueur n’est prétendue.

Premier essai : 100 mises à jour, 24 308 transitions. Deuxième essai : 400 mises à jour, 98 040 transitions ; poids livrés dans `policies/strategy-actor.json`. Les historiques réels sont dans `training-v1.json` et `training.json`. Le constructeur TensorFlow nécessite un shim de compatibilité `node:util` sous Node 26, appliqué uniquement par le lanceur de compilation.

## Comparaison

Trois modes disponibles au briefing : référence scriptée à objectifs fixes, commandants adaptatifs heuristiques, commandants PPO. Les trois modes utilisent les mêmes unités, perceptions, budgets d’actions et exécuteur ; seuls les choix stratégiques changent.

`comparison.json` contient 12 scénarios distincts par mode : quatre configurations initiales de portes × trois styles de joueur scripté (répartition des objectifs, priorité archives puis relais, choix adaptatif). Les configurations identiques sont dédupliquées. Graines d’évaluation à partir de 10000, hors plage d’entraînement 1–2400. Attention : les configurations de carte et les familles d’adversaires sont connues durant l’entraînement ; ceci teste les résultats comparatifs, pas une généralisation à des cartes ou adversaires inédits. Aucun intervalle de confiance sur ces parties déterministes répétables.

Résultats du deuxième entraînement :

| Mode | Victoires Night Lords / 12 | Score Night Lords moyen | Score joueur moyen |
| --- | ---: | ---: | ---: |
| Objectifs fixes | 4 | 20,42 | 23,33 |
| Heuristiques adaptatives | 5 | 22,58 | 19,58 |
| PPO appris | 6 | 16,83 | 20,17 |

La politique PPO est proposée par défaut si les poids chargent : elle gagne davantage sur ce petit banc, mais son score moyen est inférieur et elle ne domine pas tous les styles. Le sélecteur conserve les deux références. Le premier essai, moins efficace, n’est pas utilisé. Les anciens résultats `comparison-v1.json` incluent des configurations répétées et sont conservés comme journal, pas comme preuve supplémentaire.

## Débrief et confidentialité

Les décisions, vues reçues, ordres, positions avant/après, états de portes/objectifs et événements sont enregistrés à chaque tour. Le débrief n’est accessible qu’après la fin ou un abandon explicite. Il montre des traces factuelles, pas des pensées reconstruites. L’export JSON inclut le seed, le mode et la chronologie complète. Les captures de relecture affichent l’état du tour choisi. L’interface de diagnostic `render_game_to_text` expose seulement la vue joueur et ses ordres, jamais les plans ennemis pendant la partie. Il s’agit d’un jeu local : ce cloisonnement n’est pas une protection contre un joueur modifiant son propre navigateur.

## Reproduction

```
bun test test/strategy.test.ts
node scripts/build-strategy-training.mjs
STRATEGY_UPDATES=400 node runs/train-strategy.mjs
bun scripts/strategy-evaluate.ts policies/strategy-actor.json
bun run build:studio
bun run dev
bun build scripts/check-strategy-ui.ts --target=node --outfile=runs/check-strategy-ui.mjs --external=playwright
node runs/check-strategy-ui.mjs
```

Les tests navigateur choisissent des ordres uniquement depuis la vue joueur, puis utilisent les boutons et la carte. Ils vérifient que les ordres préparés correspondent aux demandes, terminent les parties et testent débrief, export et relecture. Ils ne téléportent aucune unité et n’altèrent ni points de vie ni scores. Les traces et captures finales du build livré résident dans `docs/strategy/ui-final/`. Les captures `ui/` conservent les essais de développement.

## Validation finale

18 tests stratégie réussis ; 25 tests ciblés de régression du FPS réussis. Trois parties complètes du build navigateur par boutons/carte : victoire Imperium en mode adaptatif (11 tours), victoire Night Lords en référence fixe (18 tours), victoire Imperium face au PPO (21 tours). Les ordres préparés sont comparés aux ordres demandés à chaque tour. Débrief, export JSON et relecture vérifiés dans les trois modes, sans erreur JavaScript. Le FPS conservé charge son rendu sans erreur et son HTML est identique à celui précédant la réorientation. Les pages, scripts, feuilles de style et poids répondent tous HTTP 200 via le serveur local compilé.

`validation.json` résume ces résultats et contient le SHA256 de la politique livrée. La build navigateur et les bundles Node compilent. La capture `reload-ready.jpg` montre le mode stratégie dans la fenêtre 960×600 de Reload, avec toutes les actions principales accessibles. Les gros bundles du mode FPS/SAS existant produisent toujours un avertissement de taille Vite ; le module stratégie est séparé.
