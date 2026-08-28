# InvaderQuest — Cadrage du compte, données et coûts

> **Statut : validé par Marco le 27/08/2026.** Rien n'est engagé côté livraison.
>
> **Source de vérité** pour trois livrables : la politique de confidentialité,
> l'écran de suppression de compte, et la déclaration de données aux boutiques.
>
> Complète `SOCIAL-modes-et-defis.md` (conception) et `AGENTSsocial.md`
> (contexte et contraintes).
>
> **Périmètre de l'inventaire :** établi d'abord à partir de trois fichiers
> seulement, puis COMPLÉTÉ par un balayage exhaustif du dépôt le 28/08/2026.
> Voir §15 pour les 23 clés qui manquaient, dont une qui change le cadrage
> (`@invader_profile` porte déjà un pseudo ET une photo), et §14 pour l'audit
> de l'UID FlashInvaders.

---

## 1. La règle en une phrase

Le compte sauvegarde **ce que l'utilisateur a accompli et écrit**. Il ne
sauvegarde ni ce qui se recalcule, ni où il est allé, ni comment il a réglé son
application.

---

## 2. Ce qui monte dans le compte

### 2.1 Le noyau de sauvegarde

| Donnée | Emplacement local | Pourquoi |
|---|---|---|
| Invaders flashés | `invader_flashed` | Le cœur. Irremplaçable. |
| Dates de flash | `invader_flashed_dates` | Irremplaçable, et socle des défis. |
| Retraits manuels | `@invader_retires` | Sinon la synchro FlashInvaders remet les Invaders décochés. |
| Retraits déjà vus | `@invader_retires_vus` | Sinon le même message revient à chaque synchro. |
| Badges débloqués | `services/badgeStore` | **Ne se recalculent pas entièrement** : certains dépendent des sessions, qui restent locales. |
| Notes personnelles | `@invader_notes` | Seule donnée réellement créée par l'utilisateur. La perdre serait impardonnable. |

Plus l'adresse e-mail et le mot de passe (voir §9).

### 2.2 Ajouts liés au social — lot unique

| Donnée | Nature | Conséquence |
|---|---|---|
| **Pseudo** | choisi par l'utilisateur, **visible par d'autres** | Déclenche l'obligation de signaler et bloquer (§10). |
| **Relations d'amitié** | qui est ami avec qui | Donnée personnelle à déclarer. |
| **Horodatage des flashs pendant un défi** | à la minute | Passe de « je sauvegarde ma collection » à « j'envoie mon activité ». |
| **Signalements et blocages** | qui a signalé ou bloqué qui | À conserver pour traiter les signalements. |

### 2.3 RÈGLE ABSOLUE — les notes restent privées

**Jamais visibles par un ami, jamais dans un partage, jamais dans un défi ou un
récapitulatif commun.**

Ce n'est pas une préférence esthétique. Le pseudo est déjà du contenu écrit à
modérer ; les notes sont du texte long et intime. Les exposer changerait la
nature et le volume de la modération.

**Cette règle doit survivre à ce document.** Si une fonctionnalité future propose
d'afficher une note à un ami, la réponse est non.

---

## 3. Ce qui ne monte pas

### 3.1 Dérivé — se recalcule

`@invader_city_progress` se reconstruit depuis les flashs et les données de
ville. Ne pas le synchroniser supprime gratuitement toute une classe de conflits
entre appareils.

### 3.2 Sensible — décision de prudence

| Donnée | Emplacement | Raison |
|---|---|---|
| Sorties de chasse | `services/sessionStore` | Contiennent `routeCoords`, le tracé piéton réel : un historique de déplacements horodaté, la donnée la plus sensible de l'application. |
| UID FlashInvaders | `services/flashinvaders.js` | **Porteur d'authentification.** Ne doit jamais quitter l'appareil, ni apparaître dans un journal, une capture ou un partage. |

Les sorties pourront être ajoutées plus tard, **sans `routeCoords`**. Les badges
montent précisément pour que les trophées liés aux sessions ne soient pas perdus
entre-temps. L'UID, lui, ne monte jamais : ce n'est pas une étape, c'est une
interdiction.

### 3.3 Préférences d'appareil — coût sans bénéfice

Reconfigurer ses couleurs prend deux minutes ; ajouter ces lignes à une
déclaration de données coûte une revue.

