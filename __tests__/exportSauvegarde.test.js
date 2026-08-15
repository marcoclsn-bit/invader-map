import { exportListe, analyseListe, exportNotes, analyseNotes, datesDuTexte } from '../utils/importList';

// Ce que l'app exporte, l'app doit savoir le relire. C'est la seule sauvegarde
// possible sans compte ni serveur — et pour les notes, la seule qui existe : rien
// ni personne d'autre ne les a jamais vues.
describe('aller-retour de la liste, dates comprises', () => {
  const flashed = new Set(['PA_01', 'PA_1247', 'ORLN_12']);
  const dates = new Map([
    ['PA_1247', '2026-08-12T14:33:01'],
    ['ORLN_12', '2025-03-26T10:02:00'],
  ]);

  test('la date suit son identifiant, sur la même ligne', () => {
    const txt = exportListe(flashed, dates);
    expect(txt).toContain('PA_1247 2026-08-12T14:33:01');
    expect(txt.split('\n')).toContain('PA_01');   // sans date : identifiant nu
  });

  test('relire l’export rend les mêmes dates', () => {
    const lu = datesDuTexte(exportListe(flashed, dates));
    expect(lu.get('PA_1247')).toBe('2026-08-12T14:33:01');
    expect(lu.get('ORLN_12')).toBe('2025-03-26T10:02:00');
    expect(lu.has('PA_01')).toBe(false);
  });

  test('une date ne peut pas être prise pour un identifiant', () => {
    // C'est ce qui autorise la seconde colonne : le motif des jetons exige des
    // LETTRES avant le tiret bas. « 2026-08-12 » n'y répond jamais.
    const r = analyseListe('PA_1247 2026-08-12T14:33:01', new Set());
    expect(r.nouveaux).toEqual(['PA_1247']);
    expect(r.inconnus).toEqual([]);
  });

  test('une ligne portant PLUSIEURS identifiants ne se voit attribuer aucune date', () => {
    // Deviner à qui appartient la date serait pire que renoncer.
    expect(datesDuTexte('PA_01, PA_02  2026-08-12').size).toBe(0);
  });

  test('sans heure, on écrit minuit LOCAL et jamais un « Z »', () => {
    const iso = datesDuTexte('PA_1247 2026-08-12').get('PA_1247');
    expect(iso).toBe('2026-08-12T00:00:00');
    expect(iso).not.toMatch(/[Zz]$/);
    expect(new Date(iso).getDate()).toBe(12);   // pas de glissement de jour
  });

  test('une date invalide est écartée sans bruit', () => {
    expect(datesDuTexte('PA_1247 2026-13-45').size).toBe(0);
  });
});

describe('aller-retour des notes', () => {
  const notes = { PA_1247: 'Avec Julie, galéré une heure', ORLN_12: "Je l'ai pas vraiment flashé" };

  test('ce qui est exporté se relit à l’identique', () => {
    const r = analyseNotes(exportNotes(notes, '2026-08-15'), {});
    expect(r.notes).toEqual(notes);
    expect(r.total).toBe(2);
    expect(r.nouvelles).toBe(2);
  });

  test('les notes à plusieurs lignes survivent', () => {
    const multi = { PA_01: 'Première ligne\nDeuxième ligne, avec une virgule' };
    expect(analyseNotes(exportNotes(multi), {}).notes).toEqual(multi);
  });

  test('distingue ce qui est nouveau de ce qui écraserait', () => {
    const r = analyseNotes(exportNotes(notes), { PA_1247: 'autre chose' });
    expect(r.nouvelles).toBe(1);
    expect(r.existantes).toBe(1);
  });

  test('un texte qui n’est pas une sauvegarde de notes rend null', () => {
    for (const mauvais of ['PA_01\nPA_02', '{}', '{"notes":{}}', 'bidon', '', null, '{ pas du json']) {
      expect(analyseNotes(mauvais, {})).toBeNull();
    }
  });

  test('un identifiant qui n’en est pas un est ignoré', () => {
    const brut = JSON.stringify({ 'invaderquest-notes': 1, notes: { BIDON: 'x', PA_01: 'ok' } });
    expect(analyseNotes(brut, {}).notes).toEqual({ PA_01: 'ok' });
  });

  test('une note vide n’est jamais exportée', () => {
    expect(analyseNotes(exportNotes({ PA_01: '   ', PA_02: 'vraie' }), {}).total).toBe(1);
  });
});
