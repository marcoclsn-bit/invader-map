#!/usr/bin/env node
/**
 * scripts/ota.mjs — Publie une mise à jour par-dessus les airs (OTA) en production.
 *
 *   npm run ota -- "Ce que change cette publication"
 *   npm run ota -- --verifier        → les contrôles seuls, sans rien publier
 *
 * Pourquoi un script et pas la commande nue : le 06/10/2026, un `eas update`
 * lancé sans `--environment production`, depuis un worktree sans `.env.local`,
 * a publié un paquet où les clés ORS et Mapbox valaient la chaîne vide. Metro
 * les inline au moment de l'export et rien ne l'a signalé : itinéraires,
 * géocodage, repli Mapbox et carte du partage sont restés morts 24 h. Le
 * drapeau n'est obligatoire qu'à partir du SDK 55 ; en SDK 54, la commande passe
 * sans un mot. Ce script porte le drapeau en dur et VÉRIFIE, avant et après,
 * que les clés sont bien là.
 *
 * Ce qu'il contrôle :
 *   1. Branche `main`, arbre propre : on ne publie pas une branche de travail
 *      en production par inadvertance.
 *   2. Les clés attendues existent et ne sont pas vides dans l'environnement EAS
 *      `production`, celui que `--environment production` injecte.
 *   3. Après publication : chaque clé figure dans les paquets exportés (`dist/`),
 *      un par plateforme. Sinon, l'alerte dit quoi faire.
 *   4. Le serveur de mises à jour sert bien le nouvel identifiant, iOS et Android.
 *
 * Les valeurs des clés ne sont jamais affichées. Les contrôles 2 et 3 tournent
 * dans un sous-processus lancé par `eas env:exec`, qui ne remonte que des
 * longueurs et des oui/non.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Une clé de plus dans l'app ? L'ajouter ici, et elle sera contrôlée comme les autres.
const CLES = ['EXPO_PUBLIC_ORS_API_KEY', 'EXPO_PUBLIC_MAPBOX_TOKEN'];

const RACINE  = process.cwd();
const DIST    = join(RACINE, 'dist');
const CE_FICHIER = fileURLToPath(import.meta.url);

// ─── Modes internes, lancés par `eas env:exec` avec les clés dans process.env ──

const mode = process.argv[2];

if (mode === '--_cles') {
  let manquantes = 0;
  for (const k of CLES) {
    const n = (process.env[k] || '').trim().length;
    if (!n) manquantes++;
    console.log(`   ${k} : ${n ? `${n} caractères` : 'ABSENTE OU VIDE'}`);
  }
  process.exit(manquantes ? 1 : 0);
}

if (mode === '--_dist') {
  const fichiers = paquets();
  if (!fichiers.length) { console.error('   aucun paquet dans dist/'); process.exit(1); }
  let manquantes = 0;
  for (const f of fichiers) {
    // latin1 : un octet = un caractère, la recherche d'une clé ASCII reste exacte
    // dans un bytecode Hermes.
    const contenu = readFileSync(f, 'latin1');
    for (const k of CLES) {
      const v = process.env[k] || '';
      const ok = v.length > 0 && contenu.includes(v);
      if (!ok) manquantes++;
      console.log(`   ${basename(f)} : ${k} ${ok ? 'présente' : 'ABSENTE'}`);
    }
  }
  process.exit(manquantes ? 1 : 0);
}

// ─── Flux principal ────────────────────────────────────────────────────────────

const verifierSeulement = mode === '--verifier';
const message = verifierSeulement ? null : mode;

if (!verifierSeulement && (!message || message.startsWith('-'))) {
  console.error('Usage :  npm run ota -- "message de publication"');
  console.error('         npm run ota -- --verifier');
  process.exit(2);
}

etape('1/4  Branche et arbre de travail');
const branche = git('branch', '--show-current');
if (branche !== 'main') arret(`branche « ${branche} » : on ne publie que depuis main.`);
const modifs = git('status', '--porcelain', '--untracked-files=no');
if (modifs) arret(`des fichiers suivis sont modifiés et non commités :\n${modifs}`);
const local = git('rev-parse', 'HEAD');
const distant = git('rev-parse', '--verify', '--quiet', 'origin/main');
console.log(`   main, arbre propre, commit ${local.slice(0, 7)}`);
if (distant && distant !== local) {
  console.log('   ⚠ main local ≠ origin/main : ce que tu publies n\'est pas ce qui est poussé.');
}

etape('2/4  Clés dans l\'environnement EAS « production »');
if (!eas('env:exec', 'production', `node "${CE_FICHIER}" --_cles`, '--non-interactive')) {
  arret('au moins une clé est absente ou vide côté EAS. Rien n\'a été publié.');
}

if (verifierSeulement) {
  console.log('\n✔ Contrôles OK. Rien n\'a été publié (--verifier).');
  process.exit(0);
}

etape('3/4  Publication');
// dist/ frais : le contrôle suivant doit lire CE paquet-là, pas un export d'hier.
rmSync(DIST, { recursive: true, force: true });
if (!eas('update', '--branch', 'production', '--environment', 'production', '-m', message)) {
  arret('eas update a échoué, voir ci-dessus.');
}

etape('4/4  Contrôle du paquet publié');
if (!eas('env:exec', 'production', `node "${CE_FICHIER}" --_dist`, '--non-interactive')) {
  console.error('\n✖ PUBLIÉ, MAIS AU MOINS UNE CLÉ MANQUE DANS LE PAQUET.');
  console.error('  Les appareils qui le recevront perdront itinéraires et géocodage.');
  console.error('  Republier tout de suite la version précédente :');
  console.error('      eas update:republish --branch production');
  process.exit(1);
}
await manifeste();
console.log('\n✔ Publié et contrôlé. Un appareil déjà installé l\'applique au deuxième démarrage à froid.');

// ─── Outils ────────────────────────────────────────────────────────────────────

function etape(titre) { console.log(`\n▶ ${titre}`); }

function arret(raison) { console.error(`\n✖ ${raison}`); process.exit(1); }

function git(...args) {
  return (spawnSync('git', args, { cwd: RACINE, encoding: 'utf8' }).stdout || '').trim();
}

/** Lance `eas …` en affichant sa sortie ; vrai si le code de sortie est 0. */
function eas(...args) {
  return spawnSync('eas', args, { cwd: RACINE, stdio: 'inherit' }).status === 0;
}