`invader_labels` · `invader_label_defs` · `invader_status_colors` ·
`invader_color_overrides` · `invader_filters` · `invader_maps_app` · langue ·
`@invader_stroll` · `@invader_poi_prefs` · `@invader_poi_intro_seen` ·
`@invader_news_cities` · `@invader_news_last_seen` · `@invader_news_notify` ·
`@invader_explorer` · `@invader_explorer_intro` · `@invader_explorer_suggest` ·
`@invader_fav_cities` · `@invader_legend_seen` · `@invader_onboarding_done` ·
`@invader_current_city` · `@invader_dev`

Cas particulier : `@invader_current_city` n'aurait aucun sens synchronisé, la
ville de démarrage étant déduite du GPS au lancement.

---

## 4. Conséquences directes

### 4.1 Ce que la politique de confidentialité doit dire

Ce qu'elle peut affirmer **sans mentir** :

- aucun tracé de déplacement (`routeCoords`) n'est envoyé au serveur ;
- les notes personnelles restent privées, invisibles des autres utilisateurs.

> ⚠️ **NE PLUS ÉCRIRE « aucune position n'est envoyée au serveur ».** C'était vrai
> tant que les défis n'envoyaient que des scores. Ce n'est PLUS vrai depuis la
> décision du 28/08/2026 de transmettre l'horodatage des flashs à la minute :
> voir §16. Reprendre cette phrase d'une version antérieure du document
> reproduirait exactement la faute qui a valu deux refus à Google.

Ce qu'elle **doit** déclarer, du fait du social :

- un pseudo visible par les autres utilisateurs ;
- des relations entre utilisateurs ;
- des horodatages d'activité transmis pendant un défi ;
- le recours à Scaleway comme sous-traitant pour l'envoi d'e-mails (données en
  UE, voir §9.6).

> ⚠️ **La formulation « aucune donnée du compte n'est visible par un autre
> utilisateur » n'est plus vraie** depuis l'ajout du pseudo. Ne pas la reprendre
> d'une version antérieure de ce document.

**Leçon d'août 2026 :** tout texte affiché doit décrire exactement ce que fait
vraiment le réseau. Carte, itinéraire et synchro FlashInvaders continuent
d'échanger avec des services tiers ; le compte n'y change rien, et la politique
doit continuer de le dire.

### 4.2 Ce que la suppression de compte doit effacer

Les données du §2 côté serveur, l'identifiant de connexion, le pseudo, les
relations d'amitié et les défis en cours.

**Les données locales ne sont pas concernées :** supprimer son compte ne doit pas
effacer la collection de quelqu'un qui voulait simplement quitter le service.
Ce point doit être **écrit noir sur blanc dans l'écran de suppression**.

### 4.3 Ce qu'un appareil neuf récupère — et ne récupère pas

**Récupère :** collection, dates, badges, notes, retraits, pseudo, amis.

**Ne récupère pas :** historique des sorties et leurs tracés, réglages
d'apparence et de comportement.

Cette limite doit être annoncée dans l'application, pas découverte.

---

## 5. Le cœur reste local

Règle non négociable : si le serveur tombe ou disparaît, l'application reste
utilisable. Carte, flashs, collection, notes et badges continuent de fonctionner
hors ligne. Le compte est une **sauvegarde**, jamais une dépendance.

Corollaire pour le lot unique : **rien du cœur ne passe derrière le compte.**
Réserver les défis au compte est légitime (ils ont besoin du serveur) ; réserver
la carte ou la collection ne le serait pas.

---

## 6. Points à vérifier avant de coder

1. ~~L'UID FlashInvaders~~ — **AUDITÉ le 28/08/2026, voir §14.**
2. ~~Les stockages non inventoriés~~ — **INVENTAIRE COMPLET, voir §15.**
3. **La forme exacte d'une session** (`utils/session.js`), si on envisage un jour
   de les faire monter sans `routeCoords`.
4. ~~La méthode de connexion~~ — **tranché, voir §9.**
5. **Suppression de compte côté Google Play** : un lien web est probablement
   exigé en plus du geste dans l'application. À confirmer.
6. **Mise à jour des déclarations de confidentialité** : confirmer qu'il s'agit
   de métadonnées et non d'un blocage supplémentaire.
7. **Quota d'envoi initial du compte TEM** : à relever dans l'onglet Plan de la
   console. Dernière inconnue du chiffrage — le chiffre qui déterminera si un
   jour d'article de presse passe sans blocage.
