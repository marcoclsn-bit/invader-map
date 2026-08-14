import { _interne, etatFile, PRIORITE_FICHE, PRIORITE_LISTE } from '../services/photoQueue';

const { demander, rendre, MAX_SIMULTANEES, POIDS_DEFAUT, delai, reinitialiser } = _interne;

// La cadence dépend désormais du POIDS de la requête précédente : même plafond
// d'octets, cadence adaptée. On calcule donc le délai attendu au lieu de le lire.
const INTERVALLE_MS = delai(POIDS_DEFAUT);

// La file existe pour ne pas frapper space-invaders.com par salves : dérouler
// une liste de mille vignettes lançait mille requêtes au rythme du défilement,
// et cent appareils faisant cela en même temps représentent 590 Mbit/s.
//
// Deux limites se combinent, et c'est volontaire : au plus MAX_SIMULTANEES
// requêtes en vol, ET au plus un départ toutes les INTERVALLE_MS. La seconde
// domine souvent la première — c'est le débit qui compte, pas la simultanéité.
describe('file d’attente des photos', () => {
  beforeEach(() => { jest.useFakeTimers(); reinitialiser(); });
  afterEach(() => { jest.useRealTimers(); });

  /** Demande n créneaux et rend le journal des départs, dans l'ordre. */
  function demanderPlusieurs(n, priorite, etiquette, journal) {
    const jetons = [];
    for (let i = 0; i < n; i += 1) {
      const nom = `${etiquette}${i}`;
      const j = demander(priorite, () => journal.push(nom));
      j.nom = nom;
      jetons.push(j);
    }
    return jetons;
  }

  test('ne laisse jamais partir plus de MAX_SIMULTANEES requêtes à la fois', () => {
    const journal = [];
    demanderPlusieurs(10, PRIORITE_LISTE, 'l', journal);
    expect(etatFile().enCours).toBeLessThanOrEqual(MAX_SIMULTANEES);
    expect(journal.length).toBeLessThanOrEqual(MAX_SIMULTANEES);
  });

  test('impose un intervalle minimal entre deux départs', () => {
    const journal = [];
    const jetons = demanderPlusieurs(6, PRIORITE_LISTE, 'l', journal);
    const partis = journal.length;

    // Sans avancer l'horloge, rendre un créneau ne suffit PAS : l'intervalle
    // n'est pas écoulé. C'est ce qui transforme une salve en débit régulier.
    rendre(jetons.find((j) => j.nom === journal[0]));
    expect(journal.length).toBe(partis);

    jest.advanceTimersByTime(INTERVALLE_MS + 1);
    expect(journal.length).toBeGreaterThan(partis);
  });

  test('libère bien un créneau par requête terminée', () => {
    const journal = [];
    const jetons = demanderPlusieurs(8, PRIORITE_LISTE, 'l', journal);
    // On rend les créneaux au fil de l'eau, en avançant l'horloge : tout doit
    // finir par partir, aucun blocage.
    for (let tour = 0; tour < 20 && journal.length < 8; tour += 1) {
      journal.forEach((nom) => {
        const j = jetons.find((x) => x.nom === nom);
        if (j) rendre(j);
      });
      jest.advanceTimersByTime(INTERVALLE_MS + 1);
    }
    expect(journal).toHaveLength(8);
    expect(etatFile().enAttente).toBe(0);
  });

  test('une fiche ouverte passe devant les vignettes déjà en attente', () => {
    const journal = [];
    const vignettes = demanderPlusieurs(6, PRIORITE_LISTE, 'l', journal);
    const dejaPartis = [...journal];

    // La fiche arrive APRÈS, alors que la file est déjà pleine.
    demander(PRIORITE_FICHE, () => journal.push('FICHE'));

    // On rend les créneaux des seules vignettes réellement parties.
    dejaPartis.forEach((nom) => rendre(vignettes.find((x) => x.nom === nom)));
    jest.advanceTimersByTime(INTERVALLE_MS + 1);

    // Le premier départ après libération doit être la fiche, pas une vignette
    // arrivée avant elle : un geste explicite n'attend pas derrière un défilement.
    expect(journal[dejaPartis.length]).toBe('FICHE');
  });

  test('un jeton encore en attente sort de la file sans fausser le compte', () => {
    const journal = [];
    const jetons = demanderPlusieurs(6, PRIORITE_LISTE, 'l', journal);
    const enCoursAvant = etatFile().enCours;
    const enAttenteAvant = etatFile().enAttente;

    rendre(jetons[5]);   // celui-là n'est jamais parti : sortie d'écran avant son tour

    expect(etatFile().enCours).toBe(enCoursAvant);
    expect(etatFile().enAttente).toBe(enAttenteAvant - 1);
  });

  test('rendre deux fois le même jeton ne crée pas de créneau fantôme', () => {
    const journal = [];
    const jetons = demanderPlusieurs(4, PRIORITE_LISTE, 'l', journal);
    const parti = jetons.find((j) => j.nom === journal[0]);
    rendre(parti);
    const apres = etatFile().enCours;
    rendre(parti);
    rendre(parti);
    expect(etatFile().enCours).toBe(apres);
  });
});

// Le plafond porte sur des OCTETS, pas sur un nombre de requêtes. C'est ce qui
// permet à une vignette de 20 Ko d'aller dix fois plus vite qu'une photo de
// 216 Ko sans consommer plus de bande passante.
describe('cadence proportionnelle au poids', () => {
  beforeEach(() => { jest.useFakeTimers(); _interne.reinitialiser(); });
  afterEach(() => { jest.useRealTimers(); });

  test('une vignette légère libère la file plus vite qu’une photo lourde', () => {
    const leger = _interne.delai(20 * 1024);
    const lourd = _interne.delai(216 * 1024);
    expect(leger).toBeLessThan(lourd);
    expect(lourd / leger).toBeGreaterThan(8);   // ~10×, le rapport des poids
  });

  test('le débit plafond est le même quel que soit le poids', () => {
    for (const poids of [20 * 1024, 216 * 1024, 546 * 1024]) {
      const octetsParMs = poids / _interne.delai(poids);
      expect(octetsParMs).toBeCloseTo(_interne.DEBIT_OCTETS_PAR_MS, 0);
    }
  });

  test('le délai réellement appliqué suit le poids de la requête partie', () => {
    const journal = [];
    const j1 = _interne.demander(0, () => journal.push('leger'), 20 * 1024);
    _interne.demander(0, () => journal.push('suivant'), 20 * 1024);
    _interne.rendre(j1);
    jest.advanceTimersByTime(_interne.delai(20 * 1024) + 2);
    expect(journal).toContain('suivant');
  });
});
