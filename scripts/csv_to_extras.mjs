#!/usr/bin/env node
/**
 * scripts/csv_to_extras.mjs
 *
 * Convertit un CSV de positions Invaders vers data/invaders_extras.json.
 * Les nouvelles entrées sont ajoutées ; les entrées existantes sont mises à jour.
 *
 * Usage :
 *   node scripts/csv_to_extras.mjs data/incoming/mon_fichier.csv [--source=pnote]
 *
 * Format CSV attendu (en-tête obligatoire) :
 *   id,lat,lng,hint           ← colonnes minimales
 *   id,lat,lng,hint,status,points  ← colonnes optionnelles
 *
 * Valeurs par défaut appliquées si la colonne est absente :
 *   status → "unknown"  (on ne connaît pas l'état sans vérification in situ)
 *   points → 10         (minimum du barème, à corriger à la main si besoin)
 *
 * Ce script alimente UNIQUEMENT invaders_extras.json.
 * Il ne touche pas à build_invaders.mjs ni à la base goguelnikov.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath }                            from 'url';
import { join, dirname, basename }                  from 'path';

// ── Configuration ─────────────────────────────────────────────────────────────

const __dir      = dirname(fileURLToPath(import.meta.url));
const EXTRAS     = join(__dir, '..', 'data', 'invaders_extras.json');

/** Bbox Île-de-France — doit rester cohérente avec build_invaders.mjs. */
const BBOX = { minLat: 48.50, maxLat: 49.10, minLng: 1.90, maxLng: 3.00 };

const DEFAULT_STATUS = 'ok';
const DEFAULT_POINTS = 10;

const VALID_STATUSES = new Set(['ok', 'damaged', 'destroyed', 'hidden', 'unknown']);

// ── Parsing des arguments CLI ─────────────────────────────────────────────────

const cliArgs  = process.argv.slice(2);
const csvPath  = cliArgs.find(a => !a.startsWith('--'));
const sourceArg = (cliArgs.find(a => a.startsWith('--source=')) ?? '--source=extras').slice(9);

if (!csvPath) {
  console.error('Usage : node scripts/csv_to_extras.mjs <fichier.csv> [--source=pnote]');
  console.error('Exemple : node scripts/csv_to_extras.mjs data/incoming/pnote.csv --source=pnote');
  process.exit(1);
}