8. **Enregistrements DNS de TEM** : vérifier que SPF, DKIM et DMARC sont bien
   posés dans la zone racine de invaderquest.com, et que le domaine passe au
   vert dans la console TEM. **Ne rien ajouter à la main** tant que la
   configuration automatique n'a pas fini : des enregistrements en double
   créeraient un problème d'envoi difficile à diagnostiquer.

---

## 7. Volumétrie

Environ **10 à 20 Ko par joueur**. À 15 000 utilisateurs, ~300 Mo — quelques
pour cent des quotas de l'offre retenue.

Le coût n'est pas l'obstacle. **L'engagement l'est** : maintenance, support,
obligations RGPD, modération, et l'impossibilité d'éteindre le service une fois
que des comptes existent.

---

## 8. Parcours d'adoption du compte

### 8.1 Pas de mur à l'ouverture

**Le compte n'est jamais demandé au premier lancement.** Un écran de choix à
l'ouverture est vu par 100 % des nouveaux installateurs : le jour d'un article de
presse, cela reproduit exactement le pic d'e-mails qu'on cherche à lisser.

Et quelqu'un qui découvre l'application ne sait pas encore ce qu'est une
collection : lui demander de protéger une sauvegarde vide, c'est lui demander de
valoriser quelque chose qu'il n'a pas.

### 8.2 Deux moments, deux arguments

| Moment | Argument | Force |
|---|---|---|
| Après quelques flashs (≈20, ou une première ville entamée, ou un premier récap) | « Tu as 43 invaders et 6 semaines de chasse — ne les perds pas en changeant de téléphone. » | Moyen, mais concret |
| Au moment de vouloir un ami ou un défi | « Crée un compte pour jouer avec tes amis. » | **Fort** — promet un gain, pas une assurance |

Une porte d'entrée discrète reste disponible dans les réglages dès le début,
pour ceux qui changent de téléphone et cherchent activement à restaurer.

### 8.3 Formulations

**À ne pas écrire :** « Sans compte, tu perds ta collection. » C'est faux et
angoissant — sans compte, la collection est parfaitement en sécurité sur le
téléphone. Ce qu'on perd, c'est la **récupération** en cas de perte, vol ou
changement d'appareil. C'est aussi la seule formulation que Google validera,
puisqu'elle décrit la réalité. L'export par fichier reste disponible pour ceux
qui préfèrent gérer eux-mêmes.

**À ne pas écrire non plus :** « gratuit pour le moment ». Cela n'annonce pas la
gratuité, cela annonce une future facturation, et déclenche exactement
l'inquiétude à éviter sur un produit dont la promesse est de protéger ce qu'on a
accumulé. Écrire **« Le compte est gratuit »**, ou ne pas parler du prix.

---

## 9. Méthode de connexion — décidé le 27/08/2026

**Adresse e-mail + mot de passe choisi par l'utilisateur.** Pas de « Se connecter
avec Apple », pas de Google, pas de code à usage unique.

### 9.1 Pourquoi pas Apple ni Google

La règle 4.8 d'Apple ne se déclenche que si l'application utilise un service de
connexion tiers ou social pour créer le compte principal. Elle impose alors
d'offrir en parallèle une option équivalente (données limitées au nom et à
l'e-mail, adresse masquable, pas de suivi publicitaire) — ce que Sign in with
Apple satisfait.

Une connexion par e-mail seul **n'entre pas dans ce périmètre**. Ajouter Google
déclencherait l'obligation d'ajouter Sign in with Apple, soit un module natif de
plus, pour aucun bénéfice.

### 9.2 Pourquoi un mot de passe plutôt qu'un code à usage unique

Arbitrage de Marco. Les deux options se défendent :

- **Contre** : le mot de passe ne remplace pas l'envoi d'e-mails, il s'y ajoute
  (vérification d'adresse, parcours « mot de passe oublié »). Sur un compte
  ouvert une fois tous les deux ans, il sera le plus souvent oublié.
- **Pour** : familier, et il **réduit le volume d'e-mails** (inscription et
  oublis seulement, pas chaque connexion). Laisse une porte à qui n'a plus accès
  à sa boîte au moment de se connecter.

**À assumer :** il faut construire les deux chemins (vérification et
réinitialisation), donc plus d'écrans et plus de traductions.

### 9.3 Livraison : par un vrai build, pas par-dessus les airs

Techniquement, le client Supabase est du JavaScript pur (`@supabase/supabase-js`,
`react-native-url-polyfill`, plus AsyncStorage déjà présent) : aucun module natif
requis, l'empreinte du binaire ne changerait pas.

