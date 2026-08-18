const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;

/**
 * Filet contre les hooks déclarés APRÈS un retour anticipé.
 *
 * React exige que le nombre de hooks soit identique à chaque rendu. Un
 * `useState` placé sous un `if (…) return null` en viole la règle : tant que la
 * condition ne bascule pas, tout va bien, et le jour où elle bascule l'app
 * s'arrête net. Rien ne le signale avant — ni Babel, ni `expo export`, ni la
 * publication.
 *
 * C'est arrivé dans AreaChart : les hooks de la lecture au doigt avaient été
 * ajoutés au milieu du composant, sous le `if (n < 2) return null` qui existait
 * depuis toujours. Marco a vu l'écran Stats se fermer.
 *
 * Le projet n'a pas de configuration ESLint utilisable ; ce test tient lieu de
 * règle `rules-of-hooks`.
 */

const HOOKS = /^use[A-Z]/;
const RACINE = path.join(__dirname, '..');
const DOSSIERS = ['components', 'screens', 'context'];

function fichiers(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Les hooks appelés après un `return` du corps de la fonction, s'il y en a. */
function hooksApresRetour(corps) {
  let vuRetour = false;
  const fautifs = [];
  for (const noeud of corps) {
    if (noeud.type === 'ReturnStatement') { vuRetour = true; continue; }
    // Un `if (…) return …` sans accolades, ou avec : c'est le motif exact du bug.
    if (noeud.type === 'IfStatement') {
      const branches = [noeud.consequent, noeud.alternate].filter(Boolean);
      for (const b of branches) {
        if (b.type === 'ReturnStatement') vuRetour = true;
        else if (b.type === 'BlockStatement'
          && b.body.some((x) => x.type === 'ReturnStatement')) vuRetour = true;
      }
      continue;
    }
    if (!vuRetour) continue;
    // Passé un retour : tout appel de hook au premier niveau est fautif.
    babel.types.traverseFast(noeud, (n) => {
      if (n.type !== 'CallExpression') return;
      const nom = n.callee.name
        ?? (n.callee.type === 'MemberExpression' ? n.callee.property?.name : null);
      if (nom && HOOKS.test(nom)) fautifs.push(nom);
    });
  }
  return fautifs;
}

describe('aucun hook après un retour anticipé', () => {
  const tous = DOSSIERS.flatMap((d) => fichiers(path.join(RACINE, d)));

  test.each(tous.map((f) => [path.relative(RACINE, f), f]))('%s', (rel, abs) => {
    const code = fs.readFileSync(abs, 'utf8');
    const ast = babel.parseSync(code, {
      filename: abs, presets: ['babel-preset-expo'], ast: true, code: false,
    });

    const problemes = [];
    traverse(ast, {
      Function(chemin) {
        const corps = chemin.node.body;
        if (!corps || corps.type !== 'BlockStatement') return;
        // Seuls les composants et les hooks personnalisés portent des hooks.
        const nom = chemin.node.id?.name
          ?? chemin.parent?.id?.name
          ?? chemin.parent?.key?.name;
        if (!nom || !(/^[A-Z]/.test(nom) || HOOKS.test(nom))) return;
        const fautifs = hooksApresRetour(corps.body);
        if (fautifs.length) problemes.push(`${nom} → ${[...new Set(fautifs)].join(', ')}`);
      },
    });

    expect(`${rel}: ${problemes.join(' | ')}`).toBe(`${rel}: `);
  });
});
