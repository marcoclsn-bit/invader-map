// Génère data/poi_index.json à partir des fichiers de lieux.
//
// Ce petit index (quelques centaines d'octets) permet à l'app de savoir s'il
// existe une version plus récente SANS télécharger le fichier complet, qui
// pèse plus de 500 Ko. Même principe que data/index.json pour les Invaders.
//
// À relancer après toute modification d'un data/poi_<CODE>.json :
//   node scripts/build-poi-index.mjs

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

const cities = {};
for (const f of readdirSync(DATA)) {
  const m = f.match(/^poi_([A-Z]+)\.json$/);
  if (!m) continue;
  const j = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  cities[m[1]] = {
    version: j.version ?? 1,
    updatedAt: j.updatedAt ?? null,
    count: (j.pois ?? []).length,
    langs: {},
  };
}

// Versions des résumés traduits, pour que l'app sache quand recharger une
// langue déjà mise en cache. Sans cela, une traduction corrigée n'atteindrait
// jamais ceux qui l'ont déjà téléchargée.
for (const f of readdirSync(DATA)) {
  const m = f.match(/^poi_([A-Z]+)_([a-z]{2})\.json$/);
  if (!m || !cities[m[1]]) continue;
  const j = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  cities[m[1]].langs[m[2]] = j.version ?? 1;
}

const index = {
  version: Math.max(...Object.values(cities).map((c) => c.version), 1),
  updatedAt: new Date().toISOString().slice(0, 10),
  cities,
};

writeFileSync(join(DATA, 'poi_index.json'), JSON.stringify(index, null, 1) + '\n');
console.log('poi_index.json :', Object.entries(cities)
  .map(([k, c]) => `${k} v${c.version} (${c.count}) · langues ${Object.entries(c.langs).map(([l, v]) => l + 'v' + v).join(' ') || 'aucune'}`)
  .join(' | '));