**Mais la livraison par-dessus les airs est écartée**, pour conformité et non
pour technique. Apple autorise la mise à jour de code interprété à condition
qu'elle ne change pas la finalité de l'application et n'introduise pas de
fonctionnalités non déclarées en revue. Ajouter des comptes change la collecte de
données. Le scénario « livrer une fonctionnalité cachée derrière un drapeau
distant puis l'allumer » est explicitement identifié comme contraire aux règles,
et leur application est inégale — on peut passer entre les mailles pendant des
mois avant que ça s'arrête.

Sur une application déjà refusée deux fois par Google, ce pari n'est pas à
prendre. **Un build sur les quinze mensuels, une soumission normale.**

`services/featureAccess.js` garde son usage légitime : tester en aperçu avant de
soumettre, et couper proprement en cas de problème en production.

### 9.4 Jeton de session

Puisqu'un build est produit de toute façon, `expo-secure-store` ne coûte rien de
plus. **Le jeton de session ne va pas dans AsyncStorage** : c'est un porteur
d'authentification, de même nature que l'UID FlashInvaders déjà protégé.

### 9.5 Envoi d'e-mails — Scaleway TEM

L'envoi intégré à l'hébergeur (Supabase) ne délivre qu'aux adresses
pré-autorisées de l'équipe : inutilisable en production quel que soit le volume.
Un service externe est **obligatoire**.

**Décision : Scaleway Transactional Email (TEM), région PAR (Paris).**

Retenu contre Resend, initialement envisagé, pour trois raisons :

1. **Fournisseur français, données en UE.** Supprime le point RGPD sur le
   transfert hors UE (voir §9.6).
2. **Pas de plafond journalier.** Depuis décembre 2023, TEM n'applique plus de
   quota horaire d'envoi. C'était le point bloquant de Resend, dont l'offre
   gratuite plafonne à 100 e-mails/jour, non réglable — or Marco a déjà connu
   plus de 100 inscriptions en une journée (article de presse sur Paris). Le
   mode de défaillance y était **silencieux** : le compte se crée, l'e-mail de
   vérification n'arrive jamais, l'utilisateur reste bloqué sans comprendre.
3. **Coût.** 300 e-mails/mois gratuits puis facturation à l'usage des seuls
   excédents. Sur un volume de ~1 200 e-mails/mois, environ **1 à 2 €/mois** au
   lieu de 20 $.

**Piège de configuration côté Supabase :** une fois le SMTP externe branché, une
limite de **30 messages par heure** s'applique par défaut. Elle est **réglable**
— à relever, sinon une journée d'affluence bloque les inscriptions. Ne pas la
confondre avec les quotas du service d'envoi, qui sont indépendants et se
cumulent : la plus étroite des deux limites gagne.

**Volume estimé** (1 000 → 15 000 utilisateurs sur deux ans, soit ~600
inscriptions/mois, plus les réinitialisations) : **800 à 1 200 e-mails/mois**.

**Alternative si TEM déçoit : Brevo**, français également, offre gratuite de
300 e-mails/jour, données en centres européens. Deux défauts pour cet usage :
le logo Brevo apparaît sur les e-mails tant qu'on n'a pas payé (mauvais sur un
e-mail de vérification de compte), et l'infrastructure transactionnelle est
partagée avec le marketing, avec des délais de 5 à 15 secondes contre 1 à 3 pour
les services dédiés — perceptible sur une réinitialisation de mot de passe.

**Levier gratuit contre les pics :** le bandeau de la console TEM invite à
prévenir le support en amont d'un lancement ou d'un pic de trafic, pour ajuster
les paramètres d'envoi. À utiliser le jour où Google Play sort de revue ou
qu'un média parle de l'application.

### 9.6 Point RGPD — résolu

**Ce point est clos.** Il concernait Resend, dont les données de compte et les
journaux restent aux États-Unis. Avec Scaleway TEM en région PAR, les adresses
e-mail ne quittent pas l'UE. Rien de particulier à déclarer au-delà du fait que
Scaleway est sous-traitant pour l'envoi.

Le backend (Supabase) reste soumis à sa propre analyse, voir §11.

## 10. Modération et signalement — obligatoire dès le lot unique

Dès qu'un utilisateur peut en nommer un autre, les deux boutiques exigent de
pouvoir signaler et bloquer. **C'est le prix du pseudo, et il est irréversible :
on ne retire pas un pseudo une fois qu'il existe.**

