# InvaderQuest — Modes sociaux et défis

> **Statut : conception validée par Marco, rien n'est engagé côté livraison.**
> Décisions prises lors de la session de cadrage du 27/08/2026, avec **les
> raisons** de chaque choix — y compris des idées écartées.
>
> Complète `AGENTSsocial.md` (contexte, contraintes) et
> `SOCIAL-cadrage-donnees.md` (données, connexion, coûts).

---

## 1. Décision de séquence — LOT UNIQUE

La séquence initialement recommandée était : sauvegarde seule, **puis** amis,
**puis** défis. **Marco a arbitré en faveur d'un lot unique**, pour une raison
solide : la sauvegarde livrée seule n'a qu'un argument faible (« ne perds pas ta
collection »), qui convertit mal. Un lot 1 peu adopté n'aurait pas permis de
distinguer « la sauvegarde n'intéresse personne » de « l'argument est mou ».

**Le lot unique contient :**

- compte de sauvegarde (e-mail + mot de passe)
- amis, avec pseudo
- flashs en commun, différence exploitable en chasse, progression comparée
- badges de l'ami
- **deux défis** : chrono asynchrone et duel hebdomadaire à points
- signalement et blocage (obligatoire dès qu'un pseudo existe)

**Hors lot, reportés :** classement mondial (ou jamais), duel sur invader
désigné, sortie partagée, mode coopératif, **abonnement payant** (voir
`SOCIAL-cadrage-donnees.md` §12).

**Charge estimée : 90 à 125 h.** Soumission plausible début décembre 2026,
SPACE_02 restant prioritaire.

**Ce que ce choix coûte, assumé :** modération obligatoire dès le premier jour et
irréversible ; première déclaration de données personnelles bien plus lourde ;
deux cycles de revue à budgéter plutôt qu'un.

---

## 2. Les trois critères de tri

1. **Génère-t-elle du jeu, ou juste de l'affichage ?** Un chiffre consulté une
   fois est vite oublié. Ce qui retient donne une raison de sortir marcher.
2. **Coûte-t-elle de la modération ?** Du texte libre écrit par un utilisateur
   oblige à signaler et bloquer, à vie.
3. **Est-ce falsifiable, et est-ce grave ?** Entre amis choisis, la triche
   s'autorégule. Elle ne devient un problème que face à des inconnus.

---

## 3. Le socle : ce qu'on voit d'un ami

### 3.1 Flashs en commun — et surtout la différence

Meilleur rapport valeur/coût du chantier. L'intérêt n'est **pas** le nombre en
commun mais **ce que l'ami a et que vous n'avez pas** : cette différence devient
une liste de chasse affichable sur la carte. On passe de « voilà nos scores » à
« voilà où aller demain ».

### 3.2 Progression par ville, côte à côte

Champs déjà présents (`flashedCount`, `flashedPts`, `denominator`, `completed`).
Donne le contexte qu'un score brut ne donne pas : 80 % de Lyon vaut mieux que
300 flashs éparpillés.

### 3.3 Badges de l'ami

Vitrine plutôt que compétition. Met en valeur un système déjà construit que les
concurrents n'ont pas nécessairement.

### 3.4 Sortie partagée — **reportée**

Deux personnes chassent ensemble, récapitulatif commun (`utils/sorties.js`,
`services/shareStory.js`). Seul élément ancré dans la vraie vie plutôt que dans
les chiffres. Reportée au lot suivant pour ne pas alourdir davantage.

---

## 4. Les défis retenus

### 4.1 Chrono asynchrone

**Principe.** Un joueur lance un chrono (30 min, 1 h) au moment qui lui convient
et flashe le plus d'invaders possible. L'autre est notifié et joue sa manche
quand il veut — modèle des échecs par correspondance.

**Format : deux manches**, chacun ouvrant une fois. Sinon le second joueur
connaît le score à battre et joue avec un avantage.

**Date limite : une semaine**, après quoi le défi se clôt sur les scores en
l'état. Sans limite, les défis s'accumulent sans jamais finir.

**Pourquoi c'est le meilleur mode :**

- Résout la disponibilité **et** l'équité météo/agenda : chacun choisit son
  moment.
- Fonctionne à distance comme côte à côte. Paris contre Lyon reste palpitant,
  alors que comparer deux collections entières entre villes n'a aucun sens.
- **Aucune position n'est envoyée au serveur.**
- Techniquement simple : rien en temps réel, chacun envoie son résultat en fin
  de manche.
- Aucun concurrent ne le propose.

**Points ouverts :**

- **Équité géographique.** 30 min à Paris intra-muros et 30 min dans une ville à
  sept invaders ne sont pas le même jeu. Piste : compter la part du terrain
  disponible plutôt que le nombre brut.
- **Sécurité physique.** Seul mode qui pousse à se dépêcher en ville, téléphone
  en main. Prévoir une durée qui n'encourage pas la course, et un message dans
  l'application.

### 4.2 Duel hebdomadaire à points

**Principe.** Un invader proposé chaque jour. Chaque flash marque des points.
**On ne perd jamais rien** : une journée manquée coûte une occasion, pas une
défaite. En fin de semaine, celui qui a le plus de points l'emporte.

**Pourquoi ce mode en plus du chrono.** Ce sont deux effets différents : le
chrono crée un **pic**, le duel crée un **rituel**. Le duel est le seul mode qui
donne une raison de rouvrir l'application *demain* — le meilleur pour la
rétention.

**Pourquoi la semaine et pas le mois.** Un mois est trop long : dix points de
retard le premier week-end et le reste est joué d'avance, donc on décroche. La
semaine efface une mauvaise passe dès le lundi, et colle au rythme réel de la
chasse, concentré sur les week-ends.

**Clôture entre fuseaux.** « Dimanche minuit » n'est pas le même instant à Paris
et à Montréal. Figer l'heure de clôture sur le fuseau de celui qui a lancé le
défi, et l'afficher aux deux.

**Pas d'enchaînement automatique.** Une semaine qui repart seule redevient une
obligation. Récapitulatif de fin, puis bouton « on remet ça ? ».

**Coût spécifique.** Notifications quotidiennes : envoi programmé, dosage, moyen
simple de couper. Se dose mal du premier coup — prévoir d'y revenir après le
lancement. Le service de notifications d'Expo (déjà utilisé pour l'ISS) suffit.

