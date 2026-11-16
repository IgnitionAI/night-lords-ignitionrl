# Vaisseau agrandi et Griffe renforcée

## Version jouable

La section passe de 40 × 24 m à 72 × 40 m. Six secteurs relient le sas, les machines, le refroidissement, le contrôle, le noyau et la soute. Des coursives transversales et longitudinales forment des boucles. Le refroidissement comprend une passerelle grillagée au niveau du pont entre deux bassins clôturés ; les machines ajoutent des couverts physiques. Cinq chemins de prises permettent de monter et de traverser au plafond.

Le FPS Terminator, la visière, les commandes, les armes, les modèles et les Genestealers sont conservés. La mission reste : rejoindre le noyau, maintenir E pour armer la bombe, puis rejoindre le sas et maintenir E pour extraire.

Les Night Lords ont 7 points de résistance au lieu de 3. Une rafale complète ne les élimine plus. Le gantelet conserve sa puissance au contact, mais ne paralyse plus les frères éloignés ou cachés. Les esquives parcourent physiquement jusqu’à 2,55 m sur 3 pas de simulation, puis doivent récupérer. Elles ne rendent pas invulnérable.

## Règles, tactique et apprentissage

| Niveau | Responsabilité |
|---|---|
| Règles scriptées | Vue et sons, mémoire limitée, informations vox locales, collisions, navigation, distances et angles de frappe, armement des coups, récupération, trajet physique au plafond, animations et avertissements sonores. |
| Décisions tactiques actives | Meneur, appât, chasseur et intercepteur ; recherche, contournement, attaque d’une ouverture perçue, rendez-vous bref, couverture d’un repli signalé. Les rôles survivent à une perte de contact ; seuls les décès connus changent la composition estimée. |
| Apprentissage conservé | L’acteur PPO antérieur à 32 observations reste utilisé pour certaines actions rapprochées au sol. Ses entrées de mission ne lisent plus l’armure cachée du joueur ni un état de balise invisible. |
| Expériences nouvelles | Trois entraînements PPO réellement exécutés : 60 mises à jour / 17658 transitions,400 / 114920,120 / 33974. Le troisième propose sept choix : assaut, deux contournements, couverture, esquive, plafond, synchronisation. Aucun n’est activé : ils ont moins bien réussi que les règles tactiques. |

Le backend PPO local provient de l’implémentation IgnitionAI/ignition référencée 52974ec. Les trajectoires, collisions et perceptions ne sont pas apprises. Une politique entraînée n’a aucun accès automatique à la position actuelle du joueur caché.

## Vérifications

- 29 tests ciblés réussis, 1515 assertions : connexion des secteurs avec le gabarit du Terminator, chemin alternatif, mission aller-retour physique, interactions, recherche sans cible valide, rôles et décès connus, couverture, synchronisation, esquive, vulnérabilité en hauteur, récupération et frappe après une descente dans le dos.
- Mission complète en FPS, graine 527 : extraction au pas 555, 22/30 d’armure, 68,4 secondes restantes. Déplacements, visée, tir, gantelet et interactions passent par les commandes normales. Aucun déplacement artificiel ni modification de santé. Preuves : `../captures/ship-route-gpu/check.json` et `sequence.json`.
- Captures de l’escalade, de la traversée, de la descente et de la passerelle avec le rendu et les modèles équipés du jeu. Ces scènes ciblées portent la mention « MISE EN SCÈNE » et sont distinctes de la mission jouée : `../captures/ceiling-in-game/frames.json`.
- Comparaison avant/après : 36 affrontements par version, 12 graines distinctes, trois secteurs et trois styles de joueur à perception et rotation limitées. Ancienne version : 0 victoire, 0,167 dégât moyen ; nouvelle : 1 victoire, 4,111 dégâts moyens. Ce test mesure ensemble la carte, la résistance et les tactiques, pas le seul apprentissage : `before-after-builds.json`.
- Dernière politique expérimentale sur la carte finale : 0 victoire et 1,278 dégât moyen, contre 1 victoire et 4,333 dégâts pour les règles. Le modèle passe trop de temps au plafond et n’exploite pratiquement pas l’esquive. Il est rejeté : `tactical-comparison-v3-final-layout.json`.
- Reconstruction Studio réussie. Aucun envoi ni publication.

Les parcours FPS automatisés valident le fonctionnement, pas une difficulté humaine universelle. Des essais précédents se sont soldés par la mort du Terminator, parfois avec deux ou trois Night Lords abattus. Les rapports d’entraînement détaillés et leur portée figurent dans `TACTICAL-ARCHITECTURE.md`.


Deuxième parcours FPS terminé après passage par les accès bâbord : extraction au pas 729, 28/30 d’armure et 61 secondes restantes. Les six Genestealers et les quatre Night Lords ont été éliminés. La navigation contourne les obstacles par les intersections accessibles ; elle ne reste pas obligatoirement dans une seule coursive. Preuves : `../captures/ship-route-gpu-port/check.json`, `sequence.json` et `outcome.png`. Les deux parcours n’ont enregistré aucune erreur JavaScript ni échantillon audio manquant.

Dernière correction de présentation : après extraction, la visière affiche la réussite et « HORS ZONE » au lieu de proposer à nouveau l’armement du noyau. Les tests de mission et la reconstruction ont été relancés après ce changement de texte ; la capture d’issue conserve l’ancien texte secondaire, mais montre bien la victoire effective.
