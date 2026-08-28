const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ─── satellite.js : neutraliser le sous-arbre WASM ────────────────────────────
//
// satellite.js 7.x ré-exporte un propagateur WebAssembly via une seule ligne de
// `dist/index.js` : `export * from './wasm/index.js'`. Ce sous-arbre charge un
// module qui utilise `import.meta`, non supporté par Hermes — et de toute façon
// React Native n'exécute pas de WebAssembly. Le bundling échoue donc dessus.
//
// On n'utilise QUE le SGP4 pur-JS (twoline2satrec, propagate, gstime, transforms,
// lignes 2 à 12 de dist/index.js). On remplace donc l'import du sous-arbre WASM,
// et lui seul, par un module vide : le reste du paquet est inchangé.
const resolveOrig = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origine = (context.originModulePath || '').replace(/\\/g, '/');
  if (moduleName === './wasm/index.js' && origine.endsWith('satellite.js/dist/index.js')) {
    return { type: 'empty' };
  }
  return (resolveOrig || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
