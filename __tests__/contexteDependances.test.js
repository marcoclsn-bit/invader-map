const fs = require('fs');
const path = require('path');

/**
 * Garde contre une panne muette et coûteuse.
 *
 * La valeur d'AppContext est mémorisée par un useMemo dont le tableau de
 * dépendances est tenu à la main — la règle ESLint correspondante y est
 * explicitement désactivée. Ajouter un état au contexte sans l'ajouter à cette
 * liste ne casse rien de visible : la valeur n'est simplement plus recréée, et
 * les écrans continuent de lire l'ancienne. Le symptôme apparaît ailleurs, plus
 * tard, sous une forme qui n'évoque jamais la cause.
 *
 * C'est arrivé quatre fois le même jour : `notes` (la fiche affichait
 * « Enregistrement… » indéfiniment alors que l'écriture disque avait bien eu
 * lieu), `fiPhotos`, `photosListe` et `photosSpotter`.
 */
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'context', 'AppContext.js'), 'utf8');

function etatsDeclares(src) {
  return new Set([...src.matchAll(/const \[(\w+),\s*set\w+\] = useState/g)].map((m) => m[1]));
}

function corpsDeLaValeur(src) {
  const debut = src.indexOf('const value = useMemo');
  const fin = src.indexOf('}), [', debut);
  return src.slice(debut, fin);
}

function dependances(src) {
  const m = src.match(/\}\), \[[^\n]*\n([\s\S]*?)\n {2}\]\);/);
  return new Set([...(m ? m[1] : '')].join('').match(/[A-Za-z_$][\w$]*/g) ?? []);
}

describe('valeur du contexte et ses dépendances', () => {
  test('le useMemo et son tableau sont bien trouvés', () => {
    expect(corpsDeLaValeur(SOURCE).length).toBeGreaterThan(200);
    expect(dependances(SOURCE).size).toBeGreaterThan(20);
  });

  test('tout état exposé par le contexte figure dans ses dépendances', () => {
    const corps = corpsDeLaValeur(SOURCE);
    const deps = dependances(SOURCE);
    const manquants = [...etatsDeclares(SOURCE)]
      // exposé si le nom apparaît comme entrée de l'objet rendu
      .filter((nom) => new RegExp(`(^|[\\s,{])${nom}(,|\\s*$)`, 'm').test(corps))
      .filter((nom) => !deps.has(nom))
      .sort();
    expect(manquants).toEqual([]);
  });
});
