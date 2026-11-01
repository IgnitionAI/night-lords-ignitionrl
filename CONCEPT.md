# Démo « La Meute » — Night Lords contre un Terminator (brouillon de brainstorm)

Brouillon de cadrage du 31/10/2026, publié tel quel à titre d'archive : certaines options ont été tranchées depuis (voir README et RAPPORT).
Cadre retenu : **un seul Terminator joueur contre la meute**. La démo est autonome et séparée du framework IgnitionRL. Projet de fan non officiel : Warhammer 40,000 et Night Lords sont la propriété de Games Workshop.

## 0. Ce qui existe déjà (lu le 31/10)

| Brique | Où | Ce qu'on peut reprendre |
|---|---|---|
| Framework RL navigateur (le « IgnitionRL » public) | `IgnitionAI/ignition` (main 52974ec, 16/10) | `@ignitionai/core` (`IgnitionEnv`, espaces discrete/box/multidiscrete) ; `packages/backend-tfjs/src/agents/{ppo,dqn,qtable}.ts` ; backend TF.js webgpu, webgl, wasm, cpu ou **node** (`utils/backend-selector.ts`, donc on peut entraîner sans navigateur) ; `packages/backend-onnx` pour l'export et l'inférence |
| **The Crucible**, un duel 40k déjà jouable | `ignition/packages/demo-cage-duel` | Three.js 0.162 + Vite. Une sim à tick fixe de 100 ms, la même pour le rendu et l'entraînement. Q-table Ignition entraînée dans le navigateur, évaluée sur des seeds séparées (101 à 1901). Caméra épaule, contrôles ZQSD et tactiles. Testé en 1440×900 et 390×844 (README, VALIDATION.md) |
| Assets 3D Crucible | `demo-cage-duel/public/models/` | `cage-blender.glb` et `marine-base-blender.glb`, faits maison avec Blender (scripts dans `art/blender/`). `chainsword.glb` est sous **CC BY 4.0** (Kaiser-E) : attribution obligatoire |
| Modèle tiers + clips Mixamo | `art/mixamo-integration.md` (sources non publiques) | Squelette de 55 os et pipeline de retarget Mixamo (`retarget_mixamo.py`). La licence du modèle pour une publication n'est pas vérifiée : non utilisé ici |
| Studio RL R3F | `IgnitionAI/IgnitionRL`, cloné (98a56bc, 29/05) | Statut « paused / public research artifact », Tauri + Rust. À ne pas confondre avec le framework, et inutile ici |
| Multi-agent / self-play | `ignition/roadmap.md` Phase 5 | **Pas fait** (cases non cochées). Il faudra écrire une boucle multi-agent dans la démo |
| Ancienne démo PPO + Three.js | `salim4n/3D-Driving-AI-PPO` (2024) | Pour référence seulement |
| Génération d'assets | Genex, Higgsfield, outils de génération musicale | Voir §4 |

Le chemin le plus court est de **partir du code de The Crucible** : sim pure, puis `IgnitionEnv`, puis rendu Three.js, avec la même règle « la sim fait foi pour le jeu comme pour l'entraînement ». On l'étend de 1 contre 1 à 1 contre N.

## 1. Concepts de gameplay (1 Terminator contre la meute)

Principe commun anti-triche : **la meute et le Terminator suivent les mêmes règles de sim**. Chaque Night Lord n'observe que son cône de vision, sa portée d'ouïe (le bruit des pas du Terminator) et ce que ses frères lui transmettent par vox. Ce canal vox est explicite, limité à la position du Terminator vue par un frère, et affiché à l'écran. Pas d'accès aux inputs du joueur ni à sa position cachée, pas de bonus de stats caché, et pas de difficulté qui triche. La meute gagne par la coordination apprise. La recette le vérifiera avec une vue debug des observations.

Surpuissance commune : le Terminator tue un Night Lord avec un coup de gantelet énergétique ou une courte rafale de storm bolter. Il ignore les tirs de bolter de face (armure). Feedback : hitstop, tremblement de caméra, démembrement, son lourd des pas, et une silhouette qui remplit l'écran. Sa faiblesse est réglée par les règles : il est lent à pivoter, son armure est vulnérable dans le dos et aux attaques simultanées, et sa vision est limitée dans le noir. Tous les chiffres (PV, dégâts, vitesses) seront **réglés au prototype gris**. Aucun n'est fixé ici.

