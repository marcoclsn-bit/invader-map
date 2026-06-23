#!/usr/bin/env node
/**
 * scripts/build_invaders.mjs
 *
 * Télécharge la source goguelnikov/SpaceInvaders, la fusionne avec
 * data/invaders_extras.json (ajouts/corrections manuels), valide et
 * produit data/invaders.json (le fichier servi en remote par l'app).
 *
 * Usage (manuel) :
 *   node scripts/build_invaders.mjs
 *
 * Usage (GitHub Action) : même commande — le workflow commit le fichier
 * si et seulement si git détecte un changement.
 *
 * Règle de fusion : si un id est dans les deux sources → extras gagne.
 * Un id présent seulement dans extras → ajouté au total.
 *
 * Garde-fous (le script ÉCHOUE et N'ÉCRIT PAS si) :
 *   - La source distante est inaccessible ou produit un JSON invalide
 *   - Des coordonnées de la base tombent hors de la bbox Île-de-France
 *   - Le nombre d'Invaders de la BASE (hors extras) chute de > 10 %
 *     (les extras sont exclues de ce calcul — elles ne masquent pas une régression)
 *
 * Extras invalides → avertissement dans les logs, ignorées sans planter.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash }                               from 'crypto';
import { fileURLToPath }                            from 'url';
import { join, dirname }                            from 'path';

// ── Configuration ─────────────────────────────────────────────────────────────

/** URL de la source communautaire. Changer si le fichier source évolue. */
const SOURCE_URL =
  'https://raw.githubusercontent.com/goguelnikov/SpaceInvaders/main/world_space_invaders_V05.json';

const __dir       = dirname(fileURLToPath(import.meta.url));
const OUTPUT      = join(__dir, '..', 'data', 'invaders.json');
const EXTRAS_FILE = join(__dir, '..', 'data', 'invaders_extras.json');

/** Bbox Île-de-France — couvre Paris + banlieue immédiate (Invaders codés PA). */
const BBOX = { minLat: 48.50, maxLat: 49.10, minLng: 1.90, maxLng: 3.00 };

/** Perte maximale tolérée sur la BASE goguelnikov entre deux runs. */
const MAX_LOSS_PCT = 0.10;

const SOURCE_ATTRIBUTION =
  'Données issues de goguelnikov/SpaceInvaders (communauté Space Invader hunters). ' +
  "Certaines coordonnées dérivées d'OpenStreetMap — licence ODbL.";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalisation des statuts source → notre format
//   OK / ok                          → 'ok'
//   damaged / a little damaged / very damaged → 'damaged'
//   destroyed                        → 'destroyed'
//   hidden                           → 'hidden'
//   unknown / tout le reste          → 'unknown'
function normalizeStatus(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'ok')        return 'ok';
  if (s === 'destroyed') return 'destroyed';
  if (s === 'hidden')    return 'hidden';
  if (s === 'damaged' || s === 'a little damaged' || s === 'very damaged') return 'damaged';
  return 'unknown';
}

// La source goguelnikov utilise la virgule comme séparateur décimal.
function parseCoord(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function inBbox(lat, lng) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lng >= BBOX.minLng && lng <= BBOX.maxLng;
}

// Hash uniquement sur les champs visibles par l'utilisateur — exclut 'source'
// pour ne pas déclencher une fausse nouvelle version quand seule la métadonnée change.
function contentHash(invaders) {
  const sorted = [...invaders].sort((a, b) => a.id.localeCompare(b.id));
  const minimal = sorted.map(({ id, city, lat, lng, status, points, hint }) =>
    ({ id, city, lat, lng, status, points, hint })
  );
  return createHash('sha256').update(JSON.stringify(minimal)).digest('hex').slice(0, 16);
}