---

## 5. RÈGLE À NE PAS ÉRODER — pas de sanction sur le duel quotidien

**Pas d'élimination. Pas de série à protéger. Pas de jokers.**

C'est ce qui rend un défi quotidien acceptable plutôt que pesant, et c'est la
décision qui s'érode le plus facilement quand on cherche à « booster
l'engagement ».

**Pourquoi les jokers ont été écartés** (proposition initiale : trois jokers
façon Duolingo) : ils repoussent l'élimination sans la supprimer — au quatrième
jour manqué, on perd toujours pour une raison étrangère au jeu. Et ils importent
**l'anxiété de la série** : on ne joue plus par plaisir, on joue pour ne pas
casser quelque chose. Sur une application qui demande de sortir marcher en
ville chaque jour, quelle que soit la météo, l'agenda ou la forme du joueur,
c'est un mauvais mécanisme — et le seul qui pousserait quelqu'un à sortir sous
pression sociale alors qu'il n'en a pas envie.

Si l'idée revient, la garder comme **bonus** et non comme protection : un jour
double, une cible rare qui vaut plus. **Récompenser sans punir.**

---

## 6. Ce qui est écarté, et pourquoi

| Idée | Raison |
|---|---|
| **Messages libres** | Seul élément qui engagerait à modérer du texte de conversation. Valeur faible : les gens ont déjà WhatsApp. |
| **Flux d'activité temps réel** | Invader Tracker le fait déjà. Trafic continu, notifications que les gens finissent par couper. |
| **Classement mondial** | Modération à l'échelle, triche non résolue, coût serveur. FlashInvaders le fait nativement. |
| **Élimination / jokers** | Voir §5. |
| **Duel sur invader désigné** | Reporté. Seul mécanisme exigeant de connaître la position des deux joueurs simultanément — coût de conformité le plus élevé. Piste pour plus tard : n'envoyer qu'une **distance calculée sur le téléphone**, jamais la position brute. Variante plus solide : le relais (série de cibles, chacune attribuée au plus proche). |

---

## 7. État du marché (vérifié le 27/08/2026)

Le social n'est **plus un différenciateur, c'est un rattrapage** :

- **Findvaders** : ajout d'amis, comparaison de scores, classement ville par
  ville, récapitulatif mensuel vidéo, planificateur de tournée.
- **Invader Tracker** : le plus avancé. Comparaison de statistiques, suivi de la
  progression des amis, classement communautaire par ville ; le mode amis s'est
  récemment enrichi d'un profil, de statistiques détaillées, de « likes » et de
  notifications.
- **Invaders Finder** : pas d'amis ni de classement, mais **connexion Apple,
  Google ou e-mail pour synchroniser entre appareils** — le palier « compte sans
  social » est donc jugé viable par quelqu'un.
- **FlashInvaders (officiel)** : liste de suivi, scores des amis, flux mondial en
  direct.

**Conséquence :** construire le social ne fait pas gagner de joueurs, ça évite
d'en perdre. Dimensionner en conséquence — le moins cher qui referme l'écart.

**Réserve :** ce sont des pages marketing. Elles listent des fonctionnalités,
pas leur usage réel. La présence d'une fonctionnalité chez un concurrent ne
prouve pas qu'elle marche.

---

## 8. Origine de la demande

Deux verbatims seulement — un signal, pas une mesure :

1. *« [Chez un concurrent] on peut ajouter des gens en amis et voir leur flash,
   nos flashs en commun… »* → trois demandes empilées à des paliers différents.
2. *« Instead of phone-related app, make it handle accounts, with rankings »* →
   le mot important est **« instead of phone-related »** : c'est une demande de
   **sauvegarde**, pas de social.

Point de convergence : **l'identité persistante**. L'un la veut pour ses amis,
l'autre pour son téléphone. Le classement n'apparaît qu'une fois, chez quelqu'un
qui demande d'abord autre chose.

---

## 9. Hypothèse non vérifiée

**Les joueurs chassent-ils souvent à plusieurs, physiquement ?** Question posée
plusieurs fois, restée sans réponse.

Faute d'information, hypothèse prudente retenue : **chasse majoritairement
solitaire**. C'est ce qui renforce le choix de l'asynchrone.

Si l'inverse se vérifie, la sortie partagée (§3.4) et un mode **coopératif**
(« à nous deux, complétons Marseille ») prennent nettement plus de valeur — ce
dernier ayant l'avantage de supprimer toute incitation à tricher, puisque
personne ne gagne contre personne.
