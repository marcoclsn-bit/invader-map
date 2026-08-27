# InvaderQuest — Passation du chantier social

> **Pour la session Claude Code qui reprend le sujet.**
> Résumé de la session de cadrage du 27/08/2026 avec Marco.
>
> Documents détaillés à lire avant toute action :
> - `SOCIAL-modes-et-defis.md` — ce qu'on construit et pourquoi
> - `SOCIAL-cadrage-donnees.md` — données, connexion, coûts, services
> - `AGENTSsocial.md` — contexte projet et contraintes d'origine
>
> **Rien n'est engagé côté code. Priorité absolue : SPACE_02 d'abord.**

---

## 1. La décision de fond

La règle « Social abandonné » du projet **est levée**, consciemment.

Déclencheur : des utilisateurs le demandent. Deux verbatims seulement — un
signal, pas une mesure. L'un veut des amis et des flashs en commun, l'autre
demande en réalité de la **sauvegarde** (« instead of phone-related app »).

Contexte marché vérifié : Findvaders, Invader Tracker, Invaders Finder **et
FlashInvaders lui-même** ont déjà du social. Ce n'est plus un différenciateur,
c'est un rattrapage. Dimensionner en conséquence.

---

## 2. Ce qu'on livre — LOT UNIQUE

Marco a arbitré contre la livraison séquentielle : la sauvegarde seule a un
argument trop faible (« ne perds pas ta collection ») pour tester la demande.

**Dans le lot :**