### A. « Chasse dans le noir » (recommandé)
- **Boucle** : le Terminator doit traverser un pont de vaisseau plongé dans le noir jusqu'au point de téléportation. Les lumières tombent par zones et la meute le traque. S'il atteint le point, il gagne ; s'il tombe, la meute gagne. La partie dure quelques minutes (durée à fixer).
- **Rôles appris** : Uzas, berserker appât, charge de face pour faire pivoter le Terminator. Cyrion, au flanc et dans l'ombre, frappe dans le dos. Xarl, duelliste lourd, finit la cible quand l'armure est entamée. Talos, chef de meute, relaie les positions par vox et décide quand engager. En option, Mercutian au bolter lourd pour fixer la cible de loin, et Variel en apothicaire qui relève un frère tombé.
- **Pourquoi ça marche** : chaque Night Lord seul se fait tuer d'un coup. La meute ne gagne qu'en coordonnant appât, flanc et finition, et c'est exactement ce que le RL apprend.

### B. « Le Crucible assiégé »
- **Boucle** : on reprend l'arène octogonale du Crucible. Le Terminator doit tenir ou purger 3 relais pendant que la meute entre par les accès.
- **Rôles** : ce sont les mêmes, et l'appât sert surtout à arracher le Terminator à un relais.
- Plus simple, parce que l'arène et la caméra existent déjà. C'est le meilleur candidat pour le prototype gris, mais il est moins « chasse ».

### C. « Les tactiques volées »
- **Boucle** : c'est A en plusieurs manches. Entre deux manches, l'écran montre ce que la meute a « lu » du joueur (sa tactique favorite) et la manche suivante est jouée par une politique entraînée contre cette tactique. Ces politiques sont **pré-entraînées hors ligne contre chaque tactique-type** : pas d'apprentissage en direct pendant la partie, donc pas de triche.
- C'est le meilleur pitch pour l'article (« ils sont surentraînés à TES tactiques »), mais il demande plus de travail RL.

Variante pour plus tard : une escouade de 2 ou 3 Terminators (coop ou IA alliée) contre la meute.

## 2. Pipeline RL

- **Environnement** : une sim 2D vue de dessus (grille ou navmesh du pont, lignes de vue, bruit), déterministe et à tick fixe comme le Crucible. Le rendu 3D lit seulement l'état. On entraîne headless en Node (backend `node` de backend-tfjs), puis on charge des politiques **figées** dans le navigateur (poids TF.js ou ONNX via `backend-onnx`).
- **Agents** : PPO de `backend-tfjs`. Une politique partagée avec l'identifiant du rôle en entrée, ou une politique par rôle (à trancher au jalon 2). On écrit une boucle multi-agent dans la démo, puisque la Phase 5 n'existe pas encore.
- **Observations par Night Lord** : sa position et son état ; le Terminator, seulement s'il est vu ou entendu (sinon sa dernière position connue, qui vieillit) ; les frères alliés ; les pings vox ; la lumière de la case.
- **Récompenses** : une récompense d'équipe (Terminator abattu, Terminator empêché d'atteindre l'objectif) avec un petit modelage par rôle (Uzas : être ciblé en restant en vie ; Cyrion : dégâts dans le dos). Pénalités : mort, temps. Pendant l'entraînement, on surveille les comportements qui exploitent la récompense sans gagner, avec des replays.
- **Curriculum** : (1) chasse d'une cible immobile ; (2) Terminator scripté (patrouille, puis tir sur le plus proche, puis pivot sur la menace et dos au mur) ; (3) pool d'adversaires : plusieurs Terminators scriptés, un Terminator entraîné par RL en self-play adversarial, et un Terminator **imité à partir de parties humaines enregistrées** ; (4) test contre des humains.
- **Évaluation** : seeds tenues à part, comme dans le Crucible. On mesure le taux de victoire de la meute contre chaque adversaire et contre des humains, en rapportant aussi les régressions.
- **Temps de calcul : à mesurer.** La seule référence mesurée, ce sont des runs de 60 000 transitions en Q-table sur le Crucible (1 contre 1, 5 observations), sans durée notée. Elle n'est pas transposable.

## 3. Rendu recommandé

