# Noctis — présentation 3D

Cette passe remplace uniquement la présentation du mode stratégie. Les règles,
les observations des agents, les poids PPO, les scores et le FPS restent ceux du
prototype conservé sur `dev`. Aucune publication.

## Contenu

- Caméra 3D orthographique inclinée ; molette, glisser, zoom sur l'unité sélectionnée,
  vue générale et vue de plan. Les cibles se choisissent par intersection avec le sol.
- Armures existantes : un Terminator et quatre silhouettes Night Lords. Des variantes
  tactiques ont été produites dans Blender, avec leurs squelettes et textures conservés.
  Chaque armure et le bolter comptent environ 6 000 triangles, au lieu de 20 000–30 000.
- Assemblages Blender originaux : relais, réacteur, archives, porte gothique et contrefort.
  Leurs machines principales sont dans les espaces techniques hors des cases jouables.
  Les anneaux au sol restent les positions exactes des interactions et des objectifs.
- Coque, parois en coupe, nervures, câbles, machines et coursives visibles. Éclairage
  métallique, rouge d'urgence, cyan du relais, ambre de l'alimentation et archives mauves.
- Marche et attente issues des clips disponibles ; rotations vers la destination.
  Visée, recul, manipulation de l'arme et interaction utilisent des poses du squelette.
  Impacts et morts utilisent les clips fournis, avec une chute articulée pour le Terminator.
  Le rechargement est uniquement visuel : aucune nouvelle règle de munition.
- Trois compositions originales Genex : planification (90 s), combat (90 s),
  débrief (45 s). Quatre bruitages : pas/servo, bolter, porte et impact.
  Le fond industriel existant accompagne l'ensemble.
- Fondu musical, panoramique et atténuation des effets selon la caméra ; ambiance
  du réacteur située dans le vaisseau. Limiteur des effets, quatre volumes mémorisés,
  démarrage après le clic du joueur et suspension quand l'onglet est masqué.

## Frontière des informations

`web/strategy/presentation.ts` filtre la trace de résolution avant de la transmettre
au rendu ou au son. Un ennemi non observé ne reçoit aucun personnage, ordre, trajet,
traceur, flash ou origine sonore dans cette présentation. Un trajet visible qui sort
du champ connu s'arrête à cette frontière. Une découverte apparaît avec la prochaine
observation du joueur. Un impact subi peut être présenté sans révéler son tireur.

Les positions historiques complètes ne sont montrées que dans le débrief après la
fin de partie. Le décor fixe est un plan public du pont, pas un renseignement sur
les unités, les portes réellement cachées ou le contrôle des salles.

## Ressources et preuves

`assets.json` contient les générations, livraisons, coûts effectivement annoncés,
empreintes et nombres de triangles. Aucun plafond de dépense n'a été ajouté.
`audio-analysis.json` mesure les durées et niveaux des fichiers livrés.

`full-match/results.json` contient les trois parties par les commandes de l'interface,
leurs erreurs navigateur, ressources chargées, animations et lectures audio. Leurs
scores reproduisent ceux de la version 2D : heuristiques 12–4 en 11 tours,
référence 17–36 en 18 tours, PPO 31–10 en 21 tours.

`final/report.json` et `final/progress.json` complètent ces traces avec la dernière
version, les positions articulées et des images prises pendant les animations.
`final/door-scan.json` vérifie une fermeture de porte, son bruitage et la reconnaissance.
`final/settings.json` vérifie le silence à zéro et la persistance des volumes.
`rules-tests.txt` couvre les règles tactiques, leur filtrage visuel et les régressions FPS.

La vérification audio par l'outil Genex `inspect_use` a capturé un écran de briefing
sans média actif, distinct de la partie lancée dans le navigateur de validation.
Elle n'est donc pas revendiquée comme réussie. La validation
locale repose sur les médias HTML réellement en lecture, leur avancement temporel,
leur volume, les événements `play`, les ressources HTTP et les mesures des MP3.
Cela ne constitue pas une écoute subjective des enceintes de l'utilisateur.

La définition de la surface 3D diminue automatiquement si les dernières images
dépassent durablement 42 ms. Les textes de l'interface restent à leur définition
normale. Les chiffres mesurés dépendent du moteur graphique utilisé par le navigateur
de test ; ils ne promettent pas le même débit sur toutes les machines.

`hardware/report.json` est le contrôle final avec ANGLE Metal sur le GPU Apple M4.
`final/report.json` conserve la mesure antérieure sous SwiftShader (rendu logiciel).
Les deux modes de rendu sont distingués : le débit logiciel ne mesure pas celui du GPU.
Les assemblages du décor sont regroupés par matériau ; les ombres fixes sont mises
en cache pendant la planification. Un effet nouvellement émis est présenté au moins
un rendu avant que sa durée ne soit décrémentée, même sous un faible débit.

Le contrôle matériel final couvre 21 tours complets : médiane de 16,7 ms et
p95 maximal des fenêtres échantillonnées de 16,8 ms, soit environ 60 images/s.
Aucune erreur navigateur ni ressource HTTP en échec. Le contrôle mobile final
confirme une largeur de 390 px sans débordement ; le FPS démarre toujours.
`validation.json` rassemble les résultats et leurs limites.
