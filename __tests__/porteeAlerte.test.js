/**
 * Portée de l'alerte : trois niveaux, aucun mètre affiché.
 *
 * Ce qui est protégé ici n'est pas l'affichage, c'est la MIGRATION SILENCIEUSE.
 * Les rayons déjà stockés sur les téléphones (100 et 150, plus tout ce qu'ont pu
 * laisser les versions antérieures) doivent retomber sur un niveau existant, sans
 * quoi l'écran n'affiche aucune sélection et l'utilisateur croit son Mode balade
 * cassé. `niveauPourRayon` ne doit jamais rendre autre chose qu'une des trois clés.
 */
const fs = require('fs');
const path = require('path');

// L'écran importe react-native et expo-* : on n'en veut rien ici. On extrait la
// fonction du source plutôt que de monter tout un environnement de rendu pour
// tester quinze lignes d'arithmétique.
function chargeNiveauPourRayon() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'screens', 'StrollScreen.js'), 'utf8',
  );
  const niveaux = src.match(/const NIVEAUX = \[[\s\S]*?\];/);
  const fonction = src.match(/export function niveauPourRayon[\s\S]*?\n}/);
  expect(niveaux).toBeTruthy();
  expect(fonction).toBeTruthy();
  // eslint-disable-next-line no-new-func
  return new Function(
    `${niveaux[0]}\n${fonction[0].replace('export ', '')}\nreturn { NIVEAUX, niveauPourRayon };`,
  )();
}

const { NIVEAUX, niveauPourRayon } = chargeNiveauPourRayon();
const CLES = NIVEAUX.map((n) => n.cle);

describe('portée de l’alerte', () => {
  test('les trois niveaux attendus, dans l’ordre croissant', () => {
    expect(CLES).toEqual(['proche', 'moyenne', 'large']);
    const rayons = NIVEAUX.map((n) => n.radius);
    expect(rayons).toEqual([...rayons].sort((a, b) => a - b));
  });

  test('les rayons déjà stockés retombent exactement sur un niveau', () => {
    // 100 et 150 sont les deux valeurs qu'ont réellement les téléphones aujourd'hui.
    expect(niveauPourRayon(100)).toBe('proche');
    expect(niveauPourRayon(150)).toBe('moyenne');
    expect(niveauPourRayon(250)).toBe('large');
  });

  test('les valeurs héritées ou aberrantes trouvent toujours un niveau', () => {
    // 50 a existé avant le relèvement du plancher ; 0 et 9999 ne devraient pas
    // exister, mais un stockage corrompu ne doit pas vider la sélection.
    for (const r of [0, 25, 50, 99, 124, 126, 199, 201, 400, 9999, -10]) {
      expect(CLES).toContain(niveauPourRayon(r));
    }
  });

  test('la frontière penche du bon côté', () => {
    expect(niveauPourRayon(124)).toBe('proche');   // < mi-chemin 125
    expect(niveauPourRayon(126)).toBe('moyenne');
    expect(niveauPourRayon(199)).toBe('moyenne');  // < mi-chemin 200
    expect(niveauPourRayon(201)).toBe('large');
  });
});

describe('traductions de la portée', () => {
  const LANGUES = ['fr', 'en', 'es', 'it'];

  test('chaque langue décrit les trois niveaux, sans aucun mètre', () => {
    for (const langue of LANGUES) {
      const dict = require(`../locales/${langue}.json`).stroll;
      expect(`${langue}:${typeof dict.radiusHint}`).toBe(`${langue}:string`);
      for (const cle of CLES) {
        const n = dict.radiusLevels?.[cle];
        expect(`${langue}.${cle}`).toBe(n?.label && n?.hint ? `${langue}.${cle}` : 'MANQUANT');
        // Le point de tout ce changement : plus une seule distance affichée.
        expect(`${langue}.${cle}:${/\d+\s*m\b/.test(n.label + ' ' + n.hint)}`)
          .toBe(`${langue}.${cle}:false`);
      }
    }
  });

  test('les clés de l’ancien curseur ont bien disparu', () => {
    for (const langue of LANGUES) {
      const dict = require(`../locales/${langue}.json`).stroll;
      expect(`${langue}:${'radiusLabel' in dict}`).toBe(`${langue}:false`);
      expect(`${langue}:${'radiusValue' in dict}`).toBe(`${langue}:false`);
    }
  });
});
