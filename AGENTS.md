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

## À compléter (TODO)
- Étiquettes : UI pour créer / renommer / supprimer des étiquettes personnalisées (pour l'instant, seules les étiquettes par défaut existent).
- Marquage « déjà flashé » / « reste à faire » par l'utilisateur (toggle sur la fiche d'un Invader).
- Faisceau de direction (cône heading) — reporté, à reprendre avec un test en extérieur.