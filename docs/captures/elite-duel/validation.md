# Duel élite et gantelet FPS

Le duel FPS remplaçait la politique entraînée par une routine lente. Il utilise maintenant src/fps-duel.ts, un contrôleur déterministe dédié. Aucun entraînement effectué, aucun poids modifié. Les autres modes conservent leurs règles via eliteDuel=false.

Gantelet : 12 articulations de phalanges, pouce opposé, couplage de poignet, plaques et rails dorsaux ; fermeture accrue en charge, ouverture au rechargement, retour de frappe allongé. Ressources existantes et géométrie locale, aucun achat.

Talos : 5,4 m/s, accélérations 8 m/s pendant 0,5 s espacées de 2,4 s minimum ; choix de côté selon dégagement, recul contre une charge visible, pas de mise à jour de cible derrière un pilier. Attaque annoncée 0,4 s, récupération 0,3 s. Tir prédit sur vitesse observée mais point figé pendant les 0,5 s de préparation. Armure à 24 points, impacts à 0,2 hors ouverture et 1 en récupération ; gantelet 5 dégâts et étourdissement local au contact seulement. Cela inclut un renforcement conséquent de résistance, pas seulement de mobilité.

Validation : 26 tests ciblés passent ; build:web réussi. Live rechargé et utilisé via computer : approche, charge, attaque, mouvement de recul et rechargement observés ; aucune erreur console. Captures jointes prises successivement via les contrôles du jeu, pas des rendus conceptuels.

Évaluation : 5 stratégies scriptées, 100 graines chacune, ancienne routine et nouvelle. Graines 1–100 de réglage puis 1001–1100 de contrôle. Sur contrôle : stratégies simples 0/100 victoires chacune ; bot de poursuite de visée très précise + recul/strafe 32/100 contre 100/100 auparavant. Ce ne sont pas des taux humains ni un entraînement RL ; les graines varient surtout la phase du contrôleur et l’erreur de visée dans une arène identique. La victoire demeure possible. Difficulté humaine quasi impossible non prouvée, réglage à confirmer en jouant. Couvert : évitement de piliers et ligne de vue, pas encore une tactique élaborée de couverture coordonnée. Scope : Talos du duel, pas la meute de quatre agents.
