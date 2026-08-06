import { analyseListe, exportListe } from '../utils/importList';

// Échantillon réel envoyé par un abonné (extrait de sa galerie FlashInvaders).
const RÉEL = `BRC_01
BRC_02
BRC_09
BXL_02
BXL_03
BXL_04
BXL_06
BXL_08
BXL_10
BXL_11
BXL_12
BXL_15
BXL_16
BXL_17
BXL_18`;

describe('analyseListe', () => {
  test('reconnaît l’échantillon réel en entier', () => {
    const r = analyseListe(RÉEL, new Set());
    expect(r.total).toBe(15);
    expect(r.inconnus).toEqual([]);
    expect(r.nouveaux).toHaveLength(15);
    expect(r.villes).toEqual({ BRC: 3, BXL: 12 });
  });

  test('signale les mosaïques détruites', () => {
    const r = analyseListe(RÉEL, new Set());
    // BRC_01 et BRC_02 sont détruits, BXL_03 aussi
    expect(r.detruits.length).toBeGreaterThan(0);
    expect(r.detruits.every(id => r.nouveaux.includes(id))).toBe(true);
  });

  test('distingue les nouveaux des déjà flashés', () => {
    const r = analyseListe(RÉEL, new Set(['BXL_02', 'BXL_03']));
    expect(r.dejaFlashes).toEqual(['BXL_02', 'BXL_03']);
    expect(r.nouveaux).toHaveLength(13);
  });

  test('se moque du séparateur : virgules, tabulations, CSV avec en-tête', () => {
    const csv = 'id,date\n"BXL_02",2024-01-01\n"BXL_03",2024-02-01';
    const virgules = 'BXL_02, BXL_03';
    const vrac = 'j’ai flashé BXL_02 puis BXL_03 dans la journée';
    for (const t of [csv, virgules, vrac]) {
      expect(analyseListe(t, new Set()).nouveaux).toEqual(['BXL_02', 'BXL_03']);
    }
  });

  test('dédoublonne en conservant l’ordre', () => {
    const r = analyseListe('BXL_03\nBXL_02\nBXL_03', new Set());
    expect(r.nouveaux).toEqual(['BXL_03', 'BXL_02']);
    expect(r.total).toBe(2);
  });

  test('rejette les identifiants bien formés mais inexistants', () => {
    const r = analyseListe('BXL_9999\nXX_12\nBXL_02', new Set());
    expect(r.inconnus).toEqual(['BXL_9999', 'XX_12']);
    expect(r.nouveaux).toEqual(['BXL_02']);
  });

  test('accepte la numérotation à trous et le zéro initial', () => {
    // Hong Kong compte 130 Invaders mais va jusqu’à HK_132 ; Lille commence à 00.
    const r = analyseListe('HK_132\nLIL_00\nHK_11', new Set());
    expect(r.nouveaux).toEqual(['HK_132', 'LIL_00']);
    expect(r.inconnus).toEqual(['HK_11']);   // HK_11 n’existe pas (trou réel)
  });

  test('tolère les minuscules et le texte vide', () => {
    expect(analyseListe('bxl_02', new Set()).nouveaux).toEqual(['BXL_02']);
    expect(analyseListe('', new Set()).total).toBe(0);
    expect(analyseListe(null, new Set()).total).toBe(0);
  });
});

describe('exportListe', () => {
  test('trie par ville puis par numéro, une ligne par identifiant', () => {
    const out = exportListe(new Set(['BXL_10', 'BRC_02', 'BXL_02']));
    expect(out).toBe('BRC_02\nBXL_02\nBXL_10');
  });

  test('ce que l’app exporte, l’app le réimporte', () => {
    const flashes = new Set(['BXL_02', 'BXL_10', 'BRC_02']);
    const r = analyseListe(exportListe(flashes), new Set());
    expect(new Set(r.nouveaux)).toEqual(flashes);
    expect(r.inconnus).toEqual([]);
  });
});
