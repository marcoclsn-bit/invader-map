const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;

/**
 * Filet contre une classe d'erreurs que rien d'autre n'attrape ici.
 *
 * Un symbole utilisé mais jamais importé passe Babel, passe `expo export`, passe
 * la publication — et lève un ReferenceError au premier rendu du composant
 * concerné. C'est arrivé avec `PRIORITE_FICHE` dans l'écran Collection : l'app
 * s'arrêtait net au moment précis où la carte de révélation s'affichait, donc
 * seulement après avoir flashé un Invader et être revenu. Marco l'a découvert à
 * ma place, après deux allers-retours de test infructueux.
 *
 * Le projet n'a pas de configuration ESLint utilisable ; ce test tient lieu de
 * règle `no-undef`.
 */

// Ce que l'exécution fournit réellement, et qui n'a donc pas à être importé.
const FOURNIS = new Set([
  // moteur
  'Math', 'JSON', 'Date', 'Set', 'Map', 'WeakMap', 'WeakSet', 'Array', 'Object',
  'Number', 'String', 'Boolean', 'Promise', 'Symbol', 'RegExp', 'Error',
  'TypeError', 'RangeError', 'Infinity', 'NaN', 'undefined', 'parseInt',
  'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'Intl', 'BigInt', 'Proxy', 'Reflect', 'Infinity',
  // hôte React Native
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'Headers', 'Request',
  'Response', 'AbortController', 'FormData', 'URL', 'URLSearchParams', 'Blob',
  'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'performance', 'queueMicrotask',
  '__DEV__', 'global', 'globalThis', 'process', 'require', 'module', 'exports',
  'structuredClone',
  // `arguments` est lié par chaque fonction non fléchée : Babel le remonte en
  // « global » du programme, ce n'est pas un symbole manquant.
  'arguments',
]);

// Auxiliaires injectés par Babel lui-même : ils n'existent pas dans le source.
const estAuxiliaire = (nom) => nom.startsWith('_');

const RACINES = ['App.js', 'index.js', 'screens', 'components', 'services',
  'utils', 'context', 'config', 'theme', 'cities', 'i18n'];

function fichiers(depart) {
  const abs = path.join(__dirname, '..', depart);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return abs.endsWith('.js') ? [abs] : [];
  return fs.readdirSync(abs).flatMap((n) => fichiers(path.join(depart, n)));
}

const SOURCES = RACINES.flatMap(fichiers);

describe('aucun identifiant utilisé sans être déclaré', () => {
  test('le balayage trouve bien des fichiers', () => {
    expect(SOURCES.length).toBeGreaterThan(30);
  });

  test.each(SOURCES.map((f) => [path.relative(path.join(__dirname, '..'), f), f]))(
    '%s',
    (_relatif, absolu) => {
      const source = fs.readFileSync(absolu, 'utf8');
      const out = babel.transformSync(source, {
        presets: ['babel-preset-expo'],
        filename: absolu,
        ast: true,
        code: false,
        configFile: false,
        babelrc: false,
      });
      const manquants = [];
      traverse(out.ast, {
        Program(chemin) {
          // `crawl()` est INDISPENSABLE : la transformation des imports ESM en
          // CommonJS crée de nouvelles liaisons que la portée mémorisée ignore.
          // Sans lui, tout symbole importé ressort comme manquant — quinze
          // fichiers en faux positif, et un test qu'on aurait fini par désactiver.
          chemin.scope.crawl();
          Object.keys(chemin.scope.globals || {}).forEach((nom) => {
            if (!FOURNIS.has(nom) && !estAuxiliaire(nom)) manquants.push(nom);
          });
        },
      });
      expect(manquants).toEqual([]);
    },
  );
});