// Validation de la base goguelnikov (erreurs fatales).
function validateBase(baseInvaders, previousBaseCount) {
  if (!Array.isArray(baseInvaders) || baseInvaders.length === 0) {
    throw new Error('La base goguelnikov est vide après filtrage — source probablement invalide.');
  }
  // Bbox : toutes les coordonnées de la base doivent être dans l'Île-de-France
  const outOfBbox = baseInvaders.filter(inv => !inBbox(inv.lat, inv.lng));
  if (outOfBbox.length > 0) {
    const sample = outOfBbox.slice(0, 5).map(i => `${i.id}(${i.lat},${i.lng})`).join(', ');
    throw new Error(
      `${outOfBbox.length} Invader(s) de la base hors bbox : ${sample}. ` +
      'Vérifie le parsing des coordonnées ou ajuste BBOX.'
    );
  }
  // Chute brutale vs version précédente (sur la base uniquement, hors extras)
  if (previousBaseCount > 0) {
    const loss = (previousBaseCount - baseInvaders.length) / previousBaseCount;
    if (loss > MAX_LOSS_PCT) {
      throw new Error(
        `Chute brutale de la base : ${previousBaseCount} → ${baseInvaders.length} ` +
        `(−${(loss * 100).toFixed(1)} %, seuil ${MAX_LOSS_PCT * 100} %). ` +
        'Source suspecte — mise à jour refusée. Vérifie goguelnikov manuellement.'
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
  console.log('Source  :', SOURCE_URL);
  console.log('Extras  :', existsSync(EXTRAS_FILE) ? EXTRAS_FILE : '(absent)');
  console.log('Sortie  :', OUTPUT);
  console.log('');

  // ── [1/5] Téléchargement ──────────────────────────────────────────────────
  console.log('[1/5] Téléchargement de la source…');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Échec HTTP ${res.status} — ${SOURCE_URL}`);

  // La source utilise un BOM UTF-8 — décodage explicite
  const buf  = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const raw  = JSON.parse(text);
  console.log(`      ${raw.length} entrées reçues (toutes villes)`);

  // ── [2/5] Base goguelnikov : filtrage Paris + normalisation ───────────────
  console.log('\n[2/5] Filtrage city="PA" + normalisation (base goguelnikov)…');
  const baseInvaders = raw
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
        source: 'goguelnikov',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  const byStatus = {};
  for (const inv of baseInvaders) byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
  console.log(`      ${baseInvaders.length} Invaders Paris`);
  console.log('      Statuts :', Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', '));

  // ── [3/5] Lecture du fichier précédent ───────────────────────────────────
  console.log('\n[3/5] Comparaison avec la version précédente…');
  let previousVersion   = 1;
  let previousBaseCount = 0;   // entrées goguelnikov uniquement (hors extras)
  let previousHash      = '';

  if (existsSync(OUTPUT)) {
    try {
      const existing     = JSON.parse(readFileSync(OUTPUT, 'utf8'));
      previousVersion    = typeof existing.version === 'number' ? existing.version : 1;
      const prevInvaders = existing.invaders ?? [];
      // Les anciennes versions (sans champ source) sont toutes considérées goguelnikov
      previousBaseCount  = prevInvaders.filter(i => !i.source || i.source === 'goguelnikov').length;
      previousHash       = contentHash(prevInvaders);
      console.log(`      Fichier existant : v${previousVersion}, ${prevInvaders.length} Invaders`);
      console.log(`      dont base goguelnikov : ${previousBaseCount}`);
    } catch (e) {
      console.warn('      Fichier existant illisible :', e.message, '— on repart de v1');
    }
  } else {
    console.log('      Pas de fichier existant — première génération');
  }

  // ── [4/5] Validation base + fusion extras ────────────────────────────────
  console.log('\n[4/5] Validation de la base + fusion des extras…');
  validateBase(baseInvaders, previousBaseCount);
  console.log('      ✓ Base goguelnikov valide (bbox OK, pas de chute suspecte)');

  // Fusion : on part d'une Map pour permettre aux extras d'écraser la base
  const mergedMap = new Map(baseInvaders.map(inv => [inv.id, inv]));
  let extraAdded      = 0;
  let extraOverridden = 0;
  let extraSkipped    = 0;
  let extraDisabled   = 0;

  if (existsSync(EXTRAS_FILE)) {
    let extrasRaw;
    try {
      extrasRaw = JSON.parse(readFileSync(EXTRAS_FILE, 'utf8'));
    } catch (e) {
      console.warn('      ⚠ Impossible de lire invaders_extras.json :', e.message, '— ignoré');
      extrasRaw = { invaders: [] };
    }

    const allEntries = extrasRaw.invaders ?? [];
    extraDisabled    = allEntries.filter(e => e.disabled).length;
    const entries    = allEntries.filter(e => !e.disabled);

    for (const entry of entries) {
      // Validation souple : avertissement sans faire planter le script
      if (!entry.id) {
        console.warn('      ⚠ Extra ignoré : champ "id" manquant —', JSON.stringify(entry).slice(0, 60));
        extraSkipped++;
        continue;
      }
      if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') {
        console.warn(`      ⚠ Extra ${entry.id} ignoré : lat/lng doivent être des nombres (pas des strings).`);
        extraSkipped++;
        continue;
      }
      if (!inBbox(entry.lat, entry.lng)) {
        console.warn(`      ⚠ Extra ${entry.id} ignoré : coordonnées hors bbox Île-de-France (lat=${entry.lat}, lng=${entry.lng}).`);
        extraSkipped++;
        continue;
      }

      const normalized = {
        id:     String(entry.id),
        city:   String(entry.city ?? 'PA'),
        lat:    entry.lat,
        lng:    entry.lng,
        status: normalizeStatus(entry.status),
        points: Math.max(0, parseInt(String(entry.points ?? 0), 10) || 0),
        hint:   String(entry.hint ?? '').trim(),
        source: String(entry.source ?? 'extras'),
      };

      if (mergedMap.has(entry.id)) {
        extraOverridden++;
      } else {
        extraAdded++;
      }
      mergedMap.set(entry.id, normalized);
    }

    if (extraDisabled > 0 || entries.length > 0) {
      console.log(`      Extras : ${extraDisabled} exemple(s) désactivé(s) ignorés`);
    }
    if (entries.length > 0) {
      console.log(`      Extras actives : +${extraAdded} ajouts, ~${extraOverridden} surcharge(s), ${extraSkipped} ignorée(s)`);
    } else {
      console.log('      Extras actives : aucune (toutes désactivées ou fichier vide)');
    }
  } else {
    console.log('      Extras : fichier absent, ignoré');
  }

  // Tableau final fusionné, trié par id
  const finalInvaders = [...mergedMap.values()]
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // ── Comparaison de contenu ────────────────────────────────────────────────
  const newHash    = contentHash(finalInvaders);
  const hasChanged = newHash !== previousHash;
  const newVersion = hasChanged ? previousVersion + 1 : previousVersion;

  // ── Résumé ────────────────────────────────────────────────────────────────
  console.log('\n' + bar);
  console.log('  RÉSUMÉ');
  console.log(bar);
  console.log(`  Base goguelnikov  : ${baseInvaders.length} Invaders`);
  console.log(`  Extras appliquées : +${extraAdded} ajouts, ~${extraOverridden} surcharge(s)`);
  console.log(`  Total final       : ${finalInvaders.length} Invaders`);
  if (previousBaseCount > 0) {
    const delta = baseInvaders.length - previousBaseCount;
    console.log(`  Variation base    : ${delta >= 0 ? '+' : ''}${delta} vs version précédente`);
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

  // ── Écriture ──────────────────────────────────────────────────────────────
  const today  = new Date().toISOString().slice(0, 10);
  const output = {
    version:     newVersion,
    updatedAt:   today,
    source:      SOURCE_URL,
    attribution: SOURCE_ATTRIBUTION,
    invaders:    finalInvaders,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n✓ Fichier écrit : ${OUTPUT}`);
  console.log(`  Version ${newVersion} — ${today} — ${finalInvaders.length} Invaders Paris`);
}

main().catch(err => {
  console.error('\n✗ ERREUR :', err.message);
  process.exit(1);
});
