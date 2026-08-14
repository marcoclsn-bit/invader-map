import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Récupération de la galerie d'un joueur FlashInvaders, en LECTURE SEULE.
 *
 * L'UID est un identifiant PORTEUR : quiconque le détient peut lire le compte.
 * Il ne quitte donc jamais l'appareil autrement que vers l'interface officielle,
 * n'est jamais journalisé, et n'entre dans AUCUN événement de mesure. On ne
 * mesure que des comptes.
 *
 * On ne lit jamais l'adresse électronique ni le pseudonyme renvoyés par le
 * profil : ils ne servent à rien ici, autant ne pas les manipuler.
 *
 * Interface non documentée et non officielle : elle peut changer ou fermer sans
 * préavis. Tout appel doit donc échouer proprement, et l'import manuel reste le
 * chemin principal.
 */

const BASE = 'https://api.space-invaders.com/flashinvaders_v3_pas_trop_predictif/api';
const CLE_UID = '@invader_fi_uid';
const DELAI_MS = 15000;

// Format attendu : 8-4-4-4-12 hexadécimal. Vérifié AVANT tout appel réseau,
// pour dire « ce n'est pas un UID » plutôt que « le serveur ne répond pas ».
const FORME = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export const uidValide = (uid) => FORME.test(String(uid || '').trim());

export class ErreurFlash extends Error {
  constructor(motif) { super(motif); this.motif = motif; }
}

export async function getUid() {
  try { return await AsyncStorage.getItem(CLE_UID); } catch { return null; }
}
export async function setUid(uid) {
  try { await AsyncStorage.setItem(CLE_UID, String(uid).trim()); } catch { /* sans effet */ }
}
export async function oublierUid() {
  try { await AsyncStorage.removeItem(CLE_UID); } catch { /* sans effet */ }
}

/**
 * Rend { ids, villes, total } où `ids` est la liste des identifiants flashés.
 * Lève une ErreurFlash dont le motif vaut 'forme', 'inconnu', 'reseau' ou 'vide'.
 */
export async function recupererGalerie(uid) {
  const propre = String(uid || '').trim();
  if (!uidValide(propre)) throw new ErreurFlash('forme');

  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
  let json;
  try {
    const res = await fetch(`${BASE}/gallery?uid=${encodeURIComponent(propre)}`, { signal: ctrl.signal });
    if (!res.ok) throw new ErreurFlash('reseau');
    json = await res.json();
  } catch (e) {
    throw e instanceof ErreurFlash ? e : new ErreurFlash('reseau');
  } finally {
    clearTimeout(minuteur);
  }

  // Un UID inconnu répond 200 avec un code négatif, jamais une erreur HTTP.
  if (json?.code !== 0 && json?.code !== '0') throw new ErreurFlash('inconnu');

  const brut = json?.invaders;
  const ids = brut && typeof brut === 'object' && !Array.isArray(brut)
    ? Object.keys(brut)
    : Array.isArray(brut) ? brut.map((x) => x?.name).filter(Boolean) : [];
  if (!ids.length) throw new ErreurFlash('vide');

  return {
    ids,
    villes: Array.isArray(json.cities) ? json.cities.length : null,
    total: Number(json.total_si_count) || null,
  };
}
