/**
 * cities/registry.js
 *
 * Construit dynamiquement la liste des villes à partir de data/index.json.
 * Ajouter une nouvelle ville = mettre à jour index.json + déposer invaders_CODE.json.
 *
 * OVERRIDES : champs non présents dans l'index (routing ORS, subdivisions).
 */

import INDEX from '../data/index.json';

// ─── Surcharges par ville ─────────────────────────────────────────────────────

const OVERRIDES = {
  // France
  PA:   { orsCountry: 'boundary.country=FR', subdivisionsKey: 'paris-arrondissements' },
  LY:   { orsCountry: 'boundary.country=FR' },
  MARS: { orsCountry: 'boundary.country=FR' },
  MPL:  { orsCountry: 'boundary.country=FR' },
  TLS:  { orsCountry: 'boundary.country=FR' },
  GRN:  { orsCountry: 'boundary.country=FR' },
  LIL:  { orsCountry: 'boundary.country=FR' },
  AVI:  { orsCountry: 'boundary.country=FR' },
  AMI:  { orsCountry: 'boundary.country=FR' },
  DIJ:  { orsCountry: 'boundary.country=FR' },
  ORLN: { orsCountry: 'boundary.country=FR' },
  AIX:  { orsCountry: 'boundary.country=FR' },
  NIM:  { orsCountry: 'boundary.country=FR' },
  PAU:  { orsCountry: 'boundary.country=FR' },
  REUN: { orsCountry: 'boundary.country=FR' },
  CLR:  { orsCountry: 'boundary.country=FR' },
  NA:   { orsCountry: 'boundary.country=FR' },
  RN:   { orsCountry: 'boundary.country=FR' },
  MTB:  { orsCountry: 'boundary.country=FR' },
  VRS:  { orsCountry: 'boundary.country=FR' },
  VLMO: { orsCountry: 'boundary.country=FR' },
  CAPF: { orsCountry: 'boundary.country=FR' },
  CAZ:  { orsCountry: 'boundary.country=FR' },
  // UK
  LDN:  { orsCountry: 'boundary.country=GB' },
  MAN:  { orsCountry: 'boundary.country=GB' },
  NCL:  { orsCountry: 'boundary.country=GB' },
  // USA
  NY:   { orsCountry: 'boundary.country=US' },
  LA:   { orsCountry: 'boundary.country=US' },
  MIA:  { orsCountry: 'boundary.country=US' },
  SD:   { orsCountry: 'boundary.country=US' },
  // Europe
  AMS:  { orsCountry: 'boundary.country=NL' },
  RTD:  { orsCountry: 'boundary.country=NL' },
  NOO:  { orsCountry: 'boundary.country=NL' },
  BXL:  { orsCountry: 'boundary.country=BE' },
  ANVR: { orsCountry: 'boundary.country=BE' },
  GNV:  { orsCountry: 'boundary.country=CH' },
  LSN:  { orsCountry: 'boundary.country=CH' },
  BRN:  { orsCountry: 'boundary.country=CH' },
  BSL:  { orsCountry: 'boundary.country=CH' },
  MUN:  { orsCountry: 'boundary.country=DE' },
  BRL:  { orsCountry: 'boundary.country=DE' },
  FKF:  { orsCountry: 'boundary.country=DE' },
  IST:  { orsCountry: 'boundary.country=TR' },
  ROM:  { orsCountry: 'boundary.country=IT' },
  RA:   { orsCountry: 'boundary.country=IT' },
  VRN:  { orsCountry: 'boundary.country=IT' },
  BRC:  { orsCountry: 'boundary.country=ES' },
  MLGA: { orsCountry: 'boundary.country=ES' },
  VSB:  { orsCountry: 'boundary.country=SE' },
  WN:   { orsCountry: 'boundary.country=AT' },
  LJU:  { orsCountry: 'boundary.country=SI' },
  ELT:  { orsCountry: 'boundary.country=IL' },
  FAO:  { orsCountry: 'boundary.country=PT' },
  // Afrique
  MRAK: { orsCountry: 'boundary.country=MA' },
  DJBA: { orsCountry: 'boundary.country=TN' },
  // Asie
  TK:   { orsCountry: 'boundary.country=JP' },
  HK:   { orsCountry: 'boundary.country=HK' },
  BGK:  { orsCountry: 'boundary.country=TH' },
  SL:   { orsCountry: 'boundary.country=KR' },
  DJN:  { orsCountry: 'boundary.country=KR' },
  KAT:  { orsCountry: 'boundary.country=NP' },
  // Amériques
  SP:   { orsCountry: 'boundary.country=BR' },
  CCU:  { orsCountry: 'boundary.country=MX' },
  POTI: { orsCountry: 'boundary.country=BO' },
  // Océanie
  MLB:  { orsCountry: 'boundary.country=AU' },
  PRT:  { orsCountry: 'boundary.country=AU' },
  // ── Complément de couverture pays (pour le classement du Palmarès) ──
  ANZR: { orsCountry: 'boundary.country=FR' }, // Annecy
  BTA:  { orsCountry: 'boundary.country=FR' }, // Bastia
  CHAR: { orsCountry: 'boundary.country=FR' }, // Chartres
  FRQ:  { orsCountry: 'boundary.country=FR' }, // Forcalquier
  FTBL: { orsCountry: 'boundary.country=FR' }, // Fontainebleau
  LBR:  { orsCountry: 'boundary.country=FR' }, // Luberon
  PRP:  { orsCountry: 'boundary.country=FR' }, // Perpignan
  BBO:  { orsCountry: 'boundary.country=ES' }, // Bilbao
  MEN:  { orsCountry: 'boundary.country=ES' }, // Minorque
  CON:  { orsCountry: 'boundary.country=DE' }, // Constance
  KLN:  { orsCountry: 'boundary.country=DE' }, // Cologne
  HALM: { orsCountry: 'boundary.country=SE' }, // Halmstad
  LCT:  { orsCountry: 'boundary.country=IT' }, // Lecce
  RBA:  { orsCountry: 'boundary.country=MA' }, // Rabat
  RDU:  { orsCountry: 'boundary.country=US' }, // Raleigh-Durham
  BAB:  { orsCountry: 'boundary.country=DZ' }, // Bab (Algérie)
  MBSA: { orsCountry: 'boundary.country=KE' }, // Mombasa
};

// ─── Construction des villes ──────────────────────────────────────────────────

// Zoom initial identique pour toutes les villes (~13 km de côté).
// Le bbox sert uniquement au routing et à la détection GPS, pas à la caméra.
function _mapDelta() {
  return { latitudeDelta: 0.12, longitudeDelta: 0.12 };
}

function _bbox(c) {
  if (c.bbox?.minLat != null) return c.bbox;
  const d = 0.15;
  return {
    minLat: c.center.lat - d, maxLat: c.center.lat + d,
    minLng: c.center.lng - d, maxLng: c.center.lng + d,
  };
}

export const CITIES = Object.fromEntries(
  INDEX.cities.map(c => [c.code, {
    code:            c.code,
    name:            c.name,
    center:          c.center,
    mapDelta:        _mapDelta(),
    bbox:            _bbox(c),
    orsCountry:      OVERRIDES[c.code]?.orsCountry      ?? null,
    subdivisionsKey: OVERRIDES[c.code]?.subdivisionsKey ?? null,
    enabled:         true,
  }])
);

export const ENABLED_CITIES  = Object.values(CITIES);
export const DEFAULT_CITY_CODE = 'PA';
