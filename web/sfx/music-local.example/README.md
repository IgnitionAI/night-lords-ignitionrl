# Banque musicale locale (hors dépôt)

La musique publique du jeu est la banque CC0 de `web/sfx/nightlords/` (`music-explore`, `music-tension`,
`music-combat`). Une musique tierce dont la licence ne couvre pas un jeu peut quand même jouer **sur ta
machine**, depuis `web/sfx/music-local/`. Ce dossier est dans `.gitignore` : il ne part jamais sur GitHub.

## Installation

1. Copie ce dossier : `cp -r web/sfx/music-local.example web/sfx/music-local`.
2. Dépose tes trois boucles `.ogg` dans `web/sfx/music-local/`.
3. Dans `web/sfx/music-local/manifest.json`, mets pour chaque entrée :
   - `file` : le nom du fichier `.ogg`, relatif à `web/sfx/music-local/` ;
   - `gain` : le gain de la boucle (0,38 / 0,44 / 0,5 pour la banque CC0) ; compense les écarts de loudness
     entre tes fichiers pour que les trois phases gardent un niveau perçu cohérent ;
   - `credit` : la ligne affichée dans l'aide et sur l'écran de fin de manche, par exemple
     « Musique : Artiste — Titre (lien) » ;
   - `license` et `source` : pour ta propre traçabilité.
4. Recharge la page. Vérifie `git status` : rien ne doit apparaître sous `web/sfx/music-local/`.

## Comportement

- Seules les entrées `music-explore`, `music-tension` et `music-combat` sont remplacées ; tous les autres sons
  restent ceux de la banque CC0.
- Sans `web/sfx/music-local/manifest.json`, avec un JSON invalide, ou si un fichier local ne se décode pas, le
  jeu revient sans bruit à la boucle CC0 correspondante.
- Le crédit s'affiche seulement si au moins une boucle locale est chargée. Son texte vient du champ `credit`
  du manifeste local, jamais du code.
- Aucun fichier audio tiers ne doit être ajouté au dépôt.
