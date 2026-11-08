# Recette — Le Sas

## Lancer

```bash
bun install
bun run dev
# http://127.0.0.1:18230/web/sas.html?debug=1
```

Production locale :

```bash
bun run build
bun dist/server.mjs
# http://127.0.0.1:18190/sas?debug=1
```

La scène historique reste à `/`. Aucun entraînement n'est lancé.

## Parcours obligatoire

1. Attendre « Système prêt ». Les sept caisses sont posées, aucune ne tombe à travers le sol.
2. Relever `window.__SAS.bodies()` et `window.__SAS.metrics()` en `?debug=1`.
3. Cliquer/toucher **Rafale** ou presser Espace. Les corps reçoivent une impulsion, roulent, se percutent et retombent. Le Night Lord est découvert.
4. Après 2,5 s, relever les positions : au moins six corps sur sept doivent avoir quitté leur position initiale de plus de 0,5 m ; `collisions > 0` ; tous doivent finir au-dessus du sol (`y > 0`).
5. **Recommencer** : positions restaurées, vitesses nulles, nouveau tir possible.
6. Mobile 390×844 : les trois boutons restent dans le viewport, le tap déclenche le même parcours ; le mode est `low`, DPR 1.
7. Sans GLB : bloquer `**/*.glb` ; le repli procédural apparaît avec le bandeau explicite et la physique reste fonctionnelle.
8. `prefers-reduced-motion: reduce` : la physique reste active, l'impulsion verticale est réduite ; aucune secousse caméra n'est introduite.
9. HQ/Éco : le changement ne recrée pas les corps et ne change pas la trajectoire.

## Mesures à conserver

SHA, navigateur, backend `UNMASKED_RENDERER_WEBGL`, viewport, DPR, qualité, versions, draw calls/triangles/textures, nombre de corps, positions avant/après/reset, collisions, frame time médian/p95/p99 sur la même fenêtre. Un résultat SwiftShader décrit SwiftShader uniquement ; il ne vaut pas mesure sur laptop ou téléphone physique.

## Hors preuve

Un build vert ne valide ni cadrage, ni visibilité, ni interaction. Une image seule ne valide pas la physique. Aucune promesse de 60 fps sans appareil GPU déclaré.
