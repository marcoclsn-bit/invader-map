/**
 * data/invadersSpace.js — les deux mosaïques envoyées dans l'espace.
 *
 * POURQUOI EMBARQUÉ PLUTÔT QUE DANS LE PIPELINE
 *
 * `scripts/build_invaders.mjs` connaît le code ville `SPACE` (déclaré sans bbox),
 * et la source amont goguelnikov porte bien les deux entrées. Mais elle les donne
 * avec `lat` et `lng` VIDES — parce qu'aucune des deux n'a de position au sol :
 * l'une a volé dans la stratosphère, l'autre tourne à 28 000 km/h. Le script les
 * écarte donc, faute de coordonnées valides. C'est la seule raison de leur absence.
 *
 * Plutôt que d'assouplir la validation du pipeline pour deux fiches, on les
 * embarque : elles sont STATIQUES par nature (pas de coordonnée à rafraîchir, pas
 * de statut qui évolue) et ne dépendent d'aucune source vivante. Bénéfice
 * secondaire mais décisif : elles n'atteignent que les binaires qui portent ce
 * code, alors qu'un ajout dans `data/` toucherait TOUS les utilisateurs
 * instantanément — les JSON étant lus en direct depuis GitHub.
 *
 * IDENTIFIANTS — à ne pas « corriger »
 *
 * `SPACE_01` et `SPACE_02` sont les identifiants EXACTS de la source, donc ceux
 * que renvoie l'API FlashInvaders. La synchro les compare verbatim : les
 * renommer romprait la reconnaissance des flashs importés. Piège relevé dans la
 * source : l'identifiant de SPACE_01 y traîne une espace finale (`"SPACE_01 "`).
 * On stocke la forme propre et on compare en ayant retiré les espaces.
 *
 * STATUTS ET POINTS — repris de la source, pas réinventés
 *
 * SPACE_01 est `hidden` à 0 point, SPACE_02 est `ok` à 100 points. `hidden`
 * retombe dans le seau « Non visible » de `constants.js`, coché par défaut :
 * rien de particulier à prévoir.
 *
 * NE PAS « CORRIGER » LE 0 DE SPACE_01. Il intrigue, et une statistique le fait
 * passer pour une coquille : sur les 19 Invaders `hidden` de la base, c'est le
 * SEUL à 0 point, les autres valant 10 à 100. Conclusion tentante et FAUSSE —
 * elle a été tirée une fois, puis démentie par Marco. SPACE_01 ne vaut pas 0
 * parce qu'il est masqué, mais parce qu'il n'est PAS FLASHABLE : aucun joueur ne
 * peut plus le déclencher, donc il ne rapporte rien. Un Invader détruit au sol
 * garde ses points parce qu'il a pu être flashé de son vivant ; celui-là, non.
 * La valeur est juste, et elle doit rester à 0.
 */

export const SPACE_CITY_CODE = 'SPACE';

// Ni l'une ni l'autre n'a de position : `lat` et `lng` valent null, jamais 0 —
// zéro serait une coordonnée valide, au large du golfe de Guinée.
export const SPACE_INVADERS = [
  {
    id: 'SPACE_01',
    lat: null,
    lng: null,
    status: 'hidden',
    points: 0,
    hint: '',
  },
  {
    id: 'SPACE_02',
    lat: null,
    lng: null,
    status: 'ok',
    points: 100,
    hint: '',
  },
];

// Métadonnées de la « ville », au format de `data/index.json` pour que le
// Palmarès l'enrichisse comme les autres. `center` et `bbox` sont nuls : c'est
// ce qui la rend non cartographiable (voir `cities/registry.js`).
export const SPACE_CITY_META = {
  code: SPACE_CITY_CODE,
  name: 'Espace / ISS',
  count: SPACE_INVADERS.length,
  destroyed: SPACE_INVADERS.filter((i) => i.status === 'hidden' || i.status === 'destroyed').length,
  version: 1,
  center: null,
  bbox: null,
};

/** Identifiant comparable : la source amont laisse traîner des espaces. */
export const memeInvader = (a, b) => String(a || '').trim() === String(b || '').trim();
