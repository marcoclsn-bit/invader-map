# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Invader Map — Contexte projet

## Vision
App mobile cross-plateforme pour repérer les mosaïques Space Invader, avec une meilleure UX que les outils existants (FlashInvaders, Paris Invaders Map, pnote.eu).

**Le « pas de social » n'est plus la règle.** Décision levée consciemment le 27/08/2026 : des utilisateurs le demandent, et tous les concurrents en ont — ce n'est plus un différenciateur, c'est un rattrapage. Un lot unique est cadré (compte de sauvegarde, amis, deux défis, modération), mais **rien n'est engagé côté code** et SPACE_02 reste prioritaire. Lire `docs/SOCIAL-passation.md` avant toute action sur ce sujet.

## Profil
Porteur de projet orienté produit/design, débutant en code. Explications claires, pas-à-pas, une étape à la fois. Le code est délégué à l'assistant.

## Stack
- React Native + Expo, SDK 54 (template blank, JavaScript, point d'entrée App.js)
- Test sur iPhone via Expo Go : `npx expo start` depuis la racine, scanner le QR avec l'appareil photo
- Build & publication via EAS Build (cloud — pas de Mac requis pour compiler iOS)
- Carte : react-native-maps. Sur iOS dans Expo Go = Apple Maps, sans clé API. mapType "mutedStandard" pour un rendu épuré.

## État actuel
- Phase 0 terminée (outillage, projet créé, app sur iPhone)
- Phase 1 terminée : carte de Paris + 1 528 marqueurs Invaders colorés par statut
- `data/invaders.js` : 1 528 Invaders Paris uniquement (PA_01…PA_1528), champs propres — id, lat, lng (nombres), status normalisé (ok/damaged/destroyed/unknown), points (nombre), hint
- `App.js` : 4 onglets (Carte, Liste, Trajet, Réglages), état global via AppContext (flashed, labels, labelDefs, statusColors, colorOverrides, mapsApp)
- Règle de couleur des marqueurs : **flashé** (couleur de `lbl_flashed`) > **colorOverride** > **1re étiquette** > **couleur du statut**. `lbl_flashed` est une étiquette système (non assignable manuellement, flag `system: true`), recolorable dans Réglages.
- Prochaine étape : rafraîchissement automatique des données Invaders (GitHub Action + cache local)

## Roadmap
0. Setup ✅
1. MVP carte + marqueurs Invaders (en cours)
2. Données propres + rafraîchissement automatique
3. Feature "Invaders sur mon trajet" (turf.js + API d'itinéraire)
4. Synchro FlashInvaders (optionnelle, fragile, à isoler)
5. Polish UI/UX (dont fond de carte stylisé)
6. Publication : Google Play d'abord, puis Apple

## Données
- Sources : exports GeoJSON uMap, pnote.eu, invader-spotter.art (statuts), base GitHub goguelnikov/SpaceInvaders.
- Principe : NE PAS curer à la main. Consommer une source maintenue, cacher localement, rafraîchir via tâche planifiée (ex. GitHub Action).
- Respecter l'attribution ODbL (donnée dérivée d'OpenStreetMap).
- GeoJSON = coordonnées [longitude, latitude] (ordre inversé !).

## Features prévues
Alerte de proximité, cartes hors-ligne, stats de progression, multi-villes, "Invaders sur le trajet".

**Social — cadré le 27/08/2026, non engagé.** Lot unique : compte de sauvegarde (e-mail + mot de passe), amis avec pseudo, flashs en commun et surtout *la différence exploitable en chasse*, deux défis (chrono asynchrone, duel hebdomadaire sans sanction), signalement et blocage. 90–125 h. Hors lot : classement mondial, sortie partagée, abonnement. Détail dans `docs/SOCIAL-passation.md`, `docs/SOCIAL-modes-et-defis.md`, `docs/SOCIAL-cadrage-donnees.md`.

Règles à ne pas éroder : pas de sanction sur le duel quotidien (ni élimination, ni jokers) · les notes personnelles ne sont jamais visibles d'un tiers · l'UID FlashInvaders ne quitte jamais l'appareil · le cœur (carte, flashs, collection) reste utilisable sans compte ni serveur.

## Conventions
- Une fonctionnalité à la fois, une victoire visible à chaque étape.
- Commit Git régulier.
- Privilégier le local (pas de backend) tant que possible.

## Build 1.4.0 — préparé, à lancer

Le dépôt est prêt : `version` et `runtimeVersion` sont à `1.4.0`. On saute la
1.3.0, deux builds portant déjà ce numéro (iOS 19 du 29 juillet, Android 4 du
10 août) sans qu'on sache s'ils ont été soumis.

**CONSÉQUENCE IMMÉDIATE : plus aucun OTA n'atteint qui que ce soit.** Une
publication vise désormais le runtime `1.4.0`, qu'aucun appareil installé ne
porte. La chaîne de test par-dessus les airs est gelée jusqu'à ce qu'un build soit
installé. Les données de `data/`, elles, continuent d'arriver partout — elles ne
dépendent pas du runtime.

### Ce que le build apporte, et qui ne pouvait pas passer autrement

1. **react-native-maps 1.20.1 → 1.29.0.** Corrige des PLANTAGES en production :
   `-[__NSArrayM insertObject:atIndex:]: object cannot be nil`, levée depuis
   `RCTLegacyViewManagerInteropComponentView`. La 1.20.1 n'a aucun composant pour
   la nouvelle architecture, tous les enfants de la carte transitent donc par la
   couche d'interopérabilité, qui met en file tout enfant inséré ailleurs qu'en
   fin de liste et insère au vidage un `contentView` encore nul. La 1.29.0 embarque
   de vrais composants — vérifié dans `ios/generated/RNMapsSpecs/` : MapView,
   Marker, Polygon ET Polyline, les quatre que nous utilisons. Écart assumé avec
   l'épinglage du SDK 54, qui reste sur 1.20.1 : `expo install --check` s'en
   plaindra à chaque fois.

2. **Le son de l'alerte de proximité.** PAS d'entitlement « sensible au temps » :
   proposé, puis retiré après objection de Marco. Quelqu'un qui active
   Concentration dit qu'il ne veut pas être dérangé ; en faire un obstacle à
   contourner est ce que font les applications qu'on désinstalle. S'il veut ses
   alertes malgré tout, iOS lui offre déjà d'autoriser l'app dans ce mode précis.
   Le seul bénéfice réel — échapper au résumé programmé — touche une minorité,
   l'objection touche tout le monde. Et ça coûtait une capacité Apple : le
   premier build 1.4.0 a échoué dessus.

   **Huit sons embarqués** dans `assets/sons/`, déclarés dans le plugin
   `expo-notifications`. Ondes
   carrées, triangle et pulse, synthétisées, 18 à 101 Ko. **Arcade grave retenu.** Le plugin les RECOPIE dans le paquet au
   moment de la construction (`copyFileSync`) : un son ne peut donc jamais
   arriver par OTA. En revanche `SON_ALERTE` dans `strollEngine.js` décide lequel
   on joue, et CE changement-là passe par-dessus les airs. D'où huit candidats
   plutôt qu'un : changer d'avis ne coûtera pas une revue Apple. L'utilisateur,
   lui, décide seulement s'il veut du son — réglage `son` du Mode balade.

3. **Import et export par FICHIER**, avec `expo-document-picker` et
   `expo-file-system`. Écrit et livré dans ce build, pas seulement les modules :
   un bouton « Ouvrir un fichier » verse le contenu dans le même champ que le
   collage, et les deux exports écrivent un vrai fichier partagé par la feuille
   système, avec repli sur le texte. Utile parce qu'une collection parisienne
   complète avec ses dates pèse ~45 Ko : on ne colle pas ça dans un message.

4. **`expo-location` épinglé à `19.0.8` exactement.** `patches/expo-location+19.0.8.patch`
   vise cette version au caractère près, et ce build régénère le verrou. Le
   correctif retire le garde exigeant `UIBackgroundModes:location` et force
   `allowsBackgroundLocationUpdates` à `NO` : sans lui, `startGeofencingAsync` lève
   `LocationUpdatesUnavailable` et le mode Balade cesse d'exister.

5. `expo` 54.0.36 et `expo-updates` 29.0.19 — correctifs mineurs, gratuits ici.

### Abandonné, et pourquoi

**Le plugin Android `forceDarkAllowed=false`.** Décision de Marco : la population
concernée est marginale et le défaut est cosmétique. Mesuré avant de renoncer —
le contraste du bouton passe de 12,0:1 à 8,7:1 sous l'assombrissement forcé de
MIUI, bien au-dessus du seuil de 4,5:1. C'est laid, ce n'est pas illisible. Fait
tomber du même coup le besoin de déclarer `@expo/config-plugins`.

### Après le build

Installer le build preview À NEUF : c'est la seule façon de vérifier
`components/UpdateGate.js`, qui ne s'arme que sur un lancement embarqué. Vérifier
qu'un écran de préparation apparaît puis cède la place à l'app à jour.

## À compléter (TODO)
- Étiquettes : UI pour créer / renommer / supprimer des étiquettes personnalisées (pour l'instant, seules les étiquettes par défaut existent).
