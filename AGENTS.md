# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Invader Map — Contexte projet

## Vision
App mobile cross-plateforme pour repérer les mosaïques Space Invader, avec une meilleure UX que les outils existants (FlashInvaders, Paris Invaders Map, pnote.eu). Pas de fonctionnalité sociale.

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
Alerte de proximité, cartes hors-ligne, stats de progression, multi-villes, "Invaders sur le trajet". Social abandonné.

## Conventions
- Une fonctionnalité à la fois, une victoire visible à chaque étape.
- Commit Git régulier.
- Privilégier le local (pas de backend) tant que possible.

## Prochain build natif : quatre raisons, une seule revue Apple

Tout passe en OTA sur le runtime `1.2.0` (voir Stack). Ces quatre points ne le
peuvent pas et attendent donc un build. Les grouper évite deux revues et deux
montées de runtime, qui scindent chaque fois la base d'utilisateurs.

1. **react-native-maps 1.20.1 → 1.29.0.** Corrige des PLANTAGES qui touchent
   déjà la production. Signature relevée sur deux journaux d'incident du
   2026-08-09 : `-[__NSArrayM insertObject:atIndex:]: object cannot be nil`,
   levée depuis `RCTLegacyViewManagerInteropComponentView`. La 1.20.1 n'a aucun
   composant pour la nouvelle architecture, tous les enfants de la carte
   transitent donc par la couche d'interopérabilité de React Native ; celle-ci
   met en file tout enfant inséré ailleurs qu'en fin de liste, et insère au
   vidage un `contentView` encore nul quand la vue a été recyclée. La 1.29.0
   embarque de vrais composants (`ios/generated/RNMapsSpecs/`) et supprime la
   couche du chemin. Atténuation OTA en place : les marqueurs qui changent le
   plus sont montés EN DERNIER sur les trois écrans de carte, ce qui les fait
   passer par l'ajout direct. Vérifié sur l'appareil, mais partiel.

2. **Alerte de proximité perceptible.** Son personnalisé (fichier embarqué) et
   `interruptionLevel: 'timeSensitive'` (entitlement). Le haptique d'iOS ne
   produit RIEN quand l'app n'est pas au premier plan, ce qui est le cas d'usage
   entier ; sans build, le seul levier est de répéter les notifications. Voir la
   note mémoire `alerte-proximite-contraintes`.

3. **Android : refuser l'assombrissement forcé.** Constaté le 2026-08-10 sur un
   Xiaomi, confirmé en désactivant l'option système : le mode sombre forcé
   d'Android (« assombrir les applications » chez MIUI) repeint une app qui est
   DÉJÀ sombre. Le jaune `accentScore` `#FFD23F` devient brun, et le texte
   presque noir `#221A00` du bouton devient blanc. Les images ne sont jamais
   touchées, d'où le losange de lieu resté jaune sur la carte : c'est ce
   contraste qui a identifié la cause. Aucun correctif OTA n'existe, la couleur
   est repeinte par le système après nous.
   Correctif : `android:forceDarkAllowed=false` sur le thème de l'app, via un
   plugin de configuration `withAndroidStyles` (`@expo/config-plugins` est déjà
   installé ; `expo-build-properties` ne l'est pas et n'expose pas cette clé).
   Ne PAS y répondre en passant `userInterfaceStyle` à `dark` : ça figerait
   aussi le thème clair choisi par l'utilisateur dans les Réglages.

4. **Import d'un fichier .txt ou .csv.** Demandé le 2026-08-14. L'écran d'import
   ne sait lire qu'un texte collé ; ouvrir un fichier exige `expo-document-picker`,
   absent de `package.json` et donc du binaire. L'import par UID FlashInvaders,
   lui, est parti en OTA le même jour : il n'est que du réseau et du texte.
   Ajouter aussi `expo-file-system` si l'on veut écrire un export sur disque
   plutôt que de passer par la feuille de partage.

## À compléter (TODO)
- Étiquettes : UI pour créer / renommer / supprimer des étiquettes personnalisées (pour l'instant, seules les étiquettes par défaut existent).
- Faisceau de direction (cône heading) — reporté, à reprendre avec un test en extérieur.