# Sauvegarde des marqueurs « flashé » verts

Copie conforme des quatre fichiers tels qu'ils étaient avant le passage au
violet du 2026-08-10, à l'identique au pixel près.

Ce dossier est HORS de `assets/` volontairement : Metro n'embarque que les
images atteintes par un `require()`, mais un fichier posé dans `assets/`
alourdirait inutilement les builds natifs. Ici, il ne coûte rien à personne.

## Revenir en arrière

Le vrai retour arrière est git :

    git checkout <sha-avant> -- assets/markers/alien_flashed.png assets/markers/android/alien_flashed*.png constants.js

Et pour annuler une publication déjà partie :

    npx eas update:republish --branch <preview|production>

Ces fichiers ne servent donc qu'à comparer visuellement, ou à recolorer autre
chose à partir du vert d'origine.
