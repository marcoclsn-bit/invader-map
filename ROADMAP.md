# Invader Map — Roadmap & Estimations

> Document de pilotage. Les estimations sont des **fourchettes d'orientation**, pas des engagements : pour un premier projet, la réalité bouscule toujours les chiffres. Les lots 3, 4 et 5 sont les plus incertains. « Heures » = travail actif (sessions Claude Code + tests).

## État actuel (fait ✅)
- Environnement : Expo SDK 54, Claude Code, AGENTS.md/CLAUDE.md, Git.
- Carte de Paris (react-native-maps, Apple Maps, mapType `mutedStandard`).
- Jeu de données réel : 1528 Invaders de Paris, nettoyés (virgule → point, statuts normalisés).
- Marqueurs colorés par statut.
- Tap sur un marqueur → fiche (id, statut, points, indice, bouton « Y aller »).
- Étiquettes/couleurs : étiquettes par défaut + précédence de couleur (création perso = à finir).
- Marquage flashé : manuel (fiche) + en masse (écran liste : recherche, filtre, compteur, tout marquer / démarquer).
- Géolocalisation : point bleu natif + bouton « Me localiser » (faisceau de direction reporté).
- Navigation à onglets (Carte + Liste).
- « Y aller » : ouvre Plans / Google Maps, choix mémorisé, marche par défaut.
- Feature trajet (base) : départ (Ma Position) + arrivée avec autocomplétion ORS, à pied / vélo, itinéraire ORS, couloir turf.js, comptage des Invaders du trajet.

## Principe de travail
- Une fonctionnalité à la fois ; commit dès que ça marche.
- Claude Code (au Mac) pour coder ; le chat pour planifier / brainstormer.
- Test via Expo Go (tunnel pour l'extérieur), puis dev build / EAS le moment venu.
- Viser une **sortie tôt** : publier une v1 et itérer en mises à jour.

---

## Lot 1 — Finir le MVP — ~6–12 h
À attaquer en premier (rapide, haute valeur, boucle le MVP).
- Création d'étiquettes perso (créer / renommer / supprimer) — 1,5–3 h
- Vérifier / finir le filtrage carte (statut, flashé, étiquettes) — 1–2 h
- Onglet Réglages (reset, app de cartes par défaut, futurs réglages) — 1,5–3 h
- Trajet actionnable : liste cliquable + filtre « reste à flasher » + largeur de couloir réglable — 2–4 h

## Lot 2 — Engagement + feature phare — ~8–16 h
- Onglet Stats (progression par ville / quartier, points, façon « high score ») — 2–4 h
- Mode boucle (circuit depuis ma position) — 2–4 h
- Itinéraire optimisé « 2 h dans le 15e, max de points » (formulaire d'abord ; langage naturel plus tard ; optimisation heuristique) — 4–8 h

## Lot 3 — Chantier données (MAJ automatique) — ~6–12 h
Session dédiée (guidée). Le plus susceptible de déraper (wrangling des sources).
- Découpler les données du binaire : l'app télécharge + met en cache (repli embarqué) → plus de MAJ via le Store
- Pipeline de rafraîchissement (tâche planifiée) depuis une source plus fraîche (corrige le blocage à PA_1528) : nettoyage / normalisation, republication à une URL contrôlée
- Respect licence / attribution (ODbL, sources)

## Lot 4 — Alertes de proximité (« Mode balade ») — ~6–12 h
⚠️ Plus lourd : nécessite un **dev build** (plus testable dans Expo Go), arrière-plan, permission « Toujours autoriser ».
- Toggle explicite « Mode balade » (éteint par défaut → zéro spam en trajet)
- Arrière-plan : surveiller les ~20 non-flashés les plus proches (limite iOS), recalcul en marchant
- Anti-spam : le plus proche d'abord, un à la fois, délai, filtre de vitesse (marche seulement)
- Vibration douce et distincte ; rayon réglable (défaut ~50 m)

## Lot 5 — Polish & identité — ~10–20 h
Extensible à l'infini par nature.
- Thème clair / sombre (sombre = mode « héros »), système de thème
- Typo arcade (titres / scores) + corps lisible
- Game feel : animation + « +30 PTS » + haptique **sur la carte uniquement** (pas dans la liste) ; son optionnel
- Icônes pixel-art originales (alien rétro ; couleur = statut ; traitement « flashé » ; PNG légers, perf)
- Style de carte sombre / néon (tuiles custom — choix de fournisseur à trancher)
- Onboarding avec caractère, empty states, icônes d'onglets cohérentes

## Lot 6 — Sortie — ~8–15 h (+ attente de review)
- Vérifs droits : icônes (originales), photos (droits), licence des données
- EAS Build (builds de prod)
- Beta (TestFlight / test interne)
- Google Play d'abord, puis Apple Developer Program
- Comptes : 25 € Google (une fois), 99 €/an Apple

---

## Petits plus (optionnels, à glisser quand l'envie vient) — ~1–6 h chacun
- Liste « Autour de moi » (non-flashés les plus proches, triés par distance)
- Cartes hors-ligne
- Partage d'une chasse planifiée entre amis (version « maligne » du social, sans backend)
- Photo de la mosaïque sur la fiche (⚠️ droits à clarifier)

## En attente de décisions
- Photos des mosaïques : droits / source à clarifier avant publication
- Faisceau de direction (cône heading) : à retester en extérieur (tunnel / dev build)
- Social complet (chat / mise en relation) : v2, gros chantier (backend, modération, sécurité, masse critique)
- Tuiles de carte stylisées : choix de fournisseur (Mapbox / MapLibre / tuiles custom)

---

## Estimations globales & calendrier
- **Total cœur (Lots 1–6) : ~50–90 h.**
- Rythme tranquille (~3 h/sem) → ~4–7 mois
- Rythme soutenu (~6 h/sem) → ~2–3,5 mois

## Jalons
- **MVP poli** (fin Lot 1) : ~6–12 h → quelques semaines.
- **Version publiable** (Lot 1 + polish minimal + Lot 6) : ~25–40 h cumulées → le reste en mises à jour.
- **Version complète** (tous les lots) : ~50–90 h.