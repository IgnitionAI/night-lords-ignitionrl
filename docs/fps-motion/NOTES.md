# Reprise des animations FPS — 17 novembre 2026

## Avant

Les vidéos `before/duel.webm` et `before/mission.webm` enregistrent de véritables parties en vue joueur, graine 527. Le joueur immobile du duel meurt au tick 44 : les images suivantes ne prouvent pas des actions en cours.

Le témoin animé `before/lab.mp4` utilise le rendu, l’armure et les animations du jeu avec une caméra FPS fixe. Ses déplacements et événements sont scénarisés pour permettre une comparaison exacte ; ce n’est pas une partie. Il montre attente, approche, pas latéraux, recul, arrêt, attaque, impact reçu et tir.

Défauts constatés : bascule brutale du corps à l’esquive, esquive complète déclenchée par un simple pas latéral ou arrière, affaissement entre course/attente/attaque, levée excessive des pieds. Sur l’armure actuelle, la tête passe d’environ 1,57–1,64 m en course à 1,30–1,31 m en attente et 1,12–1,19 m pendant le coup. Un pied de course monte au-dessus de 1,2 m.

## Corrections

- Appuis en coordonnées du monde, jambes résolues selon les longueurs réelles du squelette. La cadence et la pose du prochain pied suivent le déplacement affiché, y compris les changements de direction. Les accélérations et esquives rapides peuvent libérer les deux appuis brièvement au lieu d’étirer une jambe.
- Référence commune du bassin, garde compacte, regard stable, rotation du corps limitée et continue. Fin du pas après l’arrêt, sans retour instantané à une autre posture.
- Préparation liée aux 4 ticks du duel ou aux 6 ticks de mission ; arc de frappe avant l’impact réel, récupération en garde. Une préparation interrompue se résorbe sans terminer un faux coup.
- Visée et recul des tirs, réaction brève du torse aux dégâts. Le déclenchement tient compte du tick déjà terminé, même quand l’armure absorbe un tir sans étourdissement.
- Les animations importées de mort et les poses verticales existantes restent utilisées. Aucun modèle, équipement, règle, dégât, mission, agent, menu, texte ou son n’a été remplacé.

## Vérifications et preuves

- `comparison.mp4` : avant à gauche, version finale à droite, même témoin de 10 secondes.
- `final/lab.mp4` et `final/lab/trace.json` : attente, approche, latéral dans les deux sens, recul, arrêt, préparation/frappe/récupération, coup reçu et tir. Les images `action-*` montrent la frappe tous les deux rendus à 60 images/s, en cadrage rapproché.
- `final/duel.webm`, `final/mission.webm` : parties normales, mêmes consignes que les enregistrements de départ. Le temps réel diffère légèrement entre captures ; le témoin est la comparaison déterministe.
- `final/combat/fr.webm` et `en.webm` : déplacement et tirs réels avec visée automatisée par le gestionnaire normal de souris, sans modification de la simulation. Les traces confirment plusieurs réactions aux dégâts dans les deux langues.
- 7 tests ciblés d’animation : appuis, arrêt, sprint à 30/60/120 Hz, rotations, esquives rapides, véritable impact sur l’armure du duel, continuité d’une frappe et de son interruption.
- Vérifications complémentaires : règles du duel et des missions, résilience, menus/chargement et transitions existantes. Un ancien test exige encore une vitesse de Terminator de 2,5 alors que la version de départ `6078618` utilise déjà 5. Cet échec préexistant reste documenté ; la vitesse n’a pas été changée pour le masquer.
- Parcours Genex observé : menu, choix du duel, chargement, déploiement, tir, pause et reprise. Console sans erreur ; récapitulatif des entrées sans échec.
- Seconde lecture des six images espacées de la frappe : hauteur constante, pieds apparemment stables, mais échantillonnage trop éloigné pour conclure sur le passage rapide à l’impact. Ajout de captures rapprochées et d’un test de déplacement de la main entre rendus ; arc ajusté à 0,18 s, impact inchangé.

Le ressenti de menace doit maintenant être apprécié par le joueur dans Reload. Aucune publication, campagne ou couverture modifiée.
