#!/usr/bin/env node
/**
 * scripts/build_invaders.mjs
 *
 * Télécharge la source communautaire goguelnikov/SpaceInvaders,
 * filtre les Invaders de Paris, normalise et valide les données,
 * puis produit data/invaders.json (le fichier servi en remote par le repo).
 *
 * Usage (manuel) :
 *   node scripts/build_invaders.mjs
 *
 * Usage (GitHub Action) : même commande — le workflow commit le fichier
 * si et seulement si git détecte un changement.
 *
 * Garde-fous — le script ÉCHOUE (exit 1) et N'ÉCRIT PAS si :
 *   - La source est inaccessible ou le JSON est invalide
 *   - Des coordonnées tombent hors de la bbox Paris plausible
 *   - Le nombre d'Invaders chute de plus de MAX_LOSS_PCT vs la version précédente
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash }                               from 'crypto';
import { fileURLToPath }                            from 'url';
import { join, dirname }                            from 'path';

// ── Configuration ─────────────────────────────────────────────────────────────

/** URL du fichier source. Changer ici si le repo ou le fichier évolue. */
const SOURCE_URL =
  'https://raw.githubusercontent.com/goguelnikov/SpaceInvaders/main/world_space_invaders_V05.json';

/** Fichier de sortie (relatif à la racine du projet). */
const __dir      = dirname(fileURLToPath(import.meta.url));
const OUTPUT     = join(__dir, '..', 'data', 'invaders.json');

/** Bbox Île-de-France plausible — couvre Paris + banlieue immédiate (PA-codés). */
const BBOX = { minLat: 48.50, maxLat: 49.10, minLng: 1.90, maxLng: 3.00 };

/**
 * Perte maximale tolérée entre deux versions.
 * Si le nombre d'Invaders baisse de plus de 10 %, on suspecte une source cassée.
 */
const MAX_LOSS_PCT = 0.10;

const SOURCE_ATTRIBUTION =
  'Données issues de goguelnikov/SpaceInvaders (communauté Space Invader hunters). ' +
  "Certaines coordonnées dérivées d'OpenStreetMap — licence ODbL.";

// ── Normalisation des statuts ─────────────────────────────────────────────────
//
// Source → notre format
//   "OK"                → "ok"
//   "damaged"           → "damaged"
//   "a little damaged"  → "damaged"   (variante de la source)
//   "very damaged"      → "damaged"   (variante de la source)
//   "destroyed"         → "destroyed"
//   "hidden"            → "hidden"    (conservé : l'Invader est masqué / privé)
//   "unknown" ou autre  → "unknown"

function normalizeStatus(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'ok')                          return 'ok';
  if (s === 'destroyed')                   return 'destroyed';
  if (s === 'hidden')                      return 'hidden';
  if (s === 'damaged'   ||
      s === 'a little damaged' ||
      s === 'very damaged')               return 'damaged';
  return 'unknown';
}

// ── Parsing des coordonnées ───────────────────────────────────────────────────
// La source utilise la virgule comme séparateur décimal (locale française).

function parseCoord(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function inBbox(lat, lng) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lng >= BBOX.minLng && lng <= BBOX.maxLng;
}

// ── Empreinte du contenu ──────────────────────────────────────────────────────
// Permet de détecter si les données ont réellement changé entre deux runs,
// indépendamment de la version ou de la date.

