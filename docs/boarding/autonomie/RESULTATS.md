# Ce que le PPO apporte au Commandement tactique

La reprise directe du PPO de ce projet gagne **44 des 54 parties réservées**, contre **34** pour le même acteur avant reprise et **43** pour la référence scriptée. C’est le meilleur résultat des modèles sélectionnés sur développement pour ce banc. Sur les 81 parties du diagnostic initial, la reprise directe passe de 47 à 49 victoires. Les trois tirages de cette branche obtiennent respectivement 34, 43 et 44 victoires sur 54. Le gain varie avec la graine et le choix des adversaires.

L’imitation permet aux commandants de choisir seuls leurs objectifs. Après imitation, la phase PPO supplémentaire donne 40 victoires sur 54 pour le candidat sélectionné, contre 41 pour l’imitation seule et 41 pour le témoin qui a reçu les mêmes rappels supervisés. Le critère d’intégration de cette méthode exigeait de dépasser ces deux témoins ainsi que la reprise PPO ordinaire. Le jeu conserve donc l’acteur d’origine.

## Parties simulées, poids gelés

Chaque ligne correspond à un contrôleur. Les poids des familles entraînées ont été choisis sur 54 autres parties de développement. Les 81 parties de diagnostic étaient déjà connues. Les 54 parties réservées croisent trois missions, trois configurations et six adversaires écrits avant l’entraînement. Tous jouent sur le même pont. La dernière colonne donne la part des tours où les deux commandants actifs visent des systèmes différents sur le banc réservé.

| Commandants | Victoires au diagnostic / 81 | Victoires réservées / 54 | Nuls réservés | Écart moyen de score réservé, NL − loyalistes | Objectifs distincts |
|---|---:|---:|---:|---:|---:|
| PPO livré | 47 | 34 | 0 | +1,00 | 0,0 % |
| Scriptés | 60 | 43 | 0 | +13,80 | 100,0 % |
| Heuristiques | 63 | 38 | 0 | +10,96 | 89,0 % |
| Hybride, objectif heuristique et posture PPO | 66 | 40 | 1 | +13,54 | 91,3 % |
| Imitation seule | **67** | 41 | 1 | +13,52 | 87,6 % |
| Imitation et rappels seuls | **67** | 41 | 1 | +13,52 | 88,6 % |
| Reprise directe du PPO | 49 | **44** | 0 | +11,69 | 38,3 % |
| Imitation puis PPO | 64 | 40 | 0 | +12,09 | 74,5 % |

Face à l’imitation avec rappels, le candidat gagne deux scénarios réservés et perd trois victoires. Par mission, il gagne 14/18 en Brèche, 10/18 en Sous tension et 16/18 en Mémoire, contre 16, 9 et 16 pour le témoin. Face au modèle livré, il gagne six scénarios et conserve toutes les victoires précédentes. Sur le diagnostic, il termine deux victoires derrière l’hybride.

| Graine d’entraînement | Imitation seule | Avec rappels seuls | PPO ordinaire | Imitation puis PPO |
|---|---:|---:|---:|---:|
| 4101 | 41 | 41 | 34 | 43 |
| 4102 | 41 | 41 | 43 | 42 |
| 4103 | 41 | 41 | 44 | 40 |

Deux des trois répétitions améliorent l’imitation de respectivement deux et une victoires sur le banc réservé. La règle de sélection sur développement a retenu la graine 4103, qui perd une victoire. Les mesures caractérisent ces parties simulées sur un plateau et des adversaires automatisés. Les résultats par scénario et par graine permettent de vérifier la sensibilité du classement. [Verdict détaillé](resultats.json) · [Parties individuelles compressées](parties.json.gz)

## Budgets et inférence

Les 108 démonstrations contiennent 3 208 décisions de commandants actifs. Les trois tirages supervisés ont effectué 520 pas d’optimisation et reproduit 97,69 à 97,76 % des choix d’objectif sur ces exemples d’entraînement. Le témoin avec rappels reçoit ensuite les 30 mêmes lots supervisés supplémentaires que le candidat. Le PPO ordinaire et le candidat effectuent chacun 90 mises à jour sur 540 parties par graine. La durée variable des parties produit 18 180 à 18 388 décisions pour le PPO ordinaire et 16 800 à 16 918 pour le candidat.

Le candidat retenu est la sauvegarde 45 de la graine 4103, avec 270 parties, 8 472 décisions et 15 mises à jour depuis le dernier rappel. Le PPO ordinaire retenu est la sauvegarde 90 de cette même graine, avec 540 parties et 18 180 décisions. Chaque branche avait accès aux mêmes deux points de sélection. Les commandants évalués reçoivent chacun 72 entrées autorisées par la vision et la radio et choisissent l’action de probabilité maximale. L’heuristique d’enseignement intervient dans la construction des démonstrations. L’acteur autonome décide à partir de ses seuls poids. [Budgets](budgets.json) · [Sélection gelée](selection.json) · [Protocole préalable](PROTOCOLE.md) · [Reproduction](REPRODUCTION.md)

## Partie dans le build

Une mission complète a été jouée dans Chromium avec les commandes de reconnaissance et de surveillance de l’interface. Le build a servi l’acteur livré à 72 entrées. Les 32 décisions, leurs cartes et leurs ordres individuels ont été reproduits à partir des vues enregistrées au fil des 16 tours. Les 32 choix différaient de l’heuristique sur ces mêmes vues. Les Night Lords ont remporté cette partie 9 à 0. Ce contrôle confirme l’identité du modèle en jeu. Les comparaisons de performance ci-dessus proviennent du simulateur. La compilation du build et les 54 tests ciblés des règles, de la présentation, des voix et des langues ont réussi. [Débrief vérifié](partie-navigateur.json)