À construire, rien de tout cela n'existant aujourd'hui :

1. **Signaler un pseudo**, depuis la fiche de l'ami.
2. **Bloquer quelqu'un**, avec effet immédiat sur tout ce qui le rend visible.
3. **Une adresse ou un formulaire** où arrivent les signalements (nécessite le
   nom de domaine, §11).
4. **Un moyen côté serveur** de renommer ou désactiver un compte fautif.
5. **Des règles d'usage publiées.**

**Charge : 35 à 45 h** pour l'ensemble amis + modération — au-delà de
l'estimation initiale de 25–35 h, qui n'incluait pas la modération.

**Mineurs :** le public d'un jeu de chasse urbaine en compte. Obligations
supplémentaires possibles (Play Families, consentement parental). À vérifier
avant soumission.

---

## 11. Services — état au 27/08/2026

| Service | Rôle | Coût | État |
|---|---|---|---|
| **Nom de domaine** | SPF/DKIM/DMARC, pages légales, adresse de signalement | ~12 €/an (.com) + ~7 €/an (.fr) | ✅ **Acquis** |
| **Scaleway TEM** (région PAR) | vérification d'adresse, réinitialisations | ~1–2 €/mois | ✅ **Branché** sur invaderquest.com |
| **Supabase Pro** | base de données, authentification, API | 25 $/mois | ⏳ À souscrire la semaine de la soumission |
| **Total** | | **~26 €/mois — ~310 €/an** | |

Budget révisé à la baisse : l'estimation initiale de ~490 €/an supposait Resend
à 20 $/mois.

### 11.1 Domaine — configuration effectuée

- `invaderquest.com` et `invaderquest.fr` enregistrés chez Scaleway.
- Transfert **verrouillé** (activé par défaut) — protège contre le détournement.
- **Renouvellement automatique activé** sur le .com. ⏳ Reste à faire sur le .fr.
- **Protection WHOIS active** : nom et adresse du titulaire masqués. (Le nom de
  Marco reste public sur l'App Store, obligation Apple pour un développeur
  individuel — sans rapport avec le WHOIS.)
- **DNSSEC désactivé, volontairement.** À activer plus tard, une fois l'envoi
  d'e-mails stabilisé : l'activer pendant la configuration compliquerait le
  diagnostic en cas de problème.
- **Envoi sans préfixe** : les e-mails partent de `invaderquest.com`, pas d'un
  sous-domaine. Plus rassurant sur un e-mail de vérification, et le domaine
  principal construit sa réputation d'envoi. L'argument classique du
  sous-domaine (isoler transactionnel et marketing) ne s'applique pas ici,
  faute de marketing par e-mail.
- Configuration DNS automatique de TEM cochée : SPF, DKIM et DMARC posés par
  Scaleway, sans copier-coller manuel. ⏳ À vérifier dans la zone racine.

**Pourquoi avoir branché l'envoi si tôt.** Un domaine qui n'a jamais envoyé
d'e-mail a une réputation nulle. Configuré le jour du lancement, les premiers
e-mails de vérification partiraient en indésirables au pire moment. Le domaine
vieillit désormais pendant le développement.

### 11.2 Pourquoi Supabase malgré le CLOUD Act

Supabase est une société américaine (Delaware) dont les régions européennes
tournent sur AWS : le CLOUD Act reste théoriquement applicable, ce que des
clauses contractuelles ne neutralisent pas. La région choisie (Francfort ou
Paris — **pas** la région générale « Europe », qui inclut Londres et Zurich,
hors UE) détermine où vivent les données, sauvegarde native comprise. Un DPA est
fourni.

**Décision : ce débat est disproportionné pour InvaderQuest.** Les données du
compte sont des adresses e-mail, des listes d'identifiants de mosaïques et des
pseudos. Aucune donnée sensible. La résidence en UE suffit pour la politique de
confidentialité.

**Options écartées, et pourquoi.** Auto-hébergement (Supabase self-hosted,
PocketBase, serveur loué) : offre une souveraineté supérieure, mais la
maintenance, les mises à jour de sécurité et les sauvegardes retombent sur Marco
indéfiniment — disqualifiant pour un débutant seul à maintenir. Alternatives
européennes managées (Appwrite Cloud, Nhost) : plus petites et moins
documentées, la différence se paierait en temps de galère.