if (!existsSync(csvPath)) {
  console.error(`✗ Fichier introuvable : ${csvPath}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse une ligne CSV en respectant les guillemets. */
function parseCsvLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Convertit une coordonnée avec virgule OU point décimal en nombre. */
function parseCoord(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function inBbox(lat, lng) {
  return lat >= BBOX.minLat && lat <= BBOX.maxLat &&
         lng >= BBOX.minLng && lng <= BBOX.maxLng;
}

/** Normalise les statuts — mêmes règles que build_invaders.mjs. */
function normalizeStatus(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'ok')        return 'ok';
  if (s === 'destroyed') return 'destroyed';
  if (s === 'hidden')    return 'hidden';
  if (s === 'damaged' || s === 'a little damaged' || s === 'very damaged') return 'damaged';
  if (VALID_STATUSES.has(s)) return s;
  return DEFAULT_STATUS;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const bar = '─'.repeat(62);
  console.log(bar);
  console.log('  csv_to_extras.mjs');
  console.log(bar);
  console.log('Fichier CSV :', csvPath);
  console.log('Source      :', sourceArg);
  console.log('Extras      :', EXTRAS);
  console.log('');

  // ── [1/3] Lecture et parsing du CSV ────────────────────────────────────────
  console.log('[1/3] Lecture du CSV…');

  const rawText = readFileSync(csvPath, 'utf8')
    .replace(/^﻿/, '')     // supprime le BOM UTF-8 si présent
    .replace(/\r\n/g, '\n')     // normalise les fins de ligne Windows
    .replace(/\r/g, '\n');

  const lines = rawText.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) {
    console.error('✗ Le fichier CSV est vide ou ne contient que l\'en-tête.');
    process.exit(1);
  }

  // En-tête (première ligne)
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const col = name => headers.indexOf(name);

  // Colonnes obligatoires
  if (col('id') === -1 || col('lat') === -1 || col('lng') === -1) {
    console.error(`✗ Colonnes obligatoires manquantes dans l'en-tête.`);
    console.error(`  En-tête trouvé : ${headers.join(', ')}`);
    console.error(`  Colonnes requises : id, lat, lng`);
    process.exit(1);
  }

  const dataLines = lines.slice(1);
  console.log(`      ${dataLines.length} ligne(s) de données détectées`);
  console.log(`      Colonnes : ${headers.join(', ')}`);
  if (col('status') === -1) console.log(`      → status absent : valeur par défaut "${DEFAULT_STATUS}"`);
  if (col('points') === -1) console.log(`      → points absent : valeur par défaut ${DEFAULT_POINTS}`);

  // ── [2/3] Validation et conversion ─────────────────────────────────────────
  console.log('\n[2/3] Validation + conversion…');

  const converted = [];   // entrées valides prêtes à fusionner
  const rejections = [];  // { lineNum, reason }

  for (let i = 0; i < dataLines.length; i++) {
    const lineNum = i + 2; // +2 : 1-indexé + en-tête
    const line    = dataLines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue; // ignore vides et commentaires

    const values = parseCsvLine(line);
    const get    = name => (col(name) !== -1 ? values[col(name)] ?? '' : '');

    const rawId  = get('id').trim();
    const rawLat = get('lat');
    const rawLng = get('lng');

    // Validation de l'id
    if (!rawId) {
      rejections.push({ lineNum, reason: 'id vide' });
      console.warn(`      ⚠ Ligne ${lineNum} ignorée : id vide`);
      continue;
    }
    if (!/^PA_\w+$/.test(rawId)) {
      rejections.push({ lineNum, reason: `id "${rawId}" — format invalide (attendu PA_XXXX)` });
      console.warn(`      ⚠ Ligne ${lineNum} ignorée : id "${rawId}" ne correspond pas au format PA_XXXX`);
      continue;
    }

    // Validation des coordonnées
    const lat = parseCoord(rawLat);
    const lng = parseCoord(rawLng);
    if (lat === null || lng === null) {
      rejections.push({ lineNum, reason: `coordonnées illisibles (lat="${rawLat}", lng="${rawLng}")` });
      console.warn(`      ⚠ Ligne ${lineNum} ignorée : coordonnées illisibles — lat="${rawLat}", lng="${rawLng}"`);
      continue;
    }
    if (!inBbox(lat, lng)) {
      rejections.push({ lineNum, reason: `coordonnées hors bbox Île-de-France (lat=${lat}, lng=${lng})` });
      console.warn(`      ⚠ Ligne ${lineNum} ignorée : ${rawId} hors bbox (lat=${lat}, lng=${lng})`);
      continue;
    }

    // Points : doit être un entier dans le barème
    const rawPoints = get('points');
    let points = rawPoints ? parseInt(rawPoints, 10) : DEFAULT_POINTS;
    if (isNaN(points) || points <= 0) points = DEFAULT_POINTS;

    converted.push({
      id:     rawId,
      city:   'PA',
      lat,
      lng,
      status: normalizeStatus(get('status') || DEFAULT_STATUS),
      points,
      hint:   get('hint').trim(),
      source: sourceArg,
    });
  }

  console.log(`      ${converted.length} entrée(s) valide(s), ${rejections.length} rejetée(s)`);

  if (converted.length === 0) {
    console.log('\n⚠ Aucune entrée valide. invaders_extras.json non modifié.');
    printSummary(bar, dataLines.length, 0, 0, rejections);
    return;
  }

  // ── [3/3] Fusion dans invaders_extras.json ──────────────────────────────────
  console.log('\n[3/3] Fusion dans invaders_extras.json…');

  // Chargement du fichier existant
  let extrasJson;
  if (existsSync(EXTRAS)) {
    try {
      extrasJson = JSON.parse(readFileSync(EXTRAS, 'utf8'));
    } catch (e) {
      console.error('✗ Impossible de lire invaders_extras.json :', e.message);
      process.exit(1);
    }
  } else {
    // Si le fichier n'existe pas encore, on en crée un minimal
    extrasJson = { invaders: [] };
  }

  const existingInvaders = extrasJson.invaders ?? [];

  // Index des entrées existantes par id (on ignore les champs _comment et disabled)
  const indexById = new Map(
    existingInvaders.map((entry, i) => [entry.id, i])
  );

  let added   = 0;
  let updated = 0;

  for (const entry of converted) {
    if (indexById.has(entry.id)) {
      // Mise à jour : remplace l'entrée existante (supprime disabled si présent)
      const idx = indexById.get(entry.id);
      const prev = existingInvaders[idx];
      existingInvaders[idx] = entry;
      if (prev.disabled) {
        console.log(`      ~ ${entry.id} : mis à jour et activé (était désactivé)`);
      } else {
        console.log(`      ~ ${entry.id} : mis à jour`);
      }
      updated++;
    } else {
      // Ajout
      existingInvaders.push(entry);
      indexById.set(entry.id, existingInvaders.length - 1);
      console.log(`      + ${entry.id} : ajouté`);
      added++;
    }
  }

  // Réécriture du fichier en préservant _readme et les autres clés
  extrasJson.invaders = existingInvaders;
  writeFileSync(EXTRAS, JSON.stringify(extrasJson, null, 2), 'utf8');

  printSummary(bar, dataLines.length, added, updated, rejections);

  console.log(`\n✓ invaders_extras.json mis à jour.`);
  console.log(`\n  Prochaines étapes :`);
  console.log(`  1. node scripts/build_invaders.mjs      ← intègre les extras dans invaders.json`);
  console.log(`  2. git add data/invaders_extras.json data/invaders.json`);
  console.log(`  3. git commit -m "extras: import ${basename(csvPath)} (${sourceArg})"`);
  console.log(`  4. git push`);
}

function printSummary(bar, total, added, updated, rejections) {
  console.log('\n' + bar);
  console.log('  RÉSUMÉ');
  console.log(bar);
  console.log(`  Lignes lues       : ${total}`);
  console.log(`  Ajoutées          : ${added}`);
  console.log(`  Mises à jour      : ${updated}`);
  console.log(`  Rejetées          : ${rejections.length}`);
  if (rejections.length > 0) {
    console.log('  Détail rejets :');
    for (const { lineNum, reason } of rejections) {
      console.log(`    - Ligne ${lineNum} : ${reason}`);
    }
  }
  console.log(bar);
}

main();
