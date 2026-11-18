# Français / English — interface et VOX

Le choix FR / EN est disponible au briefing, dans les paramètres et dans le débrief tactique, ainsi que sur le mode FPS. La première visite utilise la langue principale du navigateur : français pour `fr-*`, anglais sinon. Le choix explicite est conservé sous `noctis-language`, partagé entre les deux modes. Une indisponibilité du stockage n’empêche pas de jouer.

Le changement conserve la partie, les ordres en préparation, les options du briefing et les contrôles. Les textes déjà affichés sont retraduits, y compris les journaux, les infobulles et les panneaux 3D. Une transmission vocale en cours est coupée lors du changement de langue ; la file est vidée pour éviter de mélanger une voix et un sous-titre de langues différentes.

## Textes et règles

`web/i18n/messages.json` est le catalogue commun, avec des phrases françaises comme clés de traduction. La traduction s’applique explicitement à la présentation : texte, titre accessible et infobulle. Les attributs `id`, `value`, `data-*`, les URL et les observations des agents ne sont jamais traduits. Les événements historiques restent dans leur forme originale et sont traduits à l’affichage. Les règles et l’empreinte exigée par la politique entraînée restent inchangées.

Le catalogue couvre les trois variantes, les cartes et capacités, les incidents, les objectifs secondaires, les ordres, les commandes, les résultats et les bilans IgnitionRL, ainsi que le casque FPS, les messages de mission, les contrôles et les comptes rendus de manche. Les noms des personnages et les noms propres sont conservés. L’export JSON garde ses identifiants et son format original.

## Doublage

48 nouvelles prises anglaises ont été générées et récupérées une seule fois chacune : 42 répliques loyalistes et 6 répliques Night Lords. Les deux vocalisations sans paroles existantes sont réutilisées. Les mêmes profils de casque sont appliqués aux personnages ; les Night Lords utilisent le traitement de murmure `chaos-vox3`. Cela produit 50 entrées et 170 fichiers audio anglais, tous livrés localement. Aucun service de synthèse n’est appelé pendant la partie.

Les répliques et leurs locuteurs suivent les mêmes déclencheurs, priorités et limites de perception que les voix françaises. Le FPS dispose aussi des aperçus Terminator / Night Lords et utilise la VOX localisée pour ses transmissions. Les messages de mission qui étaient uniquement textuels restent textuels, traduits avec leur locuteur ; aucun dialogue narratif supplémentaire n’a été inventé.

Les 77 fichiers français précédemment approuvés restent identiques. Les catalogues FR et EN ont exactement les mêmes identifiants, événements, factions et destinataires. La durée maximale des prises anglaises traitées est de 2,88 secondes. Les sous-titres anglais correspondent aux textes envoyés à la génération.

## Vérification

Les preuves sont les rapports `ui-match-fr.json`, `ui-match-en.json`, `fps-fr.json`, `fps-en.json`, `voice-validation.json` et les captures de ce dossier. Les parties utilisent les contrôles de l’interface ; aucun score ou état de victoire n’est injecté. La vue joueur est lue pour préparer les ordres du test tactique. Les résultats d’IA montrés restent ceux du jalon précédent, pas un nouvel entraînement.

Les tests FPS distinguent le manifeste facultatif de la banque musicale personnelle, déjà absent de cette version, des sons et voix nécessaires. Cette banque facultative renvoie 404 ; les sons du jeu fonctionnent et aucune voix requise ne manque. Les mesures de lecture reposent sur les événements du lecteur audio et son état dans le navigateur, sans prétendre certifier les haut-parleurs physiques.

Reproduction :

```sh
bun test test/i18n.test.ts test/boarding.test.ts test/strategy.test.ts test/strategy-presentation.test.ts test/strategy-vox.test.ts test/fps-duel.test.ts test/fps-cam.test.ts test/weapons.test.ts test/audio.test.ts
bun run build:studio
python3 scripts/check-english-vox.py
python3 scripts/check-vox-assets.py
bun scripts/check-i18n-smoke.ts
bun scripts/check-i18n-match.ts fr
bun scripts/check-i18n-match.ts en
bun scripts/check-i18n-fps.ts fr
bun scripts/check-i18n-fps.ts en
```

Les vérifications navigateur utilisent la version reconstruite servie localement au port 18231. Elles nécessitent que macOS autorise le navigateur de test. Aucune publication et aucune modification de couverture. La campagne demeure un jalon distinct, après validation de la boucle tactique.