**Pourquoi Pro et non l'offre gratuite :** sauvegardes quotidiennes
(indispensables pour un produit dont la promesse est de ne rien perdre) et
absence de mise en pause après inactivité. Plafond de dépense activé par défaut.

### 11.3 Déjà en place, rien à souscrire

Notifications push (service Expo, gratuit, déjà utilisé pour l'ISS) · EAS
(builds et mises à jour) · comptes développeurs Apple et Google ·
`services/analytics.js`.

### 11.4 Volontairement écartés

Pas d'outil de modération tiers, pas de surveillance payante, pas de plateforme
de support. À cette échelle, une adresse e-mail sur le domaine et le tableau de
bord de l'hébergeur suffisent.

### 11.5 Pages web à produire

Le chantier social **exige** des pages publiques, à héberger sur
invaderquest.com :

1. **Politique de confidentialité** — aujourd'hui sur Notion. À rapatrier et à
   réécrire pour couvrir comptes, pseudo, amis et défis.
2. **Règles d'usage** — imposées par la modération.
3. **Page ou formulaire de signalement** — imposé par la modération.
4. **Page de suppression de compte** — probablement exigée par Google Play en
   plus du geste dans l'application (vérification n°5 du §6).
5. Une page d'accueil minimale renvoyant vers les deux stores.

**Ce n'est pas un site de référencement.** Le référencement n'apporterait
probablement pas grand-chose : les gens cherchent une app sur les stores, pas sur
le web, et un site à contenu se maintient en quatre langues. Un vrai chantier
SEO (pages par ville, par exemple) serait un projet distinct, à évaluer plus
tard — pas à glisser dans un lot déjà à 90–125 h.

## 12. Modèle économique — planifié au lot suivant

**Décision : le paiement ne fait PAS partie du lot social.**

### 12.1 Le modèle retenu, à terme

**Abonnement sous les 2 €/mois**, avec accès temporaire à certaines
fonctionnalités puis paiement pour aller plus loin.

Ce modèle corrige les deux défauts de l'achat unique :

- un **coût récurrent** financé par un **revenu récurrent** (un acheteur unique
  paie une fois, son compte coûte tous les mois, indéfiniment) ;
- il touche aussi les **utilisateurs déjà installés**, qu'un passage au payant
  laisserait gratuits à vie.

### 12.2 Pourquoi pas maintenant

- **Charge :** 30 à 50 h de plus (module natif de paiement, configuration des
  deux consoles, écrans d'achat et de restauration, reçus, et surtout
  vérification côté serveur de qui est abonné — sans elle, l'abonnement se
  contourne trivialement). Le lot passerait de 90–125 h à 130–175 h, avec une
  soumission glissant vers février-mars.
- **Diagnostic :** social et paiement relèvent de deux domaines de règles
  entièrement distincts. Groupés, un refus devient bien plus difficile à
  attribuer.
- **Surtout : on ne sait pas encore quoi vendre.** Deux verbatims. Aucune idée de
  quels défis seront utilisés. Fixer aujourd'hui la frontière gratuit/payant,
  c'est deviner — trop restrictif on tue l'adoption de ce qu'on cherche
  justement à tester, trop généreux on ne pourra plus reprendre.

**Méthode :** livrer le social gratuitement, observer deux ou trois mois, puis
**placer la barrière là où la valeur s'est révélée.**

### 12.3 Deux précautions à prendre dès maintenant

1. **Prévoir côté serveur la place d'un statut d'abonné**, même inutilisé. Ne
   rien construire qui rendrait l'ajout d'un abonnement difficile plus tard.
2. **Ce qui est livré gratuitement ne se reprend pas.** Le jour où l'abonnement
   arrive, la sauvegarde des comptes existants doit rester accessible, au minimum
   en lecture et en export. Prendre en otage la collection de gens qui ont fait
   confiance se paierait en avis à une étoile pendant des années.

### 12.4 Ordre de grandeur

À ~490 €/an de coûts et une commission de boutique d'environ 30 % (15 % si
éligible au programme petits développeurs), un abonnement à 2 €/mois est
largement soutenable : quelques centaines d'abonnés suffisent, sur 15 000
utilisateurs visés.

**Mais la vraie question n'est pas « comment financer 41 €/mois »** — c'est
« suis-je prêt à assumer 41 €/mois ». Si oui, le chantier social n'a pas besoin
d'un modèle économique pour démarrer.

---

## 13. Charge et calendrier