- Compte de sauvegarde (e-mail + mot de passe)
- Amis, avec pseudo
- Flashs en commun + **la différence exploitable en chasse** (le vrai atout)
- Progression par ville comparée, badges de l'ami
- **Deux défis** : chrono asynchrone et duel hebdomadaire à points
- Signalement et blocage (obligatoire dès qu'un pseudo existe)
- Pages web légales

**Hors lot :** classement mondial (ou jamais), duel sur invader désigné, sortie
partagée, mode coopératif, **paiement/abonnement**.

**Charge : 90–125 h.** Soumission plausible **début décembre 2026**, un seul
cycle de revue supposé — ce qui n'est jamais arrivé sur ce projet.

---

## 3. Les deux défis, en bref

**Chrono asynchrone.** Un joueur lance un chrono (30 min / 1 h) quand il veut,
l'autre joue sa manche quand ça l'arrange (modèle échecs par correspondance).
Deux manches, chacun ouvre une fois. Limite d'une semaine. Aucune position
envoyée au serveur, rien en temps réel.

**Duel hebdomadaire.** Un invader par jour, des points à chaque flash,
**aucune sanction** si on saute un jour. Comparaison le dimanche. Clôture figée
sur le fuseau de celui qui a lancé. **Pas d'enchaînement automatique** :
récapitulatif puis bouton « on remet ça ? ».

---

## 4. Règles à ne pas éroder

**Pas de sanction sur le duel quotidien.** Pas d'élimination, pas de série à
protéger, **pas de jokers**. Les jokers façon Duolingo ont été explicitement
écartés : ils repoussent l'élimination sans la supprimer et importent l'anxiété
de la série. Sur une app qui demande de sortir marcher chaque jour, c'est
mauvais. Si l'idée revient : bonus (jour double, cible rare), jamais protection.

**Les notes personnelles restent strictement privées.** Jamais visibles par un
ami, jamais dans un partage ou un récap commun. Elles montent dans le compte,
mais ne sortent jamais vers un tiers.

**L'UID FlashInvaders ne quitte jamais l'appareil.** Porteur
d'authentification. Ni journal, ni capture, ni sauvegarde.

**Le cœur reste local.** Carte, flashs, collection, notes, badges fonctionnent
sans compte et sans serveur. Réserver les défis au compte est légitime ;
réserver le cœur ne l'est pas.

---

## 5. Données — ce qui monte, ce qui ne monte pas

**Monte :** `invader_flashed`, `invader_flashed_dates`, `@invader_retires`,
`@invader_retires_vus`, badges (`badgeStore`), `@invader_notes` (privées), plus
pseudo, relations d'amitié, horodatages de flash pendant un défi, signalements
et blocages.

**Ne monte pas :** `@invader_city_progress` (dérivé, se recalcule — évite toute
une classe de conflits) · sorties `sessionStore` (contiennent `routeCoords`,
trace GPS) · UID FlashInvaders · les 21 clés de préférences d'appareil.

Détail ligne par ligne au §2 et §3 de `SOCIAL-cadrage-donnees.md`.

---

## 6. Connexion — décidé

**Adresse e-mail + mot de passe.** Pas d'Apple, pas de Google.

Raison : la règle 4.8 d'Apple ne se déclenche que si l'app utilise une connexion
tierce. Ajouter Google obligerait à ajouter Sign in with Apple, donc un module
natif de plus, pour aucun bénéfice. L'e-mail seul est hors périmètre.

**Livraison par un vrai build, PAS par-dessus les airs.** Techniquement le
client Supabase est du JS pur, mais ajouter des comptes change la collecte de
données : livrer derrière un drapeau distant puis allumer est contraire aux
règles, et l'application de ces règles est inégale. Sur une app déjà refusée
deux fois par Google, le pari n'est pas à prendre.

`services/featureAccess.js` garde son usage légitime : aperçu avant soumission,
et coupure propre en cas de problème en production.

**Jeton de session dans `expo-secure-store`, pas AsyncStorage.** Un build est
produit de toute façon, le module ne coûte rien de plus.

---

## 7. Infrastructure — état réel au 27/08/2026

| Service | État |
|---|---|
| `invaderquest.com` + `.fr` | ✅ Achetés chez Scaleway |
| Verrouillage transfert | ✅ Actif (par défaut) |
| Renouvellement auto | ✅ sur .com — ⏳ **reste à faire sur .fr** |
| Protection WHOIS | ✅ Active |
| Scaleway TEM | ✅ Branché sur invaderquest.com, région **PAR** |
| Enregistrements DNS (SPF/DKIM/DMARC) | ⏳ Configuration auto en cours, **à vérifier** |
| DNSSEC | Désactivé volontairement — à activer après stabilisation de l'envoi |
| Supabase | ❌ Rien créé, volontairement |

**Envoi sans préfixe** : les e-mails partent de `invaderquest.com` directement.

**Ne rien ajouter à la main dans la zone DNS** tant que la configuration
automatique de TEM n'a pas fini : des doublons créeraient un problème d'envoi
difficile à diagnostiquer.

**Supabase : à créer le jour où on écrit la première ligne de backend**, pas
avant (l'offre gratuite met en pause après une semaine d'inactivité, et il n'y a
rien à faire vieillir). **Choisir explicitement la région Paris ou Francfort** —
jamais la région générale « Europe », qui inclut Londres et Zurich, hors UE.
Ce choix est définitif.

---

## 8. Budget

| Poste | Coût |
|---|---|
| Domaines | ~19 €/an |
| Scaleway TEM | ~1–2 €/mois |
| Supabase Pro | 25 $/mois (à souscrire **la semaine de la soumission**) |
| **Total** | **~26 €/mois — ~310 €/an** |

Le coût n'est pas l'obstacle. L'engagement l'est : 1–3 h/mois de maintenance,
support, RGPD, modération, et l'impossibilité d'éteindre le service une fois que
des comptes existent.

---

## 9. Modèle économique — lot suivant

**Abonnement sous les 2 €/mois**, pas d'achat unique (un revenu unique ne
finance pas un coût récurrent, et l'abonnement touche aussi les utilisateurs
déjà installés).

**Explicitement hors du lot social** : +30–50 h, domaine de règles distinct
(un refus groupé serait plus dur à attribuer), et surtout **on ne sait pas
encore quoi vendre**. Livrer le social gratuitement, observer 2–3 mois, placer
la barrière là où la valeur s'est révélée.

**Deux précautions dès le développement :**
1. Prévoir côté serveur **la place d'un statut d'abonné**, même inutilisé.
2. Ce qui est livré gratuitement ne se reprend pas : le jour de l'abonnement,
   la sauvegarde des comptes existants doit rester accessible au minimum en
   lecture et en export.

---

## 10. Parcours d'adoption

