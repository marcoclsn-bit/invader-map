/**
 * Faut-il resonder FlashInvaders au retour au premier plan, et en forçant ?
 *
 * Extrait de SyncBanner pour la même raison que gridLayout : cinq lignes
 * d'arithmétique dont personne ne voit l'erreur, et dont dépend une
 * fonctionnalité entière. Ici, l'erreur était invisible d'une manière
 * particulière — le bandeau finissait TOUJOURS par apparaître, un lancement plus
 * tard, si bien que rien ne semblait cassé.
 *
 * Le geste réel de la chasse : on flashe dans FlashInvaders, on revient ici.
 * L'aller-retour prend moins d'une minute, donc le repos d'une minute destiné à
 * empêcher les sondages en rafale tombait exactement dessus. Il faut le lever
 * pour ce cas-là, et lui seul.
 *
 * @param {object} p
 * @param {string} p.etat            état AppState reçu ('active', 'background', 'inactive')
 * @param {number} p.partiEnFond     instant du dernier passage hors du premier plan (0 = jamais)
 * @param {number} p.maintenant      instant courant
 * @param {boolean} p.enAttente      un bandeau est affiché et attend une réponse
 * @param {number} [p.seuilRetour]   absence minimale pour parler d'un aller-retour
 * @returns {null | { force: boolean }} null = ne rien faire
 */
export function decisionRetour({ etat, partiEnFond, maintenant, enAttente, seuilRetour = 3000 }) {
  // Tout état non actif est un départ : on note l'heure et on s'arrête.
  if (etat !== 'active') return null;
  // Un bandeau déjà affiché attend une réponse ; le serveur n'a rien de plus à
  // dire, et le resonder écraserait une liste que l'utilisateur est en train de
  // lire.
  if (enAttente) return null;
  // Jamais parti (premier passage à 'active' après le montage) : sondage normal,
  // soumis au repos, puisque l'effet vient déjà d'en lancer un.
  if (!partiEnFond) return { force: false };
  return { force: maintenant - partiEnFond >= seuilRetour };
}

export default decisionRetour;
