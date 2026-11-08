# Le Sas — contrat visuel et d'interaction

Issue : IGN-116. Base : `feat/bun` (`70e8b99`, contient Vite #47). Cible de recette : 13/11/2026 12:00 Europe/Paris. Aucun déploiement sans go Salim.

## Une scène, un geste

Le Terminator est vu à l'épaule dans un sas de vaisseau. Sept caisses de fret obstruent un passage. Un Night Lord est derrière, presque perdu dans le brouillard. Le bouton **RAFALE** (ou Espace) tire une salve dans l'empilement : les caisses sont de vrais corps dynamiques Rapier, reçoivent une impulsion, entrent en collision, roulent et retombent. Leur déplacement découvre la silhouette et les yeux du Night Lord. **Recommencer** réinitialise les corps et la mise en scène.

C'est une vignette interactive de rendu et de physique issue du couloir existant, **pas une manche RL**. Aucun changement à `src/sim.ts`, aux politiques ou à l'entraînement. Aucune victoire, score ou faux compteur RL.

## Hiérarchie visuelle

1. **Le geste** : les caisses et leur trajectoire sont le sujet pendant l'impact.
2. **La menace** : après l'ouverture, le regard va aux deux yeux rouges et au liseré froid, jamais à un personnage uniformément éclairé.
3. **Le poids** : le Terminator occupe le tiers gauche, sombre, avec arêtes métalliques et projecteur chaud très bref.
4. **Le lieu** : tôle, membrures, tuyaux, chaînes ; le décor ferme le cadre sans concurrencer l'action.

Palette : noir bleuté `#05080d`, acier `#26343e`, brume `#0b1720`, lumière froide `#87b9d1`, sécurité ambre `#d78032`, yeux `#ff260d`. Albedo désaturé ; le chaud appartient aux événements, pas à l'ambiance.

## Caméra et lumière

- Desktop : perspective 50–58°, épaule, caisses à 4–6 m, Night Lord à 8–10 m. Le sujet reste dans le tiers central.
- Mobile portrait : recul/FOV adapté pour conserver caisses + silhouette ; commandes dans la zone tactile basse, pas de texte minuscule.
- Une clé froide haute et rasante, un projecteur Terminator, un contre-jour derrière la cible. Deux à trois ombres dynamiques maximum ; une seule shadow map 1024 desktop, 512 ou ombres coupées en fallback.
- Flash de bouche 70–100 ms : il éclaire les corps et les parois proches ; impulsion et flash partagent le même événement.
- ACES, exposition fixe et documentée. Bloom seulement sur yeux/flash, vignette légère. Pas de bloom global qui lave les noirs, pas de grain qui masque les matériaux.

## Matières et assets

Réutiliser les GLB **déjà produits** : `web/models/props/crate.glb`, pipes/chains/debris si utiles, `NL-1.glb` et `TERM.glb`. Les binaires restent ignorés par git : leur redistribution publique n'est pas confirmée. Le repli procédural doit rester beau et être marqué « assets locaux absents », sans exception ni écran vide.

Caisses : albedo froid sombre, roughness ≥ 0.65, metalness modéré. Collider cuboïde volontairement simple et stable ; mesh visuel détaillé, jamais trimesh dynamique. Masse cohérente, friction et restitution faibles. Le mouvement doit venir d'`applyImpulse`, pas d'une animation de position.

## Interaction et états

- Chargement explicite, puis état prêt.
- Clic/toucher sur RAFALE ou Espace : une seule salve par refroidissement ; pas de défilement ou zoom accidentel sur le bouton.
- L'impulsion touche plusieurs caisses avec une direction et une atténuation lisibles ; les collisions persistent après le flash.
- Reset complet, bouton qualité, son coupé par défaut si non implémenté.
- `prefers-reduced-motion` : pas de secousse caméra, flash réduit, physique conservée.
- WebGL indisponible ou assets absents : message et repli, pas de promesse silencieuse.

## Preuves exigées

- Captures réelles desktop 1440×900 et mobile 390×844 : prêt, impact, après impact.
- Une preuve d'interaction par positions de corps avant/après et collisions, pas seulement une image différente.
- SHA, navigateur, backend GPU, viewport, DPR et versions enregistrés. Frame times sur fenêtre stable, médiane/p95/p99 ; si SwiftShader, le dire et ne jamais convertir en promesse laptop 60 fps.
- `renderer.info` : draw calls, triangles, textures ; nombre de corps Rapier séparé des instances visuelles.
- Tests et build. Repli sans GLB testé. Reduced motion et reset testés.

## Limites de la première démo

Pas de navigation libre, pas de gameplay RL ajouté, pas de nouvelle génération Genex nécessaire, pas de déploiement public. La qualité et la lisibilité du geste priment sur le nombre d'effets.
