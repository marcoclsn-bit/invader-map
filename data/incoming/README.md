# data/incoming/

Dépose ici les fichiers CSV de positions Invaders avant de les convertir.

## Format attendu

Fichier texte, encodage UTF-8 (avec ou sans BOM), virgule comme séparateur.
La **première ligne** doit être l'en-tête. Les noms de colonnes sont sensibles
à la casse (minuscules).

### Colonnes obligatoires

| Colonne | Description |
|---------|-------------|
| `id`    | Identifiant Invader — ex. `PA_1529` |
| `lat`   | Latitude GPS, nombre décimal (point **ou** virgule) — ex. `48.8601` |
| `lng`   | Longitude GPS, nombre décimal (point **ou** virgule) — ex. `2.3477` |

### Colonnes optionnelles

| Colonne  | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `hint`   | Indice de localisation (texte libre) | *(vide)* |
| `status` | `ok` / `damaged` / `destroyed` / `hidden` / `unknown` | `unknown` |
| `points` | Valeur en points : 10, 20, 30, 40 ou 50 | `10` |

Les colonnes peuvent être dans n'importe quel ordre du moment que l'en-tête
les nomme correctement.

## Exemple de fichier valide

```
id,lat,lng,hint
PA_1529,48.8601,2.3477,Rue de Rivoli angle rue du Roule 1er arr.
PA_1530,48.8712,2.3301,
PA_1531,48.8553,2.3489,Île de la Cité
```

⚠️ **Les coordonnées doivent utiliser le point décimal** (pas la virgule).
En CSV, la virgule est le séparateur de colonnes — écrire `48,8601` serait
interprété comme deux colonnes séparées.
Dans Google Maps, si les coordonnées affichées utilisent une virgule
(`48,8601`), remplace-la par un point avant de coller dans le CSV.

## Commande de conversion

```bash
node scripts/csv_to_extras.mjs data/incoming/mon_fichier.csv --source=pnote
```

Puis, pour intégrer dans invaders.json :

```bash
node scripts/build_invaders.mjs
git add data/invaders_extras.json data/invaders.json
git commit -m "extras: import pnote via CSV"
git push
```