function contentHash(invaders) {
  const sorted = [...invaders].sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(invaders, previousCount) {
  if (!Array.isArray(invaders) || invaders.length === 0) {
    throw new Error('Tableau d\'Invaders vide après filtrage — source probablement invalide.');
  }

  // Bbox : toutes les coordonnées doivent être dans Paris
  const outOfBbox = invaders.filter(inv => !inBbox(inv.lat, inv.lng));
  if (outOfBbox.length > 0) {
    const sample = outOfBbox.slice(0, 5).map(i => `${i.id}(${i.lat},${i.lng})`).join(', ');
    throw new Error(
      `${outOfBbox.length} Invader(s) hors de la bbox Paris : ${sample}. ` +
      'Vérifie le parsing des coordonnées ou la bbox.'
    );
  }

  // Perte brutale : uniquement si on a un historique
  if (previousCount > 0) {
    const loss = (previousCount - invaders.length) / previousCount;
    if (loss > MAX_LOSS_PCT) {
      throw new Error(
        `Chute brutale du nombre d'Invaders : ${previousCount} → ${invaders.length} ` +
        `(−${(loss * 100).toFixed(1)} %, seuil ${MAX_LOSS_PCT * 100} %). ` +
        'Source suspecte — mise à jour refusée. Vérifie la source manuellement.'
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const bar = '─'.repeat(62);
  console.log(bar);
  console.log('  build_invaders.mjs');
  console.log(bar);
  console.log('Source :', SOURCE_URL);
  console.log('Sortie :', OUTPUT);
  console.log('');

  // 1. Téléchargement
  console.log('[1/4] Téléchargement de la source…');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Échec HTTP ${res.status} — ${SOURCE_URL}`);

  // La source utilise un BOM UTF-8 ; on décode proprement via ArrayBuffer
  const buf  = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const raw  = JSON.parse(text);
  console.log(`      ${raw.length} entrées reçues (toutes villes)`);

  // 2. Filtrage Paris + normalisation
  console.log('\n[2/4] Filtrage city="PA" + normalisation…');
  const invaders = raw
    .filter(entry => entry.city === 'PA')
    .map(entry => {
      const lat = parseCoord(entry.lat);
      const lng = parseCoord(entry.lng);
      if (lat === null || lng === null) {
        throw new Error(`Coordonnées invalides pour ${entry.id} : lat="${entry.lat}" lng="${entry.lng}"`);
      }
      return {
        id:     String(entry.id),
        city:   String(entry.city),
        lat,
        lng,
        status: normalizeStatus(entry.status),
        points: parseInt(String(entry.points), 10) || 0,
        hint:   String(entry.hint ?? '').trim(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  console.log(`      ${invaders.length} Invaders Paris retenus`);

  // Distribution des statuts
  const byStatus = {};
  for (const inv of invaders) byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
  console.log('      Statuts :', Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', '));

  // 3. Lecture du fichier existant (pour la comparaison)
  console.log('\n[3/4] Comparaison avec la version précédente…');
  let previousVersion = 1;   // version embarquée dans l'app (data/invaders.js)
  let previousCount   = 0;
  let previousHash    = '';

  if (existsSync(OUTPUT)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT, 'utf8'));
      previousVersion = typeof existing.version === 'number' ? existing.version : 1;
      previousCount   = Array.isArray(existing.invaders) ? existing.invaders.length : 0;
      previousHash    = contentHash(existing.invaders ?? []);
      console.log(`      Fichier existant : v${previousVersion}, ${previousCount} Invaders`);
    } catch (e) {
      console.warn('      Fichier existant illisible :', e.message, '— on repart de v1');
    }
  } else {
    console.log('      Pas de fichier existant — première génération');
  }

  // 4. Validation
  console.log('\n[4/4] Validation…');
  validate(invaders, previousCount);
  console.log('      ✓ Bbox OK, pas de chute suspecte');

  const newHash    = contentHash(invaders);
  const hasChanged = newHash !== previousHash;
  const newVersion = hasChanged ? previousVersion + 1 : previousVersion;

  // Résumé
  console.log('\n' + bar);
  console.log('  RÉSUMÉ');
  console.log(bar);
  console.log(`  Total Paris       : ${invaders.length} Invaders`);
  if (previousCount > 0) {
    const delta = invaders.length - previousCount;
    console.log(`  Précédent         : ${previousCount} Invaders`);
    console.log(`  Variation         : ${delta >= 0 ? '+' : ''}${delta}`);
  }
  console.log(`  Contenu modifié   : ${hasChanged ? 'OUI' : 'NON'}`);
  if (hasChanged) {
    console.log(`  Version           : ${previousVersion} → ${newVersion}`);
  } else {
    console.log(`  Version           : ${previousVersion} (inchangée)`);
  }
  console.log(bar);

  if (!hasChanged) {
    console.log('\n✓ Données inchangées. Aucun fichier écrit.');
    return;
  }

  // Écriture du JSON versionné
  const today = new Date().toISOString().slice(0, 10);
  const output = {
    version:     newVersion,
    updatedAt:   today,
    source:      SOURCE_URL,
    attribution: SOURCE_ATTRIBUTION,
    invaders,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✓ Fichier écrit : ${OUTPUT}`);
  console.log(`  Version ${newVersion} — ${today} — ${invaders.length} Invaders Paris`);
  console.log(`\n  DATA_URL à configurer dans services/invaderData.js :`);
  console.log(`  https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data/invaders.json`);
}

main().catch(err => {
  console.error('\n✗ ERREUR :', err.message);
  process.exit(1);
});
