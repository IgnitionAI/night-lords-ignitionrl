# Preuves visuelles PR #49 — Le Sas

Dispositif : Chromium headless Playwright, `--use-angle=swiftshader --enable-unsafe-swiftshader`, DPR 1, **build** (`bun run build` + `bun dist/server.mjs`), pas un GPU.

Rejouer : `bun run build && bun run proof:sas`  
E2E léger : `SAS_E2E=1 bun test test/sas-e2e.test.ts`

## /sas

| | 1440×900 HQ | 390×844 Éco |
|---|---:|---:|
| 7/7 déplacés (> 0,5 m) | oui (2,06–5,62 m) | oui (2,06–5,98 m) |
| collisions | 38 | 43 |
| tous y > 0 après + reset | oui | oui |
| erreurs page / console | 0 | 0 |
| appels / triangles | 120 / 184 796 | 52 / 60 885 |
| backend | SwiftShader Device (Subzero) | idem |

Fallback : 6 GLB bloqués (12 requêtes en échec, StrictMode), bandeau « Assets locaux absents · repli procédural actif », 7 corps, 0 erreur page.

## / (prototype)

`?shot=8&seed=3&autoplay=march` (prêt), `?shot=14&seed=3&demo=reveal` (impact), `?shot=235&seed=18&autoplay=march` (après). Title `READY`. Un 404 attendu : `web/sfx/nightlords/manifest.json` (banque hors dépôt).
