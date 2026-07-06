#!/usr/bin/env node
/**
 * scripts/fetch_spotter.mjs
 *
 * Récupère les données invader-spotter.art (autorisation de l'auteur).
 *
 * Le site n'expose aucun flux JSON : on interroge le formulaire de recherche
 * (listing.php) qui liste les mosaïques d'une ville avec, par Invader :
 *   - id + valeur en points   (<b>PA_17 [10 pts]</b>)
 *   - dernier état connu       (icône spot_invader_ok/degraded/destroyed.png)
 *   - photo « gros plan »       (grosplan/PA/PA_0017-grosplan.png, zéro-paddée à 4)
 *   - photos réelles datées     (photos/PA/PA_0017-mai2018.jpg)
 *
 * Contraintes serveur (reverse-engineerées) :
 *   - En-tête Referer same-site OBLIGATOIRE (sinon page "erreur").
 *   - Filtre ville = cocher toutes les cases d'arrondissement (PA01…PA20, 77, 92-95).
 *   - Pagination : 50 résultats/page, renvoyer TOUS les params + page=N à chaque appel.
 *   - Total lisible dans « N mosaïques correspondent ».
 *
 * Sobriété : throttle entre chaque page, une seule passe par run, en lot (pas par
 * Invader). Robustesse : toute erreur réseau/HTTP fait remonter une exception que
 * l'appelant attrape pour conserver les données précédentes.
 *
 * Export : fetchSpotterCity(cityCode) -> Map<number, {
 *   points, status, grosplan, latestPhoto, photoCount
 * }>  (clé = numéro entier de l'Invader, ex. 17 pour PA_17)
 */

const BASE     = 'https://www.invader-spotter.art';
const LISTING  = `${BASE}/listing.php`;
const REFERER  = `${BASE}/cherche.php`;
const PAGE_SIZE = 50;
const THROTTLE_MS = 1200;              // délai entre deux pages (sobriété serveur)
const MAX_PAGES   = 200;               // garde-fou anti-boucle
const UA = 'InvaderMap-databot/1.0 (+contact marchenri.colson@gmail.com; authorized by invader-spotter.art)';

// Paris = cas spécial : le filtre ville passe par les cases d'arrondissement.
const PA_ARRONDISSEMENTS = [
  'PA01','PA02','PA03','PA04','PA05','PA06','PA07','PA08','PA09','PA10',
  'PA11','PA12','PA13','PA14','PA15','PA16','PA17','PA18','PA19','PA20',
  'PA77','PA92','PA93','PA94','PA95',
];

// Villes couvertes par invader-spotter : une case à cocher = un code ville.
// Liste extraite du formulaire cherche.php (87 villes + Paris).
export const SPOTTER_SUPPORTED = new Set([
  'PA',
  'SPACE','BRL','FKF','KLN','MUN','MLB','PRT','WN','DHK','ANVR','BXL','CHAR','RDU',
  'BT','POTI','GRU','SP','HK','DJN','SL','BRC','BBO','MLGA','MEN','LA','MIA','NY',
  'SD','AIX','AMI','AVI','BTA','BAB','CAPF','CLR','CON','CAZ','DIJ','FTBL','FRQ',
  'GRN','LCT','REUN','LIL','LBR','LY','MARS','MTB','MPL','NA','NIM','ORLN','PAU',
  'PRP','RN','TLS','VLMO','VRS','LDN','MAN','NCL','VRN','ELT','RA','ROM','TK','MBSA',
  'MRAK','RBA','CCU','KAT','AMS','NOO','RTD','FAO','LJU','HALM','VSB','ANZR','BSL',
  'BRN','GNV','LSN','GRTI','BGK','DJBA','IST',
]);

// Cases « ville » du formulaire pour un code donné.
function cityBoxes(code) {
  return code === 'PA' ? PA_ARRONDISSEMENTS : [code];
}

