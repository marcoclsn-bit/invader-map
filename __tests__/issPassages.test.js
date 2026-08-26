const {
  passagesISS, elevationISS, observateurDepuis, pointSousISS,
} = require('../utils/issPassages');
const { twoline2satrec } = require('satellite.js');

/**
 * Le moteur est déterministe (aucune horloge interne) : on fige un TLE et un
 * instant, et tout devient vérifiable. Le TLE est syntaxiquement réel ; sa
 * correspondance à la « vraie » ISS d'un jour donné est sans importance — les
 * tests vérifient la COHÉRENCE du moteur avec l'orbite décrite, par les mêmes
 * primitives satellite.js qu'utilisent tous les trackers.
 */
const TLE1 = '1 25544U 98067A   24001.50000000  .00016717  00000+0  30270-3 0  9990';
const TLE2 = '2 25544  51.6400 208.9163 0002571  89.3263  15.4102 15.49560000432540';
// Époque du TLE : 2024-01-01 12:00 UTC.
const EPOQUE_MS = Date.UTC(2024, 0, 1, 12, 0, 0);

const satrec = twoline2satrec(TLE1, TLE2);

describe('géométrie de base', () => {
  test('sous la station, l\'élévation est quasi verticale', () => {
    // On place l'observateur exactement sous l'ISS : la station doit être
    // au zénith. C'est le test d'auto-cohérence le plus fort du montage
    // ECI → ECF → angles de visée.
    const sous = pointSousISS(satrec, EPOQUE_MS);
    expect(sous).not.toBeNull();
    const obs = observateurDepuis(sous.lat, sous.lng);
    const e = elevationISS(satrec, obs, EPOQUE_MS);
    expect(e).toBeGreaterThan(89);
  });

  test('aux antipodes de la station, elle est sous l\'horizon', () => {
    const sous = pointSousISS(satrec, EPOQUE_MS);
    const obs = observateurDepuis(-sous.lat, ((sous.lng + 540) % 360) - 180);
    const e = elevationISS(satrec, obs, EPOQUE_MS);
    expect(e).toBeLessThan(0);
  });
});

describe('passages', () => {
  // Observateur posé pile sous la station à l'époque : il existe AU MOINS un
  // passage quasi zénithal dans la fenêtre — celui de l'époque elle-même.
  const sous = pointSousISS(satrec, EPOQUE_MS);

  const passages = passagesISS({
    tle1: TLE1, tle2: TLE2,
    lat: sous.lat, lng: sous.lng,
    debutMs: EPOQUE_MS - 3600000,   // 1 h avant, pour englober le passage connu
    dureeJours: 2,
  });

  test('le passage connu est trouvé, avec un pic quasi vertical', () => {
    expect(passages.length).toBeGreaterThanOrEqual(1);
    const connu = passages.find((p) => Math.abs(p.picMs - EPOQUE_MS) < 5 * 60000);
    expect(connu).toBeDefined();
    expect(connu.elevationMaxDeg).toBeGreaterThan(85);
  });

  test('la fenêtre flashable contient le pic, et reste courte', () => {
    for (const p of passages) {
      expect(p.flashableDebutMs).toBeLessThanOrEqual(p.picMs);
      expect(p.flashableFinMs).toBeGreaterThanOrEqual(p.picMs);
      // À 80° de seuil, la fenêtre dure quelques dizaines de secondes ; au-delà
      // de 3 minutes, la dichotomie a accroché autre chose que la cloche.
      expect(p.flashableFinMs - p.flashableDebutMs).toBeLessThan(3 * 60000);
    }
  });

  test('l\'élévation au bord de la fenêtre vaut le seuil, à un degré près', () => {
    const obs = observateurDepuis(sous.lat, sous.lng);
    for (const p of passages) {
      const eDebut = elevationISS(satrec, obs, p.flashableDebutMs);
      const eFin = elevationISS(satrec, obs, p.flashableFinMs);
      expect(Math.abs(eDebut - 80)).toBeLessThan(1);
      expect(Math.abs(eFin - 80)).toBeLessThan(1);
    }
  });

  test('l\'affinage ne rate rien : accord avec un balayage exhaustif à 5 s', () => {
    // L'oracle : un balayage brutal à 5 s sur 12 h. Tout pic ≥ 80° qu'il voit,
    // le moteur (pas de 30 s + affinage) doit le voir aussi, au même endroit.
    const obs = observateurDepuis(sous.lat, sous.lng);
    const debut = EPOQUE_MS - 3600000;
    const picsOracle = [];
    let dans = false, maxE = -90, maxT = 0;
    for (let t = debut; t <= debut + 12 * 3600000; t += 5000) {
      const e = elevationISS(satrec, obs, t);
      if (e >= 10) {
        if (!dans) { dans = true; maxE = -90; }
        if (e > maxE) { maxE = e; maxT = t; }
      } else if (dans) {
        dans = false;
        if (maxE >= 80) picsOracle.push(maxT);
      }
    }
    const demiJournee = passages.filter((p) => p.picMs <= debut + 12 * 3600000);
    expect(demiJournee.length).toBe(picsOracle.length);
    for (let i = 0; i < picsOracle.length; i += 1) {
      expect(Math.abs(demiJournee[i].picMs - picsOracle[i])).toBeLessThan(30000);
    }
  });

  test('déterminisme : deux appels identiques, deux résultats identiques', () => {
    const rejoue = passagesISS({
      tle1: TLE1, tle2: TLE2, lat: sous.lat, lng: sous.lng,
      debutMs: EPOQUE_MS - 3600000, dureeJours: 2,
    });
    expect(rejoue).toEqual(passages);
  });
});

describe('robustesse', () => {
  test('TLE illisible : erreur franche, pas un tableau vide trompeur', () => {
    expect(() => passagesISS({
      tle1: 'n importe quoi', tle2: 'pareil',
      lat: 48.85, lng: 2.35, debutMs: EPOQUE_MS, dureeJours: 1,
    })).toThrow();
  });

  test('un point quelconque sur 2 jours : jamais d\'erreur, résultats bien formés', () => {
    // Paris, fenêtre arbitraire : il peut n'y avoir AUCUN passage ≥ 80° en
    // 2 jours (ils sont rares — c'est le propre de la fonctionnalité), mais le
    // moteur doit rendre un tableau propre, trié, sans doublon.
    const r = passagesISS({
      tle1: TLE1, tle2: TLE2, lat: 48.8566, lng: 2.3522,
      debutMs: EPOQUE_MS, dureeJours: 2,
    });
    expect(Array.isArray(r)).toBe(true);
    for (let i = 1; i < r.length; i += 1) {
      expect(r[i].picMs).toBeGreaterThan(r[i - 1].picMs);
    }
    for (const p of r) expect(p.elevationMaxDeg).toBeGreaterThanOrEqual(80);
  });
});