| Poste | Charge |
|---|---|
| Compte de sauvegarde (backend, synchro, suppression, textes, tests) | 40–60 h |
| Amis + pseudo + modération + signalement | 35–45 h |
| Chrono asynchrone | inclus ci-dessus |
| Duel hebdomadaire + notifications quotidiennes | 10–15 h |
| Pages web légales (§11.5) | inclus dans les textes |
| **Total avant soumission** | **90–125 h** |

À 15–20 h/semaine : **5 à 8 semaines de travail effectif**, plus 1 à 3 semaines
de revue par cycle, non compressibles.

**SPACE_02 reste prioritaire.** Soumission plausible : **début décembre 2026**,
en supposant un seul cycle de revue — ce qui n'est jamais arrivé sur ce projet.

**Régime de croisière après livraison : 1 à 3 h/mois** (surveillance, mises à
jour, questions d'utilisateurs), plus les incidents. Sur un an, comparable au
temps de construction.

---

## 14. Audit de l'UID FlashInvaders (28/08/2026)

**Verdict : aujourd'hui, l'UID ne peut pas fuir. Mais rien ne protège l'avenir.**

Ce qui a été vérifié, chemin par chemin :

- Il vit sous une clé unique, `@invader_fi_uid`, déclarée dans le seul
  `services/flashinvaders.js`. Aucun autre fichier ne nomme cette clé.
- `getUid()` est le seul lecteur. Il n'a que **deux** consommateurs :
  `screens/ImportScreen.js` (pré-remplir le champ de saisie) et
  `components/SyncBanner.js` (l'envoyer à l'API FlashInvaders, sa raison d'être).
- `flashinvaders.js` ne contient **aucun** appel à `track()` ni à `console`.
- Les envois de mesure d'ImportScreen et de SyncBanner transmettent des
  compteurs, jamais l'identifiant. Le code porte déjà le commentaire
  « JAMAIS l'uid lui-même ».
- Les deux exports (`exportListe`, `exportNotes` dans `utils/importList.js`) sont
  des fonctions **pures de leurs arguments** : elles reçoivent respectivement
  `(flashed, flashedDates)` et `(notes, quand)`. Elles ne lisent aucun état
  global, donc l'UID n'est jamais dans leur portée.

### Le vrai danger est devant nous, pas derrière

Le risque n'est pas dans le code actuel : il naîtra le jour où quelqu'un écrira
la sauvegarde. La façon la plus naturelle de sauvegarder un état AsyncStorage est
`AsyncStorage.getAllKeys()` puis `multiGet`. Cette approche, en trois lignes et
parfaitement innocente à la lecture, **emporterait l'UID au serveur**, ainsi que
les traces GPS des sorties.

**RÈGLE À TENIR : la sauvegarde énumère explicitement les clés qu'elle emporte.**
Jamais de « tout sauf », jamais de balayage. Une liste blanche se relit et se
vérifie ; une liste noire oublie ce qui n'existait pas encore quand on l'a
écrite. Cette règle doit apparaître dans le code qui construira la sauvegarde,
pas seulement ici.

---

## 15. Inventaire complet des clés de stockage (28/08/2026)

Le §2 et le §3 reposaient sur trois fichiers seulement, et le §6 signalait
lui-même la lacune. Balayage exhaustif du dépôt : **51 clés**, contre les ~28
recensées. Voici les 23 manquantes, classées.

### 15.1 À DÉCIDER — le profil porte déjà un pseudo, un avatar et une PHOTO

`@invader_profile` (`components/profile/useProfile.js`) contient
`{ name, avatar, photoUri }`. Le fichier le décrit ainsi : « Profil 100 % LOCAL :
pseudo + avatar/photo stockés sur l'appareil. Pas de compte. »

**Trois conséquences que le cadrage n'avait pas vues :**

1. **Un pseudo existe déjà.** Le §2.2 le présente comme une nouveauté du lot
   social. Il faudra décider si le pseudo social réutilise celui-ci ou s'en
   distingue. Réutiliser est tentant, mais un pseudo choisi pour soi n'a pas été
   choisi pour être vu des autres : le rendre public sans le redemander serait
   déloyal.
2. **Il y a une PHOTO**, et le cadrage n'en parle nulle part. Une photo de profil
   visible par un ami est du contenu visuel produit par l'utilisateur : cela
   pèse bien plus lourd qu'un pseudo textuel en obligation de modération, et
   touche aux obligations sur les mineurs. **Recommandation : ne pas exposer la
   photo dans le lot social.** L'avatar prédéfini suffit à identifier un ami.
3. **`photoUri` est un chemin de fichier local.** Il n'a aucun sens hors de
   l'appareil. Le sauvegarder tel quel produirait un lien mort ; sauvegarder
   l'image demanderait un hébergement, donc un coût et une modération.

### 15.2 Ne monte pas — caches, retéléchargeables

`@invader_index_v2` · `@invader_data_<CODE>` · `@invader_meta_<CODE>` (dynamiques,
`services/invaderData.js`) · `@invader_news` · `@invader_iss_tle` ·
`@invader_photos_liste` · `@invader_photos_spotter` · `@invader_fi_photos`

### 15.3 Ne monte pas — préférences et état d'appareil

`@invader_theme` · `@invader_list_cities` · `@invader_collection_vus` ·
`@invader_import_card_off` · `@invader_gate_essais` · `@invader_gate_fait`
(UpdateGate) · `@invader_stroll_started` · `@invader_sortie_km` ·
`@invader_news_bell_hint` · `@invader_news_notified_upto` ·
`@invader_news_notify_day` · `@invader_iss_lieu` · `@invader_iss_alertes` ·
`@invader_api_calls` (quota ORS) · `@invader_fi_count`

### 15.4 Cas particulier — `@invader_usage`

`services/usageCounter.js` compte les usages hebdomadaires par fonctionnalité.
C'est **la fondation du futur abonnement** (§12) : le fichier documente déjà
comment l'activer en v2. Ne pas le sauvegarder, sinon un compteur de quota
deviendrait remettable à zéro en réinstallant. Il doit rester local, ou vivre
côté serveur le jour où l'abonnement arrive. À ne pas trancher maintenant, mais
à ne pas oublier non plus.

---

## 16. Décisions du 28/08/2026

### 16.1 Photo de profil : elle reste locale

Les amis voient l'**avatar prédéfini**, jamais la photo. Celle-ci continue de
vivre sur l'appareil, comme aujourd'hui, pour son propriétaire seul.

Motif : la règle 1.2 d'Apple exige « a method for filtering objectionable
material **from being posted** », donc un filtrage AVANT publication, pas un
simple bouton de signalement. Héberger des photos imposerait soit une relecture
manuelle à vie, soit un service d'analyse payant, et exposerait Marco au contenu
illégal que reçoit fatalement toute app qui accepte des images.

Ce choix laisse la porte ouverte : si des utilisateurs réclament les photos une
fois le social lancé, on tranchera sur des retours réels. Il rend surtout la
modération tenable, le seul contenu à filtrer devenant le pseudo.

### 16.2 Pseudo : proposé, jamais imposé

Le champ est **pré-rempli** avec `@invader_profile.name` s'il existe, mais
l'utilisateur doit le **confirmer explicitement**, avec un texte disant qu'il
sera visible des autres. Un pseudo choisi pour soi n'a pas été choisi pour être
vu : le publier sans le redemander serait déloyal.

### 16.3 Horodatage des défis : à la minute — ET SES CONSÉQUENCES

**Décision de Marco : on transmet l'horodatage des flashs à la minute**, comme le
prévoyait le §2.2. La recommandation inverse (score de manche et jour seulement)
n'a pas été retenue.

**Ce que cela oblige, et qui n'est pas négociable :**

1. **C'est de la donnée de localisation.** Un Invader a une position publique
   connue. « Flashé à 14 h 23 » signifie donc « cette personne était à ces
   coordonnées à 14 h 23 ». Sur une semaine de duel quotidien, le serveur détient
   une trace de déplacement.
2. **Les deux boutiques doivent le déclarer comme tel.** Position collectée, dans
   la Sécurité des données de Google Play comme dans les étiquettes Apple. Ne pas
   le faire serait un troisième refus assuré.
3. **La politique de confidentialité doit le dire en clair**, et ne peut plus
   affirmer qu'aucune position n'est transmise. Voir l'avertissement du §4.1.

**Atténuation à étudier, sans renoncer à la fonctionnalité :** purger les
horodatages dès la **clôture du défi** (une semaine au plus). La fonctionnalité
garde tout ce dont elle a besoin pendant qu'elle en a besoin, et le serveur cesse
d'accumuler une trace de déplacement au long cours. La déclaration reste due,
mais l'exposition devient bornée et se défend bien mieux devant un relecteur.
