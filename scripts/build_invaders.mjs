#!/usr/bin/env node
/**
 * scripts/build_invaders.mjs
 *
 * Pipeline multi-sources :
 *   Base      : goguelnikov/SpaceInvaders — ids, coordonnées réelles, points, statuts
 *   Enrichit  : pnote.eu — instagramUrl (100 % couverture) + ids absents de gog
 *   Enrichit  : invader-spotter.art — points manquants + photos (gros plan) + statut de secours
 *               (comble uniquement les trous, ne écrase jamais gog ; villes couvertes = SPOTTER_CITIES)
 *   Surcharge : data/invaders_extras.json — toujours prioritaire
 *
 * Règles de fusion (par id) :
 *   - Coordonnées  : goguelnikov (réelles) pour les ids communs ; obf_lat/obf_lng pnote pour les ids pnote-only
 *   - Statut       : goguelnikov pour les ids communs (pnote ignoré, divergences loguées)
 *   - points       : goguelnikov ; null si absent ou id pnote-only
 *   - instagramUrl : pnote pour tous les ids (gog n'en a pas)
 *   - source       : "goguelnikov" / "pnote" / "extras"
 *
 * Sortie :
 *   data/index.json             — liste légère des villes
 *   data/invaders_<CODE>.json   — Invaders par ville
 *
 * Garde-fous par ville (sur la base goguelnikov) :
 *   - chute > 10 % vs version précédente → skip
 *   - contenu inchangé → pas de réécriture
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash }    from 'crypto';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { fetchSpotterCity, fetchSpotterNews, SPOTTER_SUPPORTED } from './fetch_spotter.mjs';

// ── URLs sources ──────────────────────────────────────────────────────────────

const GOG_URL   =
  'https://raw.githubusercontent.com/goguelnikov/SpaceInvaders/main/world_space_invaders_V05.json';
const PNOTE_URL = 'https://pnote.eu/projects/invaders/map/invaders.json';

const __dir      = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dir, '..', 'data');
const INDEX_FILE = join(DATA_DIR, 'index.json');
const EXTRAS_FILE= join(DATA_DIR, 'invaders_extras.json');
const NEWS_FILE  = join(DATA_DIR, 'news.json');

const MAX_LOSS_PCT = 0.10;

// Historique d'événements (News) : volume conservé
const NEWS_MAX_EVENTS = 500;   // nombre max d'événements gardés
const NEWS_MAX_MONTHS = 6;     // ou fenêtre temporelle (le plus restrictif s'applique)

const SOURCE_ATTRIBUTION =
  'Données issues de goguelnikov/SpaceInvaders (communauté Space Invader hunters, licence ODbL) ' +
  "et pnote.eu (statuts à jour + identifiants supplémentaires — avec autorisation de l'auteur). " +
  "Certaines coordonnées dérivées d'OpenStreetMap — licence ODbL.";

// ── Métadonnées des villes ────────────────────────────────────────────────────
// bbox → validation des coordonnées activée pour cette ville
// name only → validation désactivée (incertain ou non nécessaire)

const KNOWN_CITIES = {
  // ── Avec bbox (coordonnées validées) ──────────────────────────────────────
  PA:   { name: 'Paris',            bbox: { minLat: 48.50, maxLat: 49.10, minLng: 1.90,  maxLng: 3.00  } },
  LDN:  { name: 'London',           bbox: { minLat: 51.28, maxLat: 51.70, minLng: -0.55, maxLng: 0.35  } },
  NY:   { name: 'New York',         bbox: { minLat: 40.48, maxLat: 40.93, minLng: -74.3, maxLng: -73.6 } },
  TK:   { name: 'Tokyo',            bbox: { minLat: 35.50, maxLat: 35.85, minLng: 139.4, maxLng: 139.9 } },
  LA:   { name: 'Los Angeles',      bbox: { minLat: 33.70, maxLat: 34.35, minLng: -118.7,maxLng: -117.6} },
  HK:   { name: 'Hong Kong',        bbox: { minLat: 22.15, maxLat: 22.55, minLng: 113.8, maxLng: 114.4 } },
  AIX:  { name: 'Aix-en-Provence',  bbox: { minLat: 43.45, maxLat: 43.65, minLng: 5.30,  maxLng: 5.60  } },
  AMI:  { name: 'Amiens',           bbox: { minLat: 49.83, maxLat: 49.95, minLng: 2.22,  maxLng: 2.35  } },
  AMS:  { name: 'Amsterdam',        bbox: { minLat: 52.28, maxLat: 52.45, minLng: 4.72,  maxLng: 5.10  } },
  ANVR: { name: 'Anvers',           bbox: { minLat: 51.10, maxLat: 51.35, minLng: 4.30,  maxLng: 4.55  } },
  AVI:  { name: 'Avignon',          bbox: { minLat: 43.85, maxLat: 44.05, minLng: 4.75,  maxLng: 4.95  } },
  BGK:  { name: 'Bangkok',          bbox: { minLat: 13.50, maxLat: 14.00, minLng: 100.3, maxLng: 100.8 } },
  BRL:  { name: 'Berlin',           bbox: { minLat: 52.35, maxLat: 52.70, minLng: 13.10, maxLng: 13.80 } },
  BRN:  { name: 'Berne',            bbox: { minLat: 46.85, maxLat: 47.05, minLng: 7.35,  maxLng: 7.60  } },
  BSL:  { name: 'Bâle',             bbox: { minLat: 47.48, maxLat: 47.62, minLng: 7.50,  maxLng: 7.70  } },
  BXL:  { name: 'Bruxelles',        bbox: { minLat: 50.75, maxLat: 50.95, minLng: 4.25,  maxLng: 4.50  } },
  CAZ:  { name: "Côte d'Azur",      bbox: { minLat: 42.95, maxLat: 44.00, minLng:  5.70, maxLng:  7.80 } },
  CCU:  { name: 'Cancún',           bbox: { minLat: 20.85, maxLat: 21.50, minLng: -87.20, maxLng: -86.65} },
  CLR:  { name: 'Clermont-Ferrand', bbox: { minLat: 45.70, maxLat: 45.85, minLng: 3.00,  maxLng: 3.20  } },
  DIJ:  { name: 'Dijon',            bbox: { minLat: 47.25, maxLat: 47.40, minLng: 4.95,  maxLng: 5.15  } },
  DJBA: { name: 'Djerba',           bbox: { minLat: 33.65, maxLat: 33.95, minLng: 10.70, maxLng: 11.00 } },
  FAO:  { name: 'Faro',             bbox: { minLat: 36.95, maxLat: 37.10, minLng: -7.95, maxLng: -7.85 } },
  FKF:  { name: 'Francfort',        bbox: { minLat: 49.80, maxLat: 50.25, minLng:  8.45, maxLng:  8.85 } },
  FTBL: { name: 'Fontainebleau',    bbox: { minLat: 48.15, maxLat: 48.65, minLng:  2.40, maxLng:  3.00 } },
  GNV:  { name: 'Genève',           bbox: { minLat: 46.15, maxLat: 46.30, minLng: 6.05,  maxLng: 6.25  } },
  GRN:  { name: 'Grenoble',         bbox: { minLat: 45.10, maxLat: 45.25, minLng: 5.65,  maxLng: 5.80  } },
  IST:  { name: 'Istanbul',         bbox: { minLat: 40.85, maxLat: 41.25, minLng: 28.60, maxLng: 29.20 } },
  KAT:  { name: 'Katmandu',         bbox: { minLat: 27.60, maxLat: 27.80, minLng: 85.20, maxLng: 85.45 } },
  KLN:  { name: 'Cologne',          bbox: { minLat: 50.80, maxLat: 51.05, minLng: 6.80,  maxLng: 7.10  } },
  LIL:  { name: 'Lille',            bbox: { minLat: 50.55, maxLat: 50.70, minLng: 2.95,  maxLng: 3.15  } },
  LJU:  { name: 'Ljubljana',        bbox: { minLat: 46.00, maxLat: 46.12, minLng: 14.45, maxLng: 14.60 } },
  LSN:  { name: 'Lausanne',         bbox: { minLat: 46.48, maxLat: 46.58, minLng: 6.58,  maxLng: 6.72  } },
  LY:   { name: 'Lyon',             bbox: { minLat: 45.65, maxLat: 45.85, minLng: 4.75,  maxLng: 5.00  } },
  MAN:  { name: 'Manchester',       bbox: { minLat: 53.40, maxLat: 53.55, minLng: -2.35, maxLng: -2.10 } },
  MARS: { name: 'Marseille',        bbox: { minLat: 43.20, maxLat: 43.40, minLng: 5.30,  maxLng: 5.55  } },
  MIA:  { name: 'Miami',            bbox: { minLat: 25.65, maxLat: 25.90, minLng: -80.30,maxLng: -80.10} },
  MLB:  { name: 'Melbourne',        bbox: { minLat: -37.90,maxLat: -37.70,minLng: 144.8, maxLng: 145.1 } },
  MLGA: { name: 'Malaga',           bbox: { minLat: 36.65, maxLat: 36.80, minLng: -4.55, maxLng: -4.35 } },
  MPL:  { name: 'Montpellier',      bbox: { minLat: 43.55, maxLat: 43.70, minLng: 3.80,  maxLng: 3.95  } },
  MRAK: { name: 'Marrakech' },
  MUN:  { name: 'Munich',           bbox: { minLat: 48.05, maxLat: 48.25, minLng: 11.45, maxLng: 11.70 } },
  NIM:  { name: 'Nîmes',            bbox: { minLat: 43.80, maxLat: 43.90, minLng: 4.30,  maxLng: 4.45  } },
  ORLN: { name: 'Orléans',          bbox: { minLat: 47.85, maxLat: 48.00, minLng: 1.80,  maxLng: 1.98  } },
  PAU:  { name: 'Pau',              bbox: { minLat: 43.25, maxLat: 43.35, minLng: -0.45, maxLng: -0.30 } },
  POTI: { name: 'Potosí',           bbox: { minLat: -19.75, maxLat: -19.45, minLng: -65.90, maxLng: -65.65} },
  PRP:  { name: 'Perpignan',        bbox: { minLat: 42.65, maxLat: 42.75, minLng: 2.85,  maxLng: 3.00  } },
  PRT:  { name: 'Perth',            bbox: { minLat: -32.20, maxLat: -31.70, minLng: 115.60, maxLng: 116.05} },
  RBA:  { name: 'Rabat',            bbox: { minLat: 33.90, maxLat: 34.10, minLng: -6.90, maxLng: -6.75 } },
  REUN: { name: 'La Réunion',       bbox: { minLat: -21.40,maxLat: -20.85,minLng: 55.20, maxLng: 55.85 } },
  RN:   { name: 'Rennes',           bbox: { minLat: 47.95, maxLat: 48.20, minLng: -1.85, maxLng: -1.50 } },
  ROM:  { name: 'Rome',             bbox: { minLat: 41.80, maxLat: 41.95, minLng: 12.40, maxLng: 12.60 } },
  RTD:  { name: 'Rotterdam',        bbox: { minLat: 51.85, maxLat: 52.00, minLng: 4.35,  maxLng: 4.55  } },
  SD:   { name: 'San Diego',        bbox: { minLat: 32.60, maxLat: 32.85, minLng: -117.3,maxLng: -117.0} },
  SP:   { name: 'São Paulo',        bbox: { minLat: -23.70,maxLat: -23.45,minLng: -46.80,maxLng: -46.50} },
  TLS:  { name: 'Toulouse',         bbox: { minLat: 43.55, maxLat: 43.70, minLng: 1.35,  maxLng: 1.55  } },
  VRN:  { name: 'Varanasi',         bbox: { minLat: 25.15, maxLat: 25.55, minLng: 82.85, maxLng: 83.20 } },
  WN:   { name: 'Vienne',           bbox: { minLat: 48.15, maxLat: 48.25, minLng: 16.30, maxLng: 16.45 } },
  // ── Noms identifiés, bbox inconnue (pas de validation coords) ─────────────
  ANZR: { name: 'Annecy' },
  BAB:  { name: 'Bab (Algérie)' },
  BBO:  { name: 'Bilbao' },
  BRC:  { name: 'Barcelone' },
  BT:   { name: 'BT' },
  BTA:  { name: 'Bastia' },
  CAPF: { name: 'Cap-Ferret' },
  CHAR: { name: 'Chartres' },
  CON:  { name: 'Constance' },
  DHK:  { name: 'Dhaka' },
  DJN:  { name: 'Daejeon' },
  ELT:  { name: 'Eilat' },
  FRQ:  { name: 'Forcalquier' },
  GRTI: { name: 'GRTI' },
  GRU:  { name: 'Grude' },
  HALM: { name: 'Halmstad' },
  LBR:  { name: 'Luberon' },
  LCT:  { name: 'Lecce' },
  MBSA: { name: 'Mombasa' },
  MEN:  { name: 'Minorque' },
  MTB:  { name: 'Montauban' },
  NA:   { name: 'Nantes' },
  NCL:  { name: 'Newcastle' },
  NOO:  { name: 'Noordwijk' },
  RA:   { name: 'Ravenne' },
  RDU:  { name: 'Raleigh-Durham' },
  SL:   { name: 'Séoul' },
  SPACE:{ name: 'SPACE' },
  VLMO: { name: 'Valmorel' },
  VRS:  { name: 'Versailles' },
  VSB:  { name: 'Visby' },
};

// Villes de notre pipeline effectivement couvertes par invader-spotter
// (intersection : points manquants + photos + statut de secours).
const SPOTTER_CITIES = new Set(Object.keys(KNOWN_CITIES).filter((c) => SPOTTER_SUPPORTED.has(c)));

// Centres géographiques précis (carte + index)
const KNOWN_CENTERS = {
  PA:   { lat: 48.8566, lng: 2.3522   },
  LDN:  { lat: 51.5074, lng: -0.1278  },
  NY:   { lat: 40.7128, lng: -74.0060 },
  TK:   { lat: 35.6762, lng: 139.6503 },
  LA:   { lat: 34.0522, lng: -118.243 },
  HK:   { lat: 22.3193, lng: 114.169  },
  AIX:  { lat: 43.5297, lng: 5.4474   },
  AMI:  { lat: 49.8942, lng: 2.2957   },
  AMS:  { lat: 52.3676, lng: 4.9041   },
  ANVR: { lat: 51.2194, lng: 4.4025   },
  AVI:  { lat: 43.9493, lng: 4.8055   },
  BGK:  { lat: 13.7563, lng: 100.502  },
  BRL:  { lat: 52.5200, lng: 13.4050  },
  BRN:  { lat: 46.9481, lng: 7.4474   },
  BSL:  { lat: 47.5596, lng: 7.5886   },
  BXL:  { lat: 50.8503, lng: 4.3517   },
  CAZ:  { lat: 43.407,  lng:  6.755   },
  CCU:  { lat: 21.164,  lng: -86.765  },
  CLR:  { lat: 45.7772, lng: 3.0870   },
  DIJ:  { lat: 47.3216, lng: 5.0415   },
  DJBA: { lat: 33.8751, lng: 10.8451  },
  FAO:  { lat: 37.0194, lng: -7.9322  },
  FKF:  { lat: 50.115,  lng:   8.682  },
  FTBL: { lat: 48.405,  lng:   2.701  },
  GNV:  { lat: 46.2044, lng: 6.1432   },
  GRN:  { lat: 45.1885, lng: 5.7245   },
  IST:  { lat: 41.0082, lng: 28.9784  },
  KAT:  { lat: 27.7172, lng: 85.3240  },
  KLN:  { lat: 50.9333, lng: 6.9500   },
  LIL:  { lat: 50.6292, lng: 3.0573   },
  LJU:  { lat: 46.0569, lng: 14.5058  },
  LSN:  { lat: 46.5197, lng: 6.6323   },
  LY:   { lat: 45.7640, lng: 4.8357   },
  MAN:  { lat: 53.4808, lng: -2.2426  },
  MARS: { lat: 43.2965, lng: 5.3698   },
  MIA:  { lat: 25.7617, lng: -80.1918 },
  MLB:  { lat: -37.814, lng: 144.963  },
  MLGA: { lat: 36.7213, lng: -4.4214  },
  MPL:  { lat: 43.6117, lng: 3.8777   },
  MRAK: { lat: 31.6295, lng: -7.9811  },
  MUN:  { lat: 48.1351, lng: 11.5820  },
  NIM:  { lat: 43.8367, lng: 4.3601   },
  ORLN: { lat: 47.9029, lng: 1.9092   },
  PAU:  { lat: 43.2951, lng: -0.3708  },
  POTI: { lat: -19.591, lng: -65.752  },
  PRP:  { lat: 42.6887, lng: 2.8948   },
  PRT:  { lat: -31.964, lng: 115.830  },
  RBA:  { lat: 33.9716, lng: -6.8498  },
  REUN: { lat: -20.900, lng: 55.5000  },
  RN:   { lat: 48.111,  lng:  -1.679  },
  ROM:  { lat: 41.9028, lng: 12.4964  },
  RTD:  { lat: 51.9225, lng: 4.4792   },
  SD:   { lat: 32.7157, lng: -117.161 },
  SP:   { lat: -23.550, lng: -46.633  },
  TLS:  { lat: 43.6047, lng: 1.4442   },
  VRN:  { lat: 25.301,  lng:  83.008  },
  WN:   { lat: 48.2082, lng: 16.3738  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStatus(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'ok')        return 'ok';
  if (s === 'destroyed') return 'destroyed';
  if (s === 'hidden')    return 'hidden';
  if (s === 'damaged' || s === 'a little damaged' || s === 'very damaged') return 'damaged';
  return 'unknown';
}

function parseCoord(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function inBbox(lat, lng, bbox) {
  return lat >= bbox.minLat && lat <= bbox.maxLat &&
         lng >= bbox.minLng && lng <= bbox.maxLng;
}

function cityCodeFromId(id) {
  return String(id ?? '').match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() ?? '';
}

// Numéro entier d'un id ("PA_1529" → 1529) — clé d'appariement avec invader-spotter.
function numFromId(id) {
  const m = String(id ?? '').match(/_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// Enrichit une liste d'Invaders (mutée en place) avec les données invader-spotter.
// On ne comble que des trous, jamais on écrase :
//   • points   : rempli seulement si null (goguelnikov reste primaire) + pointsSource
//   • photoUrl : gros plan (URL seule, image jamais téléchargée)
//   • statut   : comble un 'unknown' uniquement (ne régresse pas un 'hidden' pnote)
// Renvoie les compteurs { pts, photos, status }.
function enrichWithSpotter(invaders, spotter) {
  let pts = 0, photos = 0, status = 0;
  if (!spotter) return { pts, photos, status };
  for (const inv of invaders) {
    const s = spotter.get(numFromId(inv.id));
    if (!s) continue;
    if (inv.points == null && s.points != null) {
      inv.points = s.points;
      inv.pointsSource = 'invader-spotter';
      pts++;
    }
    if (!inv.photoUrl && s.grosplan) { inv.photoUrl = s.grosplan; photos++; }
    if (inv.status === 'unknown' && s.status && s.status !== 'unknown') {
      inv.status = s.status;
      status++;
    }
  }
  return { pts, photos, status };
}

function contentHash(invaders) {
  const sorted = [...invaders].sort((a, b) => a.id.localeCompare(b.id));
  const minimal = sorted.map(({ id, city, lat, lng, status, points, hint, instagramUrl, photoUrl }) =>
    ({ id, city, lat, lng, status, points: points ?? null, hint,
       instagramUrl: instagramUrl ?? null, photoUrl: photoUrl ?? null })
  );
  return createHash('sha256').update(JSON.stringify(minimal)).digest('hex').slice(0, 16);
}

function indexHash(cities) {
  const minimal = [...cities]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(({ code, count, version }) => ({ code, count, version }));
  return createHash('sha256').update(JSON.stringify(minimal)).digest('hex').slice(0, 16);
}

function computeCenter(invaders) {
  const valid = invaders.filter(i => typeof i.lat === 'number' && typeof i.lng === 'number');
  if (!valid.length) return { lat: 0, lng: 0 };
  const lat = valid.reduce((s, i) => s + i.lat, 0) / valid.length;
  const lng = valid.reduce((s, i) => s + i.lng, 0) / valid.length;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

// ── Téléchargement ────────────────────────────────────────────────────────────

async function fetchJSON(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const buf  = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const json = JSON.parse(text);
  const arr  = Array.isArray(json) ? json : json.invaders ?? [];
  console.log(`      ${label} : ${arr.length} entrées`);
  return arr;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const bar = '─'.repeat(64);
  console.log(bar);
  console.log('  build_invaders.mjs  (goguelnikov + pnote)');
  console.log(bar);
  console.log('');

  // ── [1/6] Téléchargement des deux sources ─────────────────────────────────
  console.log('[1/6] Téléchargement…');
  const [gogRaw, pnoteRaw] = await Promise.all([
    fetchJSON(GOG_URL,   'goguelnikov'),
    fetchJSON(PNOTE_URL, 'pnote      '),
  ]);

  // Enrichissement invader-spotter (une seule passe par ville couverte, en lot).
  // Fournit d'un coup : points manquants + photos (gros plan) + statut de secours.
  // Robustesse : tout échec est attrapé → on continue sans enrichir cette ville.
  // SPOTTER_CACHE=<fichier.json> permet de rejouer un scrape sans retaper le serveur.
  // SKIP_SPOTTER=1 désactive complètement l'enrichissement.
  const spotterByCity = new Map();   // code → Map<num, {points,status,grosplan,...}>
  if (process.env.SKIP_SPOTTER) {
    console.log('      invader-spotter : ignoré (SKIP_SPOTTER)');
  } else if (process.env.SPOTTER_CACHE) {
    // Cache multi-villes : { CODE: { num: entry } }
    try {
      const raw = JSON.parse(readFileSync(process.env.SPOTTER_CACHE, 'utf8'));
      for (const [code, obj] of Object.entries(raw)) {
        spotterByCity.set(code, new Map(Object.entries(obj).map(([k, v]) => [parseInt(k, 10), v])));
      }
      console.log(`      invader-spotter (cache) : ${spotterByCity.size} villes`);
    } catch (e) {
      console.warn(`      ⚠ cache spotter illisible (${e.message}) — enrichissement ignoré`);
    }
  } else {
    console.log(`      invader-spotter : scraping ${SPOTTER_CITIES.size} villes (plusieurs minutes)…`);
    let done = 0, failed = 0;
    for (const code of SPOTTER_CITIES) {
      try {
        spotterByCity.set(code, await fetchSpotterCity(code));
      } catch (e) {
        failed++;
        console.warn(`\n      ⚠ spotter ${code} indisponible (${e.message})`);
      }
      done++;
      process.stdout.write(`\r      spotter: ${done}/${SPOTTER_CITIES.size} villes traitées (${failed} échecs)   `);
      await new Promise((r) => setTimeout(r, 600));   // politesse : espace les villes
    }
    console.log('');
    // Cache optionnel : rejouer un run sans retaper le serveur (SPOTTER_CACHE=<ce fichier>).
    if (process.env.SPOTTER_DUMP && spotterByCity.size) {
      const obj = {};
      for (const [code, m] of spotterByCity) obj[code] = Object.fromEntries(m);
      writeFileSync(process.env.SPOTTER_DUMP, JSON.stringify(obj));
      console.log(`      cache spotter écrit → ${process.env.SPOTTER_DUMP}`);
    }
  }

  // Fil d'actualité invader-spotter (une seule page, indépendant du scrape des villes
  // → récupéré même en mode cache). Échec = on conserve le fil précédent.
  let spotterNews = null;
  if (!process.env.SKIP_SPOTTER) {
    try {
      spotterNews = await fetchSpotterNews();
      console.log(`      invader-spotter news : ${spotterNews.length} événements`);
    } catch (e) {
      console.warn(`      ⚠ news invader-spotter indisponible (${e.message}) — fil précédent conservé`);
    }
  }

  // ── [2/6] Groupement goguelnikov par ville ────────────────────────────────
  console.log('\n[2/6] Groupement par ville…');
  const gogByCity = new Map();
  for (const entry of gogRaw) {
    const code = String(entry.city ?? '').trim().toUpperCase();
    if (!code) continue;
    if (!gogByCity.has(code)) gogByCity.set(code, []);
    gogByCity.get(code).push(entry);
  }

  // Groupement pnote par ville (depuis le préfixe d'id)
  const pnoteByCity = new Map(); // code → Map<id, {status,instagramUrl,hint,obf_lat,obf_lng}>
  for (const e of pnoteRaw) {
    const id   = String(e.id ?? '').trim();
    const code = cityCodeFromId(id);
    if (!id || !code) continue;
    if (!pnoteByCity.has(code)) pnoteByCity.set(code, new Map());
    pnoteByCity.get(code).set(id, {
      id,
      status:       normalizeStatus(e.status),
      instagramUrl: String(e.instagramUrl ?? '').trim() || null,
      hint:         e.hint ? String(e.hint).trim() : '',
      obf_lat:      typeof e.obf_lat === 'number' ? e.obf_lat : null,
      obf_lng:      typeof e.obf_lng === 'number' ? e.obf_lng : null,
    });
  }

  // Union des codes (gog ∪ pnote)
  const allCodes = new Set([...gogByCity.keys(), ...pnoteByCity.keys()]);
  const sortedCodes = [...allCodes].sort();
  console.log(`      ${gogByCity.size} villes goguelnikov, ${pnoteByCity.size} villes pnote`);
  console.log(`      ${allCodes.size} villes au total`);

  // ── [3/6] État précédent ──────────────────────────────────────────────────
  console.log('\n[3/6] État précédent…');
  let prevIndex = null;
  if (existsSync(INDEX_FILE)) {
    try {
      prevIndex = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
      console.log(`      index.json : v${prevIndex.version}, ${prevIndex.cities?.length ?? 0} villes`);
    } catch { console.warn('      index.json illisible — repart de zéro'); }
  } else {
    console.log('      Pas d\'index existant — première génération');
  }
  const prevIndexVersion = typeof prevIndex?.version === 'number' ? prevIndex.version : 0;

  // Historique d'événements (news) existant
  let prevNews = null;
  if (existsSync(NEWS_FILE)) {
    try {
      prevNews = JSON.parse(readFileSync(NEWS_FILE, 'utf8'));
      console.log(`      news.json : v${prevNews.version ?? '?'}, ${prevNews.events?.length ?? 0} événements`);
    } catch { console.warn('      news.json illisible — repart de zéro'); }
  } else {
    console.log('      Pas de news.json existant — première génération');
  }

  // ── [4/6] Extras ──────────────────────────────────────────────────────────
  console.log('\n[4/6] Extras…');
  const extrasPA = new Map();
  if (existsSync(EXTRAS_FILE)) {
    try {
      const extrasRaw   = JSON.parse(readFileSync(EXTRAS_FILE, 'utf8'));
      const allEntries  = extrasRaw.invaders ?? [];
      const disabledCnt = allEntries.filter(e => e.disabled).length;
      const active      = allEntries.filter(e => !e.disabled);
      let skipped = 0;
      for (const e of active) {
        if (!e.id || typeof e.lat !== 'number' || typeof e.lng !== 'number') { skipped++; continue; }
        if (KNOWN_CITIES.PA?.bbox && !inBbox(e.lat, e.lng, KNOWN_CITIES.PA.bbox)) { skipped++; continue; }
        extrasPA.set(String(e.id), {
          id:           String(e.id),
          city:         'PA',
          lat:          e.lat,
          lng:          e.lng,
          status:       normalizeStatus(e.status),
          points:       Math.max(0, parseInt(String(e.points ?? 0), 10) || 0),
          hint:         String(e.hint ?? '').trim(),
          instagramUrl:    String(e.instagramUrl ?? '').trim() || null,
          source:          String(e.source ?? 'extras'),
          statusFromPnote: false,
        });
      }
      console.log(`      ${extrasPA.size} extras valides, ${skipped} ignorées, ${disabledCnt} désactivées`);
    } catch (e) { console.warn('      ⚠ Extras illisibles :', e.message); }
  } else {
    console.log('      Fichier extras absent');
  }

  // ── [5/6] Traitement par ville ────────────────────────────────────────────
  console.log('\n[5/6] Traitement par ville…');
  const today      = new Date().toISOString().slice(0, 10);
  const indexCities = [];

  // Compteurs globaux pour le résumé
  let gTotal = 0, gGog = 0, gPnote = 0, gExtras = 0;
  let gInstagram = 0, gNullPoints = 0, gDivergences = 0;
  let gStatusFromPnote = 0, gDestroyedToOk = 0;
  let gPtsFilled = 0, gPhotos = 0, gStatusFilled = 0;   // enrichissement invader-spotter
  let paTotal = 0, paGog = 0, paPnote = 0, paExtras = 0;

  for (const code of sortedCodes) {
    const gogEntries   = gogByCity.get(code)   ?? [];
    const pnoteForCity = pnoteByCity.get(code) ?? new Map();
    const meta         = KNOWN_CITIES[code]    ?? null;
    const outFile      = join(DATA_DIR, `invaders_${code}.json`);

    process.stdout.write(`  ${code.padEnd(6)} `);

    // ── Base goguelnikov ───────────────────────────────────────────────────
    const baseInvaders = [];
    const baseIds      = new Set();
    let cityDivergences = 0, cityDestroyedToOk = 0;

    for (const entry of gogEntries) {
      const lat = parseCoord(entry.lat);
      const lng = parseCoord(entry.lng);
      if (lat === null || lng === null) continue;
      if (meta?.bbox && !inBbox(lat, lng, meta.bbox)) continue;

      const id              = String(entry.id);
      const gogStatus       = normalizeStatus(entry.status);
      const pnoteEntry      = pnoteForCity.get(id);
      const useStatus       = pnoteEntry ? pnoteEntry.status : gogStatus;
      const statusFromPnote = pnoteEntry != null;

      if (statusFromPnote && pnoteEntry.status !== gogStatus) {
        cityDivergences++;
        if (gogStatus === 'destroyed' && pnoteEntry.status === 'ok') cityDestroyedToOk++;
      }

      baseInvaders.push({
        id,
        city:            code,
        lat,
        lng,
        status:          useStatus,                     // pnote prioritaire si disponible
        points:          parseInt(String(entry.points), 10) || 0,
        hint:            String(entry.hint ?? '').trim(),
        instagramUrl:    pnoteEntry?.instagramUrl ?? null,
        source:          'goguelnikov',
        statusFromPnote,
      });
      baseIds.add(id);
    }
    baseInvaders.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    // ── Version précédente par ville ──────────────────────────────────────
    let prevVersion   = 1;
    let prevBaseCount = 0;
    let prevHash      = '';
    let prevInvaders  = null; // null = pas d'état précédent → baseline, pas d'événement « ajout »
    if (existsSync(outFile)) {
      try {
        const prev   = JSON.parse(readFileSync(outFile, 'utf8'));
        prevVersion   = typeof prev.version    === 'number' ? prev.version    : 1;
        prevBaseCount = typeof prev._baseCount === 'number' ? prev._baseCount : 0;
        prevHash      = contentHash(prev.invaders ?? []);
        prevInvaders  = Array.isArray(prev.invaders) ? prev.invaders : [];
      } catch { /* ignore */ }
    }

    // ── Garde-fou : chute brutale de la base goguelnikov ─────────────────
    if (prevBaseCount > 0 && gogEntries.length > 0) {
      const loss = (prevBaseCount - baseInvaders.length) / prevBaseCount;
      if (loss > MAX_LOSS_PCT) {
        console.log(`⚠  SKIP — chute base ${prevBaseCount}→${baseInvaders.length} (−${(loss*100).toFixed(1)}%)`);
        // On conserve les données précédentes, MAIS photos/points sont indépendants
        // du drop de la base : on enrichit quand même l'existant (sinon une baisse
        // temporaire de goguelnikov priverait la ville de ses photos).
        let idxEntry = prevIndex?.cities?.find(c => c.code === code);
        if (prevInvaders?.length) {
          const e = enrichWithSpotter(prevInvaders, spotterByCity.get(code));
          gPtsFilled += e.pts; gPhotos += e.photos; gStatusFilled += e.status;
          const nh = contentHash(prevInvaders);
          if (nh !== prevHash) {
            const nv = prevVersion + 1;
            writeFileSync(outFile, JSON.stringify({
              version: nv, updatedAt: today, city: code,
              attribution: SOURCE_ATTRIBUTION, _baseCount: prevBaseCount,
              invaders: prevInvaders,
            }, null, 2), 'utf8');
            if (idxEntry) idxEntry = { ...idxEntry, version: nv };
            console.log(`         ↳ conservé mais enrichi : +${e.photos} photos, +${e.pts} pts (v${nv})`);
          }
        }
        if (idxEntry) indexCities.push(idxEntry);
        continue;
      }
    }

    // ── Ajout des ids pnote-only ──────────────────────────────────────────
    const pnoteOnlyInvaders = [];
    for (const [id, pe] of pnoteForCity) {
      if (baseIds.has(id)) continue;
      if (pe.obf_lat === null || pe.obf_lng === null) continue;
      pnoteOnlyInvaders.push({
        id,
        city:         code,
        lat:          pe.obf_lat,
        lng:          pe.obf_lng,
        status:       pe.status,
        points:       null,                   // inconnu
        hint:         pe.hint || '',
        instagramUrl:    pe.instagramUrl,
        source:          'pnote',
        statusFromPnote: true,
      });
    }
    pnoteOnlyInvaders.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    let enriched = [...baseInvaders, ...pnoteOnlyInvaders]
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    if (enriched.length === 0) {
      console.log('⚠  SKIP — aucun Invader valide');
      const prevCity = prevIndex?.cities?.find(c => c.code === code);
      if (prevCity) indexCities.push(prevCity);
      continue;
    }

    // ── Fusion extras (PA uniquement) ─────────────────────────────────────
    let extrasAdded = 0, extrasOverridden = 0;
    let finalInvaders = enriched;
    if (code === 'PA' && extrasPA.size > 0) {
      const merged = new Map(enriched.map(i => [i.id, i]));
      for (const [id, extra] of extrasPA) {
        merged.has(id) ? extrasOverridden++ : extrasAdded++;
        merged.set(id, extra);
      }
      finalInvaders = [...merged.values()]
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    }

    // ── Enrichissement invader-spotter ────────────────────────────────────
    // Appliqué APRÈS les extras (qui restent prioritaires) : ne comble que des trous.
    {
      const e = enrichWithSpotter(finalInvaders, spotterByCity.get(code));
      gPtsFilled += e.pts; gPhotos += e.photos; gStatusFilled += e.status;
    }

    // ── Hash + écriture si modifié ────────────────────────────────────────
    const newHash    = contentHash(finalInvaders);
    const changed    = newHash !== prevHash;
    const newVersion = changed ? prevVersion + 1 : prevVersion;

    if (changed) {
      writeFileSync(outFile, JSON.stringify({
        version:     newVersion,
        updatedAt:   today,
        city:        code,
        attribution: SOURCE_ATTRIBUTION,
        _baseCount:  baseInvaders.length,
        invaders:    finalInvaders,
      }, null, 2), 'utf8');
    }

    // ── Compteurs ─────────────────────────────────────────────────────────
    const withIg       = finalInvaders.filter(i => i.instagramUrl).length;
    const withNullPts  = finalInvaders.filter(i => i.points === null).length;
    gTotal       += finalInvaders.length;
    gGog         += baseInvaders.length;
    gPnote       += pnoteOnlyInvaders.length;
    gExtras      += extrasAdded;
    gInstagram   += withIg;
    gNullPoints  += withNullPts;
    gDivergences     += cityDivergences;
    gDestroyedToOk   += cityDestroyedToOk;
    gStatusFromPnote += finalInvaders.filter(i => i.statusFromPnote).length;
    if (code === 'PA') {
      paTotal  = finalInvaders.length; paGog  = baseInvaders.length;
      paPnote  = pnoteOnlyInvaders.length; paExtras = extrasAdded;
    }

    // ── Centre ────────────────────────────────────────────────────────────
    const cityCenter = KNOWN_CENTERS[code] ?? computeCenter(finalInvaders);

    indexCities.push({
      code,
      name:    meta?.name ?? code,
      count:   finalInvaders.length,
      version: newVersion,
      center:  cityCenter,
      ...(meta?.bbox ? { bbox: meta.bbox } : {}),
    });

    const parts = [`${baseInvaders.length} gog`];
    if (pnoteOnlyInvaders.length) parts.push(`+${pnoteOnlyInvaders.length} pnote`);
    if (extrasAdded)              parts.push(`+${extrasAdded} extras`);
    if (cityDivergences)          parts.push(`~${cityDivergences}⚡`);
    const flag = changed ? `✓ v${newVersion}` : `— v${newVersion}`;
    console.log(`${String(finalInvaders.length).padStart(5)} (${parts.join(', ')})  ${flag}  ${meta?.name ?? '?'}`);
  }

  // ── [6/7] Index ───────────────────────────────────────────────────────────
  console.log('\n[6/7] Index…');
  const prevIndexHash  = prevIndex?.cities ? indexHash(prevIndex.cities) : '';
  const newIndexHash   = indexHash(indexCities);
  const indexChanged   = newIndexHash !== prevIndexHash;
  const newIndexVersion = indexChanged ? prevIndexVersion + 1 : prevIndexVersion;

  writeFileSync(INDEX_FILE, JSON.stringify({
    version:   newIndexVersion,
    updatedAt: today,
    cities:    indexCities,
  }, null, 2), 'utf8');

  const indexFlag = indexChanged ? `✓ v${newIndexVersion}` : `— v${newIndexVersion}`;
  console.log(`      index.json ${indexFlag}, ${indexCities.length} villes`);

  // ── [7/7] News (fil invader-spotter) ───────────────────────────────────────
  console.log('\n[7/7] News…');
  const prevEvents = Array.isArray(prevNews?.events) ? prevNews.events : [];

  // Fenêtre temporelle : on ne garde que les événements des N derniers mois.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - NEWS_MAX_MONTHS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let events;
  if (spotterNews) {
    // Source = fil curé d'invader-spotter. Chaque run récupère le fil complet
    // → dédup (type|id|date) + fenêtre + tri anté-chrono + plafond.
    const seen = new Set();
    events = spotterNews
      .filter(e => e.date && e.date >= cutoffStr)
      .filter(e => { const k = `${e.type}|${e.id}|${e.date}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (events.length > NEWS_MAX_EVENTS) events = events.slice(0, NEWS_MAX_EVENTS);
  } else {
    // Récupération impossible → on conserve le fil précédent tel quel.
    events = prevEvents;
  }

  const prevNewsVersion = typeof prevNews?.version === 'number' ? prevNews.version : 0;
  const newsChanged     = JSON.stringify(events) !== JSON.stringify(prevEvents);
  const newsVersion     = newsChanged ? prevNewsVersion + 1 : prevNewsVersion;

  if (newsChanged) {
    writeFileSync(NEWS_FILE, JSON.stringify({
      version:     newsVersion,
      updatedAt:   today,
      attribution: SOURCE_ATTRIBUTION,
      source:      'invader-spotter.art',
      events,
    }, null, 2), 'utf8');
  }

  const byType   = events.reduce((a, e) => { a[e.type] = (a[e.type] || 0) + 1; return a; }, {});
  const newsFlag = newsChanged ? `✓ v${newsVersion}` : `— v${newsVersion}`;
  const breakdown = Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(', ') || '—';
  console.log(`      news.json ${newsFlag}, ${events.length} événements (${breakdown})`);

  // ── Résumé ────────────────────────────────────────────────────────────────
  const bar2 = '═'.repeat(64);
  console.log('\n' + bar2);
  console.log('  RÉSUMÉ GLOBAL');
  console.log(bar2);
  console.log(`  Base goguelnikov      : ${String(gGog).padStart(6)} Invaders`);
  console.log(`  Ajouts pnote-only     : ${String(gPnote).padStart(6)} Invaders (coords obfusquées)`);
  console.log(`  Ajouts extras         : ${String(gExtras).padStart(6)} Invaders`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  TOTAL                 : ${String(gTotal).padStart(6)} Invaders`);
  console.log('');
  console.log(`  Avec instagramUrl     : ${String(gInstagram).padStart(6)} / ${gTotal} (${(gInstagram/gTotal*100).toFixed(1)} %)`);
  console.log(`  Points inconnus (null): ${String(gNullPoints).padStart(6)}  (pnote-only)`);
  console.log(`  Statuts repris de pnote    : ${String(gStatusFromPnote).padStart(6)}`);
  console.log(`    dont différents de gog   : ${String(gDivergences).padStart(6)}  (dont destroyed→ok : ${gDestroyedToOk})`);
  console.log('');
  console.log(`  ── Enrichissement invader-spotter ─────────`);
  console.log(`  Points comblés (null→valeur): ${String(gPtsFilled).padStart(6)}`);
  console.log(`  Points encore inconnus      : ${String(gNullPoints).padStart(6)}`);
  console.log(`  Photos (photoUrl) ajoutées  : ${String(gPhotos).padStart(6)}`);
  console.log(`  Statuts 'unknown' comblés   : ${String(gStatusFilled).padStart(6)}`);
  console.log('');
  console.log(`  Événements news (spotter)  : ${String(events.length).padStart(6)}`);
  console.log('');
  console.log(`  ── Paris ─────────────────────────────────`);
  console.log(`  Base gog              : ${paGog}`);
  console.log(`  Ajouts pnote          : +${paPnote}  (PA_${paGog + 1}…PA_${paGog + paPnote})`);
  console.log(`  Extras                : +${paExtras}`);
  console.log(`  Total Paris           : ${paTotal}  (était 1 528)`);
  console.log(bar2);
}

main().catch(err => {
  console.error('\n✗ ERREUR :', err.message);
  process.exit(1);
});