- **Three.js + Vite, en reprenant le code du Crucible.** Ce sont les compétences de l'équipe, la base est déjà validée sur desktop et mobile, et le jeu se livre en build statique. R3F est possible mais n'apporte rien ici.
- **16:9 et 9:16** : une caméra qui s'adapte au viewport (épaule ou ¾ haut à trancher) et un **mode replay** déterministe (seed + inputs). Le même replay est rendu en 1920×1080 et en 1080×1920 par un navigateur headless, puis passé à ffmpeg . Les Shorts sont ainsi montés à partir de vraies parties.
- **Ambiance** : obscurité, lampes de poitrine et projecteur du Terminator, éclairs des griffes, brouillard volumétrique léger. Le budget de performance est à mesurer sur mobile.

## 4. Plan des assets (rien n'est généré)

| Asset | Source proposée | Coût indicatif |
|---|---|---|
| Terminator loyaliste (armure Tactical Dreadnought, storm bolter, gantelet), riggé | Genex `character` ou `model` + `rig`, ou Blender (scripts du Crucible) | Genex à partir de 32 + 29 cr pour un personnage riggé (`--help`, 31/10 ; 1 cr = 0,01 $) |
| 4 à 6 Night Lords distincts (casques, éclairs peints, crânes, griffes) | Genex `character`, puis `character animate` ; ou une base commune + variantes | idem, par personnage |
| Animations | Genex `animate`, et le pipeline de retarget Mixamo du Crucible | à chiffrer |
| Pont de vaisseau, textures | Genex `model` (35 cr+) et `texture` (9 cr+), plus Blender | à chiffrer |
| SFX : pas, storm bolter, cris vox, éclairs | Genex `sfx` (2 cr+) | à chiffrer |
| Concept art, visuels de l'article | Higgsfield ou génération d'images | à chiffrer |
| Attribution CC BY (chainsword, si on le reprend) | page crédits (`credits.html` existe) | 0 |

Les coûts indiqués sont des prix « à partir de » lus dans `npx genex --help` le 31/10.

## 5. Musique

La musique de la version publique sera une piste originale (commandée à un compositeur ou générée), ou une piste existante sous licence obtenue auprès de son auteur. Aucune musique tierce n'est utilisée sans accord.

## 6. Jalons

0. **Cadrage** : réponses aux questions du §7, choix du concept et de la base de code.
1. **Prototype gris** : sim 1 contre N, Terminator jouable avec des cubes, meute scriptée, vue debug des observations. On y teste le ressenti de surpuissance.
2. **Meute entraînée** : curriculum, évaluation sur seeds tenues à part, premiers tests humains. On y mesure le temps de calcul.
3. **Habillage** : assets, VFX, sons, musique, mode replay 16:9 et 9:16.
4. **Recette** : Terminator vraiment surpuissant, meute qui gagne sans tricher (vue debug), formats 16:9 et 9:16.
5. **Article** : comment on l'a fabriquée, avec la mention claire « Warhammer 40,000 et Night Lords sont la propriété de Games Workshop », les crédits CC BY et les crédits musique.


## 7. Questions de cadrage (31/10)

1. **Concept** : A « Chasse dans le noir », B « Crucible assiégé » ou C « Tactiques volées » ? Et quelle caméra : épaule, comme le Crucible, ou ¾ haut, plus lisible en 9:16 ?
2. **« Il perd quand même »** : à quel point ? La meute gagne toujours, ou presque toujours avec une petite chance pour un joueur parfait ? Et pour quelle durée de partie ?
3. **Base et assets** : on part du code du Crucible (`ignition/packages/demo-cage-duel`) dans un **nouveau dépôt séparé** ? Et les modèles tiers : leur licence permet-elle de les publier, ou tout est-il refait (Genex/Blender) ?
4. **Musique** : licence d'une piste existante ou piste originale (commandée ou générée) ?
5. **Meute et budget** : 4 Night Lords, ou 6 avec Mercutian et Variel ? Et où publier ?

---
Deviné / sauté : les rôles « lore » (Talos chef, Cyrion furtif, Xarl duelliste, Mercutian bolter lourd, Variel apothicaire) viennent de mémoire et ne sont pas revérifiés. Je n'ai lancé ni le Crucible ni ses tests. Je n'ai pas vérifié la licence des modèles tiers, ni les CGU des outils de génération pour un usage public, ni la politique IP de Games Workshop. Les coûts Genex sont des prix « à partir de ». Aucun temps de calcul, aucun chiffre de gameplay et aucune durée de jalon ne sont estimés : tout est à mesurer.