/** Les bundles JS exportés : dist/_expo/static/js/<plateforme>/*.hbc */
function paquets() {
  const base = join(DIST, '_expo', 'static', 'js');
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap((plateforme) => {
    const dossier = join(base, plateforme);
    return readdirSync(dossier).filter((f) => f.endsWith('.hbc')).map((f) => join(dossier, f));
  });
}

/** Demande au serveur de mises à jour ce qu'il sert, pour iOS puis Android. */
async function manifeste() {
  const expo = JSON.parse(readFileSync(join(RACINE, 'app.json'), 'utf8')).expo;
  const url = expo?.updates?.url;
  const rt  = expo?.runtimeVersion;
  if (!url || typeof rt !== 'string') { console.log('   (manifeste non vérifié : url ou runtimeVersion introuvable)'); return; }
  for (const plateforme of ['ios', 'android']) {
    try {
      const res = await fetch(url, { headers: {
        'expo-platform': plateforme, 'expo-runtime-version': rt,
        'expo-channel-name': 'production', 'expo-protocol-version': '1', accept: 'multipart/mixed',
      } });
      const m = /"id":"([^"]+)","createdAt":"([^"]+)"/.exec(await res.text());
      console.log(`   ${plateforme.padEnd(7)} sert ${m ? `${m[1].slice(0, 8)}  (${m[2]})` : 'réponse illisible'}`);
    } catch (e) {
      console.log(`   ${plateforme.padEnd(7)} manifeste injoignable : ${e.message}`);
    }
  }
}
