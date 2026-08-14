/**
 * Disposition d'une grille à colonnes fixes, pour `getItemLayout`.
 *
 * LE PIÈGE, payé une fois : avec `numColumns`, FlatList ne transmet PAS un index
 * d'élément à `getItemLayout`, mais un index de RANGÉE. Vérifié dans le source de
 * React Native — `FlatList._getItemCount` rend `Math.ceil(data.length / numColumns)`
 * et `_getItem` rend un tableau de `numColumns` éléments par index. `getItemLayout`,
 * lui, est passé tel quel à VirtualizedList, sans enveloppe.
 *
 * J'avais écrit `offset: hauteur * Math.floor(index / colonnes)`, donc je divisais
 * par le nombre de colonnes un index qui l'était déjà. La liste calculait une
 * hauteur totale cinq fois trop petite et se croyait finie au cinquième : sur les
 * 1 351 cases de Paris, l'affichage s'arrêtait à 275 et le reste défilait dans le
 * noir. Rien ne plantait, aucune erreur — c'est ce qui rend ce défaut coûteux.
 *
 * D'où cette fonction isolée et testée : le calcul est trop discret pour vivre en
 * ligne dans un composant.
 *
 * L'écart entre rangées est INCLUS dans la hauteur rendue. Le style de la grille
 * doit donc poser cet écart sur la rangée elle-même (`marginBottom` du
 * `columnWrapperStyle`) et surtout PAS en `gap` sur le conteneur, sinon l'espace
 * serait compté deux fois et les décalages dériveraient à nouveau.
 */
export function dispositionRangee(index, tailleCase, ecart) {
  const hauteur = tailleCase + ecart;
  return { length: hauteur, offset: hauteur * index, index };
}

/** Hauteur totale d'une grille, utile aux tests et au diagnostic. */
export function hauteurGrille(nbElements, colonnes, tailleCase, ecart) {
  if (nbElements <= 0 || colonnes <= 0) return 0;
  return Math.ceil(nbElements / colonnes) * (tailleCase + ecart);
}
