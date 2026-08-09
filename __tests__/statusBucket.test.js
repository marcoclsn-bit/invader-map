// Le filtre de statut de la carte est une LISTE BLANCHE : un statut absent de
// ALL_STATUSES disparaît de la carte sans qu'aucune case ne puisse le ramener.
// 24 Invaders 'hidden' sont restés invisibles ainsi. Ces tests verrouillent le
// repli et vérifient qu'aucun statut présent dans les données ne se perd.

import fs from 'fs';
import path from 'path';
import francais from '../locales/fr.json';
import anglais from '../locales/en.json';
import espagnol from '../locales/es.json';
import italien from '../locales/it.json';
import { ALL_STATUSES, STATUS_COLOR, statusKey, statusLabelKey } from '../constants';

const LOCALES = { fr: francais, en: anglais, es: espagnol, it: italien };
const DATA_DIR = path.join(process.cwd(), 'data');

describe('statusKey', () => {
  test('laisse passer les statuts connus', () => {
    for (const s of ALL_STATUSES) expect(statusKey(s)).toBe(s);
  });

  test("range 'hidden' dans le seau gris", () => {
    expect(statusKey('hidden')).toBe('unknown');
  });

  test('range toute valeur inattendue dans le seau gris', () => {
    for (const s of ['restored', 'partially destroyed', '', null, undefined, 42]) {
      expect(statusKey(s)).toBe('unknown');
    }
  });

  test('le seau a toujours une couleur', () => {
    expect(STATUS_COLOR[statusKey('hidden')]).toBeDefined();
  });
});

describe('statusLabelKey', () => {
  test('le seau gris est libellé « non visible », pas « inconnu »', () => {
    expect(statusLabelKey('unknown')).toBe('common.status.notVisible');
  });

  test('les autres statuts gardent leur libellé exact', () => {
    expect(statusLabelKey('ok')).toBe('common.status.ok');
  });

  test('chaque clé existe dans les quatre langues', () => {
    const cles = ALL_STATUSES.map(statusLabelKey);
    for (const dict of Object.values(LOCALES)) {
      for (const cle of cles) {
        const valeur = cle.split('.').reduce((o, k) => o?.[k], dict);
        expect(typeof valeur).toBe('string');
      }
    }
  });
});

describe('données embarquées', () => {
  test('aucun statut des fichiers de villes ne se perd sur la carte', () => {
    const fichiers = fs.readdirSync(DATA_DIR).filter(f => /^invaders_[A-Z]+\.json$/.test(f));
    expect(fichiers.length).toBeGreaterThan(50);
    const vus = new Set();
    for (const f of fichiers) {
      const { invaders = [] } = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      for (const inv of invaders) vus.add(inv.status);
    }
    for (const s of vus) {
      expect(ALL_STATUSES).toContain(statusKey(s));
      expect(STATUS_COLOR[statusKey(s)]).toBeDefined();
    }
  });
});
