# Visière phosphore

Référence : capture fournie le 16 novembre 2026. Nouveau cadre angulaire fin vert olive, verre périphérique discret, fines lignes horizontales, bandeau supérieur phosphore, panneaux latéraux translucides et graduations décoratives. Armure et munitions sont des jauges horizontales alimentées par MatchStatus ; temps, charge du gantelet et état de la cible restent des valeurs réelles. Les graduations non chiffrées ne prétendent pas mesurer une distance.

Changements limités à web/index.html, web/visor.css et au sens de remplissage des jauges dans web/camera/fps-hud.ts. Aucun changement des règles, commandes, modèles, sons ou animations.

Vérification : entrée et tir/recul/pause par les commandes du jeu, munitions 30 → 27 visibles, console sans erreur. Capture combat 960 × 600. Vérification Playwright sur le jeu réel à 390 × 720, capture narrow.png, dimensions des panneaux dans layout.json : tous dans le viewport, aucune erreur JavaScript. 15 tests FPS réussis. Build web reconstruit. Pas de publication.