const STATUS_ICON = {
  ok: 'ok', degraded: 'damaged', destroyed: 'destroyed',
  hidden: 'hidden', neutre: 'hidden',   // « Non visible » sur invader-spotter
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseParams(cityCode) {
  if (!SPOTTER_SUPPORTED.has(cityCode)) {
    throw new Error(`Ville non couverte par invader-spotter : ${cityCode}`);
  }
  const p = { toutetat: 'on', toutvale: 'on' };
  for (const b of cityBoxes(cityCode)) p[b] = 'on';
  return p;
}

const REQUEST_TIMEOUT_MS = 30000;      // abandon d'une page trop lente
const MAX_ATTEMPTS = 3;                // + réessais avec backoff (robustesse run long)

async function postPage(cityCode, page, attempt = 1) {
  const params = { ...baseParams(cityCode), page: String(page) };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(LISTING, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': REFERER,
        'User-Agent': UA,
      },
      body: new URLSearchParams(params).toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur listing.php page ${page}`);
    return await res.text();
  } catch (e) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(2000 * attempt);
      return postPage(cityCode, page, attempt + 1);
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
}

function totalCount(html) {
  const m = html.match(/(\d+)\s*mosa&iuml;ques?\s+correspon/i);
  return m ? parseInt(m[1], 10) : null;
}

// Parse une page de listing → tableau d'entrées Invader.
export function parseListing(html) {
  const out = [];
  const blocks = html.split(/<td align="left" rowspan="2"/i).slice(1);
  for (const block of blocks) {
    const mId = block.match(/<b>([A-Z]+)_(\d+)\s*\[([^\]]*)\]<\/b>/i);
    if (!mId) continue;
    const city   = mId[1].toUpperCase();
    const num    = parseInt(mId[2], 10);
    const mPts   = mId[3].match(/(\d+)\s*pts/i);
    const points = mPts ? parseInt(mPts[1], 10) : null;

    const mStatus = block.match(/spot_invader_([a-z]+)\.png/i);
    const status  = mStatus ? (STATUS_ICON[mStatus[1].toLowerCase()] ?? 'unknown') : 'unknown';

    const mGros    = block.match(/src=["'](grosplan\/[A-Z]+\/[A-Z]+_\d+-grosplan\.[a-z]+)/i);
    const grosplan = mGros ? `${BASE}/${mGros[1]}` : null;

    const photos = [...block.matchAll(/href=["'](photos\/[A-Z]+\/[A-Z]+_\d+-[^"']+\.(?:jpg|jpeg|png))["']/gi)]
      .map((m) => `${BASE}/${m[1]}`);

    out.push({
      city, num, id: `${city}_${num}`, points, status,
      grosplan,
      latestPhoto: photos[photos.length - 1] ?? null,
      photoCount:  photos.length,
    });
  }
  return out;
}

/**
 * Récupère toute une ville. Renvoie Map<num, {points,status,grosplan,latestPhoto,photoCount}>.
 * onProgress(page, totalPages, rows) optionnel pour le log.
 */
export async function fetchSpotterCity(cityCode, onProgress, attempt = 1) {
  const first = await postPage(cityCode, 1);
  const total = totalCount(first);

  // Page « erreur » (HTTP 200 mais sans compteur de résultats) : réponse invalide,
  // fréquente sous rafale. On réessaie la ville plutôt que de renvoyer 0 en silence.
  if (total == null) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(2500 * attempt);
      return fetchSpotterCity(cityCode, onProgress, attempt + 1);
    }
    throw new Error(`réponse invalide (pas de compteur) pour ${cityCode}`);
  }

  const pages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);

  const byNum = new Map();
  const ingest = (html) => {
    for (const e of parseListing(html)) {
      if (!byNum.has(e.num)) byNum.set(e.num, e);
    }
  };

  ingest(first);
  onProgress?.(1, pages, byNum.size, total);

  for (let p = 2; p <= pages; p++) {
    await sleep(THROTTLE_MS);
    const html = await postPage(cityCode, p);
    ingest(html);
    onProgress?.(p, pages, byNum.size, total);
  }
  return byNum;
}

// ── Fil d'actualité (news.php) ─────────────────────────────────────────────────
// Page HTML : blocs par mois (id='moisAAAAMM'), lignes <p class='news'><b>JJ :</b> …
// avec les Invaders en <a>ID</a>. Une ligne peut contenir plusieurs événements ;
// chaque ID prend le verbe (Ajout/Destruction/Dégradation/Réactivation/…) qui le
// précède. On mappe vers les types d'événements de l'app.

const NEWS_URL = `${BASE}/news.php`;

// Verbes invader-spotter → types d'événement de l'app. Le texte est normalisé en
// ASCII sans accent avant test (les entités HTML accentuées sont converties).
const NEWS_VERBS = [
  [/reactiv/i,                       'reactivated'],
  [/degrad/i,                        'damaged'],
  [/destruc|detru/i,                 'destroyed'],
  [/ajout|nouvea|apparition/i,       'added'],
  [/mise\s*a\s*jour|statut|deplac|renov|restaur/i, 'updated'],
];

// Retire les balises et convertit les entités accentuées en ASCII (é→e, à→a, …).
function normalizeText(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(eacute|egrave|ecirc|euml);/gi, 'e')
    .replace(/&(agrave|acirc);/gi, 'a')
    .replace(/&(icirc|iuml);/gi, 'i')
    .replace(/&ocirc;/gi, 'o')
    .replace(/&(ucirc|ugrave);/gi, 'u')
    .replace(/&ccedil;/gi, 'c')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

function verbFor(text) {
  for (const [re, type] of NEWS_VERBS) if (re.test(text)) return type;
  return null;
}

// Parse une ligne : renvoie les événements {type, id, city} dans l'ordre.
function parseNewsEntry(inner, date) {
  const out = [];
  const idRe = /<a[^>]*>\s*([A-Z]+_\d+)\s*<\/a>/g;
  let lastVerb = null, lastIdx = 0, m;
  while ((m = idRe.exec(inner))) {
    const seg = normalizeText(inner.slice(lastIdx, m.index));
    const v = verbFor(seg);
    if (v) lastVerb = v;
    lastIdx = idRe.lastIndex;
    if (!lastVerb) continue;
    const id = m[1];
    const city = id.match(/^([A-Z]+)_/)[1];
    out.push({ type: lastVerb, id, city, date });
  }
  return out;
}

export function parseNews(html) {
  const events = [];
  const monthRe = /id=['"]mois(\d{4})(\d{2})['"]\s*>([\s\S]*?)<\/div>/g;
  let mm;
  while ((mm = monthRe.exec(html))) {
    const [, year, month, body] = mm;
    const pRe = /<p[^>]*class=['"]news['"][^>]*>\s*<b>\s*(\d+)\s*:?\s*<\/b>([\s\S]*?)<\/p>/g;
    let p;
    while ((p = pRe.exec(body))) {
      const day = String(p[1]).padStart(2, '0');
      events.push(...parseNewsEntry(p[2], `${year}-${month}-${day}`));
    }
  }
  return events;
}

// Récupère et parse le fil d'actualité. Throw en cas d'échec (l'appelant garde l'ancien).
export async function fetchSpotterNews() {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(NEWS_URL, {
      headers: { 'Referer': REFERER, 'User-Agent': UA },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} sur news.php`);
    return parseNews(await res.text());
  } finally {
    clearTimeout(to);
  }
}
