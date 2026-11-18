# Menu et chargements — vérification du 17 novembre 2026

## Parcours livré

Écran titre Noctis, choix tactique / opération Cendres FPS / duel Talos, paramètres, commandes, pause, reprise et retour au menu avec confirmation pendant une partie. Préférence FR/EN et volume général conservés. La transmission vidéo fournie par le joueur est facultative et se lance depuis le menu ; son contenu original reste inchangé.

## Vérifications

Contrôle dans l’aperçu Genex : accueil → choix du mode → chargement → briefing tactique → retour au menu, quatre interactions reconnues, aucune erreur console. Capture : `live-home-fr.jpg`.

- `bun run build:studio` : construction réussie.
- 59 tests ciblés : 0 échec, couvrant chargement, localisation, simulation tactique, présentation, VOX, duel et mission.
- `bun scripts/check-menu.ts` : parcours FR/EN, conservation des ordres, pause pendant une résolution tactique, compteur et position FPS figés, reprise, changements de langue, lecture vidéo, affichage 960 × 600 et 390 × 844 ; aucune erreur de page ni ressource requise manquante. Preuve : `navigation.json` et captures.
- `bun scripts/check-loading.ts` : ressource requise retenue puis libérée, échec HTTP 503 puis réessai réussi, dans les trois modes. Aucun déploiement tant que la scène est incomplète ; bouton de réessai réservé à l’erreur ; aucun pourcentage inventé. Preuve : `loading.json` et captures.
- `bun scripts/check-i18n-smoke.ts` : détection, changement de langue, mémorisation et préparation de mission vérifiés après le nouveau menu.

La progression décrit cinq systèmes réellement préparés ; la barre reste indéterminée, car la taille finale des dépendances n’est pas connue. La scène est rendue avant de proposer le déploiement. Les sons restent diffusés à la demande comme auparavant : cette étape ne prétend pas précharger toutes les répliques VOX.

Les essais de cette étape portent sur les parcours et les pauses ; les parties complètes bilingues de l’étape précédente ne sont pas présentées comme rejouées ici. Les règles et l’entraînement IgnitionRL n’ont pas été modifiés. La campagne attend toujours la validation de la boucle de jeu. Aucune publication ni modification de couverture.
