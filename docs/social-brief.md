# Brief — ouverture du chantier « social »

> Document de démarrage pour une conversation de CONCEPTION. Il décrit l'existant
> et pose les questions ouvertes. Il ne décide rien : les arbitrages appartiennent
> à Marco. Rédigé le 27/08/2026.

## 1. Pourquoi ce document

`AGENTS.md` porte une décision explicite : « Social abandonné ». Marco souhaite
rouvrir la question (comptes, amis, défis entre amis). Rouvrir une décision
fondatrice se fait consciemment : la première chose à établir est **ce qui a
changé** et **quel problème le social résoudrait** (rétention ? émulation ?
demande d'utilisateurs ?). Une feature sociale qui n'est qu'une case à cocher
coûte un backend et une revue de confidentialité, pour rien.

## 2. L'existant, en fait (pas en intention)

L'app est **100 % locale, sans aucun backend**. Tout l'état joueur vit dans
AsyncStorage sur l'appareil :

- **Flashs** — `context/AppContext.js` : `flashed` (Set d'ids, clé
  `invader_flashed`) et `flashedDates` (Map id → date).
- **Progression par ville** — même contexte : `{ flashedCount, flashedPts,
  denominator, posed, completed }` par code ville ; affichée par
  `screens/PalmaresScreen.js`.
- **Badges et sessions** — `context/GamificationContext.js` (`unlocked`,
  `sessions`), `services/badgeStore.js`.
- **Sorties** — `utils/sorties.js`, `screens/SortiesScreen.js`.
- **Import / export par fichier** — `screens/ImportScreen.js`, `utils/fichiers.js` :
  une collection s'exporte et se réimporte déjà (~45 Ko pour Paris complet).
- **Synchro FlashInvaders** — `services/flashinvaders.js`, par UID. L'UID est un
  **porteur d'authentification** : jamais dans un log, une capture ou un partage.

Le seul « social » actuel est **le partage d'image** : `services/shareStory.js`
capture un visuel 9:16 et ouvre la feuille de partage système. Pas de compte, pas
de serveur, pas d'identité.

**Conséquence directe** : il existe déjà de quoi comparer des progressions
(scores par ville, badges, sorties). Ce qui manque n'est pas la donnée, c'est le
**transport** entre deux joueurs.

## 3. Contraintes réelles à intégrer

- **« Local d'abord, pas de backend »** est une convention du projet. Des comptes
  impliquent un serveur : c'est la rupture principale à assumer, ou à contourner.
- **Historique de conformité** : Google Play a refusé l'app **deux fois** en août
  2026 sur la divulgation de localisation. Toute donnée qui sort du téléphone doit
  être décrite exactement dans l'app ET dans la politique de confidentialité
  (`docs/privacy-policy.md`). Voir aussi `screens/PrivacyPolicyScreen.js`.
- **Suppression de compte obligatoire** : Apple et Google l'exigent, depuis l'app,
  dès lors qu'un compte existe. À concevoir dès le départ, pas après.
- **Modération** : dès qu'un utilisateur peut en nommer un autre (pseudo, message
  de défi), il faut un moyen de signaler et de bloquer.
- **Mineurs** : le public d'un jeu de chasse urbaine en compte. Cela déclenche des
  obligations supplémentaires (Play Families, consentement parental).
- **Quota de builds** : 15 builds iOS par mois. Privilégier ce qui passe en OTA.

## 4. Le gradient à explorer (aucune option n'est privilégiée ici)

Entre « zéro social » et « réseau social », il y a des paliers de coût très
différents. À arbitrer :

1. **Sans compte ni serveur** — échange de collections par fichier ou QR code,
   défis vérifiés localement. Zéro backend, zéro donnée personnelle, zéro revue
   supplémentaire. Réutilise l'import/export déjà livré.
2. **Identité légère** — un code d'invitation, un pseudo, pas d'e-mail ni de mot
   de passe. Un serveur minimal, peu de données personnelles.
3. **Comptes complets** — inscription, amis, défis persistants, classements.
   Backend à héberger et maintenir, RGPD, suppression de compte, modération.

Chaque palier doit être évalué sur : valeur pour le joueur, coût de construction,
coût **récurrent** (hébergement, modération, support), et risque de conformité.

## 5. Questions ouvertes à trancher avec Marco

- Quel problème le social résout-il, concrètement ?
- Un « défi entre amis » a-t-il besoin d'un compte, ou un code partagé suffit-il ?
- Qui paie l'hébergement, et combien par mois au maximum ?
- Que se passe-t-il si le serveur tombe ? L'app doit-elle rester utilisable ? (Oui,
  presque certainement : le cœur doit rester local.)
- Comment on triche ? Un score déclaré par le client est falsifiable par nature.

## 6. Où en est le reste du projet (pour ne pas concevoir dans le vide)

- **v1.4.0** en ligne sur l'App Store ; Google Play en revue (build 8).
- **Feature ISS / SPACE_02** : branche `feature/iss-space02`, non fusionnée.
  Écran + notifications livrés dans le **build 23 iOS** (canal `preview`).
- Le social ne doit pas retarder ces chantiers : branche dédiée, interrupteur de
  fonctionnalité (voir `services/featureAccess.js`), rien en production sans
  accord explicite.