**Jamais de mur au premier lancement.** Un écran de choix à l'ouverture est vu
par 100 % des installateurs : le jour d'un article de presse, ça reproduit le
pic qu'on cherche à lisser. Et quelqu'un qui découvre l'app n'a rien à protéger
encore.

**Deux moments :** après quelques flashs (~20, ou une ville entamée, ou un
premier récap) sur l'argument de la récupération ; puis au moment de vouloir un
ami ou un défi, sur l'argument du déblocage — nettement plus fort.

**Formulations interdites :**
- « Sans compte, tu perds ta collection » → faux et angoissant. Ce qu'on perd,
  c'est la **récupération** en cas de perte, vol ou changement d'appareil.
- « Gratuit pour le moment » → annonce une future facturation et déclenche
  l'inquiétude. Écrire « Le compte est gratuit », ou ne pas parler du prix.

---

## 11. Modération — obligatoire, irréversible

Dès qu'un pseudo existe. À construire, rien n'existe aujourd'hui :

1. Signaler un pseudo, depuis la fiche de l'ami
2. Bloquer, avec effet immédiat sur tout ce qui rend visible
3. Adresse ou formulaire de réception des signalements (sur le domaine, pas
   l'adresse personnelle de Marco)
4. Moyen serveur de renommer ou désactiver un compte fautif
5. Règles d'usage publiées

**Mineurs** : public concerné, obligations possibles (Play Families, consentement
parental). À vérifier avant soumission.

---

## 12. Pages web à produire

Sur invaderquest.com : politique de confidentialité (aujourd'hui sur Notion, à
rapatrier **et réécrire** pour couvrir comptes/pseudo/amis/défis), règles
d'usage, page de signalement, page de suppression de compte, accueil minimal.

**Pas un site de référencement** — ce serait un projet distinct.

> ⚠️ La phrase « aucune donnée du compte n'est visible par un autre
> utilisateur » **n'est plus vraie** depuis l'ajout du pseudo. Ne pas la
> reprendre d'une version antérieure. Rappel : Google a refusé deux fois sur un
> texte qui ne décrivait pas exactement ce que fait le réseau.

---

## 13. Vérifications ouvertes, avant de coder

1. **UID FlashInvaders** : confirmer dans `services/flashinvaders.js` qu'aucun
   chemin ne peut le faire remonter dans une sauvegarde.
2. **Stockages non inventoriés** : l'inventaire ne couvre que `AppContext.js`,
   `GamificationContext.js` et `fichiers.js`. À compléter.
3. **Forme d'une session** (`utils/session.js`), si on envisage un jour de les
   faire monter sans `routeCoords`.
4. **Suppression de compte Google Play** : un lien web est probablement exigé en
   plus du geste dans l'app. À confirmer.
5. **Déclarations de confidentialité** : confirmer que c'est de la métadonnée.
6. **Quota d'envoi initial TEM** : onglet Plan de la console. Dernière inconnue
   du chiffrage.
7. **Enregistrements DNS de TEM** posés et domaine au vert dans la console.

---

## 14. Hypothèse non vérifiée

**Les joueurs chassent-ils souvent à plusieurs, physiquement ?** Question posée
plusieurs fois, restée sans réponse. Hypothèse prudente retenue : chasse
majoritairement solitaire — ce qui renforce le choix de l'asynchrone.

Si l'inverse se vérifie, la sortie partagée et un mode **coopératif** (« à nous
deux, complétons Marseille ») prennent beaucoup de valeur — ce dernier
supprimant toute incitation à tricher, puisque personne ne gagne contre
personne.

---

## 15. Ordre de marche

1. **SPACE_02 — priorité absolue.** Le social ne doit pas le retarder.
2. Petits restes Scaleway : autorenew .fr, quota TEM, vérif DNS.
3. Vérifications du §13.
4. Développement du lot, derrière `featureAccess.js`.
5. Textes, traductions (4 langues), pages web légales.
6. Tests sur deux appareils réels.
7. Bascule Supabase Pro, puis soumission.

**Méthode du projet, inchangée :** une fonctionnalité à la fois, sur une branche
dédiée, derrière un interrupteur si nécessaire, et **rien en production sans
accord explicite de Marco**.
