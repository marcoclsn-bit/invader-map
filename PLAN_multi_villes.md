# Plan — Multi-villes Palier 1
# Invader Map — Revue d'architecture

Date : 2026-06-23
Auteur : Claude (Sonnet 4.6) — généré pour revue externe

---

## Contexte

App React Native / Expo SDK 54 (JavaScript, point d'entrée App.js).
Aujourd'hui l'app ne gère que Paris (1 528 Invaders, code ville "PA").
Objectif du Palier 1 : poser l'architecture multi-villes sans encore activer
d'autres villes. Paris doit continuer à fonctionner exactement comme avant.

Stack pertinente :
- React Navigation (native stack + bottom tabs)
- react-native-maps (Apple Maps sur iOS via Expo Go)
- @turf/turf pour les calculs géospatiaux
- OpenRouteService (ORS) pour geocoding et itinéraires
- AsyncStorage pour la persistance locale
- i18next + react-i18next (4 langues : fr, en, es, it)
- Données : goguelnikov/SpaceInvaders (source communautaire), filtrage Paris en dur

---

## Inventaire des couplages "Paris en dur"

| Fichier                      | Quoi                                                        | Lignes   |
|------------------------------|-------------------------------------------------------------|----------|
| screens/MapScreen.js         | initialRegion Paris, check nearParis, sortCenterRef         | 338, 396, 483 |
| screens/TrajetScreen.js      | const PARIS = {...}, focus ORS autocomplete/geocode, boundary.country=FR | 21, 52, 75 |
| screens/ChasseScreen.js      | idem TrajetScreen + filtre arrondissements Paris            | 20, 110, 127 |
| screens/PalmèresScreen.js    | drillVille === 'Paris' hardcodé, INVADER_DISTRICT global    | 139, 153, 183 |
| utils/arrondissement.js      | calculé au chargement sur TOUS les Invaders (Paris implicite) | tout    |
| scripts/build_invaders.mjs   | filter(entry => entry.city === 'PA'), bbox Île-de-France fixe | 142, 43 |
| services/invaderData.js      | neutre — aucun couplage Paris                               | —        |
| context/AppContext.js        | neutre — aucun couplage Paris                               | —        |
| screens/ListScreen.js        | neutre                                                      | —        |
| screens/SettingsScreen.js    | neutre                                                      | —        |

---

## Architecture cible

### 1. Registre des villes — cities/registry.js (NOUVEAU)

```js
export const CITIES = {
  PA: {
    code: 'PA',
    name: 'Paris',
    center: { lat: 48.8566, lng: 2.3522 },
    mapDelta: { latitudeDelta: 0.12, longitudeDelta: 0.12 },
    bbox: { minLat: 48.50, maxLat: 49.10, minLng: 1.90, maxLng: 3.00 },
    orsCountry: 'boundary.country=FR',
    // GeoJSON de subdivisions (null = pas de drill-down dans le Palmarès)
    subdivisionsKey: 'paris-arrondissements',  // clé dans le loader
    subdivisionLabel: (n) => n === 1 ? '1er arr.' : `${n}e arr.`,
    enabled: true,
  },
  // LDN: { ..., enabled: false },  ← décommenter pour activer Londres
  // NY:  { ..., enabled: false },
};

export const ENABLED_CITIES = Object.values(CITIES).filter(c => c.enabled);
export const DEFAULT_CITY = CITIES.PA;
```

Règles :
- Activer une nouvelle ville = ajouter un bloc dans CITIES + passer enabled: true.
  C'est le SEUL fichier à toucher pour l'enregistrement d'une ville.
- Brancher des subdivisions = mettre subdivisionsKey: 'london-boroughs'
  + déposer le GeoJSON dans data/. Aucun code Palmarès à réécrire.
- Le champ subdivisionsKey est optionnel (null = ville sans drill-down).

Questions pour la revue :
- La structure du registre vous semble-t-elle extensible ?
- Doit-on ajouter un champ "zoom" distinct de mapDelta ?
- Faut-il prévoir un champ pour le code pays ISO (utilisé dans le titre i18n) ?


### 2. Subdivisions par ville — cities/subdivisions.js (NOUVEAU)

Remplace la logique de utils/arrondissement.js qui calcule tout au niveau
module (chargement global, Paris implicite).

```js
// Charge et calcule le district map pour une ville donnée
// Retourne null si la ville n'a pas de GeoJSON de subdivisions
export function loadSubdivisions(city) {
  // → { districtMap: Map<invaderId, districtId>, centers: Map<districtId, {lon,lat}>, labelFn }
  // → null si city.subdivisionsKey === null
}

// utils/arrondissement.js garde ses exports actuels pour la compatibilité :
//   INVADER_DISTRICT, ARRONDISSEMENT_CENTERS, arLabel
// Il délègue simplement à subdivisions.js avec CITIES.PA.
// Aucun import existant à modifier dans ChasseScreen / PalmèresScreen.
```

Questions pour la revue :
- Faut-il recalculer le districtMap à chaque changement de ville (useEffect)
  ou le pré-calculer pour toutes les villes activées au démarrage ?
  (Paris seul : recalcul immédiat. 5 villes : potentiellement 500ms de turf)
- Le districtMap doit-il vivre dans AppContext ou dans un module singleton ?


### 3. Pipeline de données — scripts/build_invaders.mjs

Approche choisie : UN fichier unique multi-villes, filtré en mémoire côté app.

Tradeoffs :

  Approche unique (recommandée pour Palier 1) :
    + Simple — une URL, un cache, une clé AsyncStorage, pipeline inchangé
    + Adapté jusqu'à ~10 villes (Paris ~1 500 × 5 villes ≈ 7 500 items ≈ 600 Ko)
    - À revoir si > 10 villes ou villes très denses (Tokyo 3 000+)

  Approche par fichier (index + invaders_PA.json, invaders_LDN.json…) :
    + App charge seulement la ville active
    + Versionnage indépendant par ville
    - Plus complexe : index à gérer, plusieurs fetch, plusieurs cache keys
    - Casse le pipeline actuel (GitHub Action, URL, invaderData.js)
    → Prévoir pour Palier 2 si le total dépasse ~3 Mo

Changements dans le script :

```js
// Remplace le filtre unique 'PA' par une config par ville
const ENABLED_CITY_CODES = ['PA']; // ← ajouter 'LDN', 'NY' etc. pour activer

// Bbox par ville (au lieu d'une seule bbox fixe Île-de-France)
// Validation : chaque Invader est dans la bbox de SA ville (pas de mélange)

// Garde-fous par ville : chute > 10% → refus d'écrire (même logique qu'aujourd'hui)

// Sortie : même format { version, updatedAt, invaders: [...toutes villes actives...] }
// Le champ city sur chaque Invader permet le filtre côté app
```

Pas de changement de format du fichier de sortie. services/invaderData.js
et AppContext restent compatibles sans modification.

Questions pour la revue :
- Valide-t-on l'approche "fichier unique" pour Palier 1 ?
- Doit-on déjà inclure dans ENABLED_CITY_CODES une deuxième ville pour
  tester le pipeline, même si elle reste désactivée dans le registre app ?


### 4. AppContext — ville courante

```js
// Nouvel état persisté
const [currentCity, setCurrentCityState] = useState(DEFAULT_CITY);
// Persisté : '@invader_current_city' → 'PA'

// allInvaders = toutes les données du cache (toutes villes)
// invaders (exposé aux écrans) = filtré par ville courante
const invaders = useMemo(
  () => allInvaders.filter(i => i.city === currentCity.code),
  [allInvaders, currentCity]
);

// setCurrentCity(cityCode) → change l'état + persiste AsyncStorage
// La progression (flashed, labels, colorOverrides) reste inchangée :
// indexée par id Invader (PA_01, LDN_01...), indépendante de la ville affichée
```

Garantie non-régression : les screens ne voient que les Invaders de la ville
active. Changer de ville ne touche pas flashed/labels — les données de
progression sont toutes là, juste pas visibles quand la ville n'est pas active.

Questions pour la revue :
- currentCity expose-t-il l'objet complet CITIES.PA ou juste le code 'PA' ?
  (objet complet = plus pratique dans les écrans, code seul = plus sûr)
- Faut-il exposer aussi allInvaders (non filtré) pour des stats globales ?


### 5. Sélecteur de ville

Proposition : chip dans le header de la Carte (à côté du bouton Filtres),
et dans le header du Palmarès.

Comportement :
- Si une seule ville active (cas actuel : Paris seul) → chip non affiché
- Si ≥ 2 villes activées → chip visible, tap ouvre un ActionSheet ou modal
- Changer de ville : re-centre la carte, recalcule les subdivisions,
  les marqueurs changent. La liste / trajet / chasse s'adaptent automatiquement
  via le filtre AppContext.

Questions pour la revue :
- Le placement Carte + Palmarès vous convient-il ?
- Préférez-vous un sélecteur permanent (même avec une seule ville) pour
  anticiper l'ajout de villes, ou masqué tant qu'il n'y en a qu'une ?


### 6. Palmarès — cascade générique

Structure actuelle (hardcodée Paris) :
  [Paris] → [Arrondissements]

Structure cible :
  [Villes loop] → CityCard → tap → [Subdivisions si city.subdivisionsKey]
                                 → ou vue simple (total seul)

```jsx
// PalmèresScreen — logique générique
ENABLED_CITIES.map(city => (
  <CityCard
    key={city.code}
    city={city}
    stats={computeCityStats(city, allInvaders, flashed)}
    onDrill={() => setDrillCity(city)}
  />
))

// Vue subdivisions — paramétrable par ville
if (drillCity.subdivisionsKey) {
  <SubdivisionsView
    city={drillCity}
    subdivisions={loadedSubdivisions}   // résultat de loadSubdivisions(drillCity)
    stats={subdivisionStats}
    onHunt={(subdivisionId) => navigateToHunt(drillCity, subdivisionId)}
  />
} else {
  <CityDetailView city={drillCity} stats={cityStats} />
}
```

ArrondissementsView est renommé SubdivisionsView et paramétré.
Ajouter une ville + GeoJSON = zéro code Palmarès à modifier.

Questions pour la revue :
- La cascade Villes → Subdivisions est-elle suffisante, ou faut-il prévoir
  un 3e niveau (ex : Villes → Quartiers → Rues) pour certaines villes ?
- Le drill-down doit-il être navigué (push screen) ou affiché en place
  (swap dans le même écran, comme aujourd'hui) ?


---

## Séquence d'implémentation

| Étape | Fichier(s)                        | Risque Paris | Peut casser |
|-------|-----------------------------------|--------------|-------------|
| 1     | cities/registry.js (créer)        | aucun        | rien        |
| 2     | cities/subdivisions.js (créer)    | faible       | utils/arrondissement.js si mal délégué |
| 3     | scripts/build_invaders.mjs        | aucun        | rien côté app |
| 4     | context/AppContext.js             | moyen        | tout si le filtre invaders est mal posé |
| 5     | screens/MapScreen.js              | faible       | vue initiale si coords mal passées |
| 6     | screens/TrajetScreen.js           | faible       | ORS si country mal passé |
| 7     | screens/ChasseScreen.js           | faible       | idem + filtre arrondissements |
| 8     | screens/PalmèresScreen.js         | moyen        | cascade si stats mal recalculées |
| 9     | i18n (4 fichiers locales)         | aucun        | rien        |

Stratégie de non-régression :
- Paris reste la seule ville activée pendant tout le refactor
- Chaque étape est testable séparément sur iPhone via Expo Go
- Le filtre AppContext (étape 4) est le point le plus critique :
  vérifier que invaders.length === 1528 après le refactor

---

## Fichiers créés / modifiés / non touchés

Créés (nouveaux) :
  cities/registry.js
  cities/subdivisions.js

Modifiés :
  scripts/build_invaders.mjs
  context/AppContext.js
  screens/MapScreen.js
  screens/TrajetScreen.js
  screens/ChasseScreen.js
  screens/PalmèresScreen.js
  utils/arrondissement.js  (délègue à subdivisions.js, exports inchangés)
  locales/fr.json, en.json, es.json, it.json  (noms de villes)

Non touchés (aucun couplage Paris) :
  screens/ListScreen.js
  screens/SettingsScreen.js
  screens/AboutScreen.js
  screens/OnboardingScreen.js
  services/invaderData.js
  data/invaders.js
  data/paris-arrondissements.json
  i18n/index.js
  theme/
  constants.js

---

## Questions ouvertes (à trancher avant l'implémentation)

1. Sélecteur de ville : chip Carte + Palmarès, ou autre placement ?

2. Approche données : fichier unique validé pour Palier 1 ?
   (Palier 2 = split par fichier si > 5 villes ou > 2 Mo total)

3. utils/arrondissement.js : garder les exports actuels par délégation
   (compat immédiate, zéro migration dans les screens) ou renommer
   franchement (plus propre, migration dans ChasseScreen + PalmèresScreen) ?

4. districtMap : recalculé à chaque changement de ville (simple) ou
   pré-calculé pour toutes les villes au démarrage (plus rapide, plus de RAM) ?

5. currentCity dans le contexte : objet complet CITIES.PA ou code string 'PA' ?

6. Palmarès drill-down : navigué (push) ou swap en place ?

7. Sélecteur : masqué si une seule ville active, ou toujours visible ?

---

## Ce qui ne change pas pour Paris

- Toutes les données PA_01…PA_1528 passent sans modification
- flashed, labels, colorOverrides restent indexés par id Invader → inchangés
- Le comportement Carte / Trajet / Chasse / Palmarès Paris est identique :
  mêmes chemins de code, juste paramétrés via le registre
- paris-arrondissements.json n'est pas modifié
- La GitHub Action de mise à jour automatique des données continue de fonctionner

---

## Contexte technique de l'app (pour la revue)

- React Native + Expo SDK 54, JavaScript (pas TypeScript)
- Point d'entrée : App.js
- Test via Expo Go sur iPhone
- Navigation : @react-navigation/native-stack + bottom-tabs
- Carte : react-native-maps (Apple Maps sur iOS, pas de clé API)
- Géospatial : @turf/turf
- Itinéraires : OpenRouteService (clé API dans config/ors.js — gitignored)
- i18n : i18next + react-i18next + expo-localization (fr/en/es/it)
- Fonts : Silkscreen (titres arcade), Press Start 2P (scores)
- Thème : sombre par défaut, clair disponible, accent néon vert
- État global : AppContext (React Context + AsyncStorage)
- Données distantes : GitHub raw → cache AsyncStorage → embarqué en fallback
