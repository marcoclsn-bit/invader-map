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
 * @param {number} [p.seuilRetour]   absence minimale pour parler d'un aller-retour
 * @returns {null | { force: boolean }} null = ne rien faire
 */
export function decisionRetour({ etat, partiEnFond, maintenant, seuilRetour = 3000 }) {
  // Tout état non actif est un départ : on note l'heure et on s'arrête.
  if (etat !== 'active') return null;
  // UN BANDEAU AFFICHÉ NE BLOQUE PLUS LE RESONDAGE. Il le bloquait, au motif
  // qu'il « attendait une réponse » — et ça cassait le geste central de la
  // chasse. On flashe une mosaïque, le bandeau annonce « 1 Invader ». On
  // retourne en flasher trois autres : au retour, le bandeau étant toujours à
  // l'écran, plus aucun sondage. Il continuait d'afficher 1, et il fallait
  // fermer et rouvrir l'app pour découvrir qu'il y en avait huit.
  //
  // Rien ne justifiait ce garde : la galerie de 92 Ko est déjà protégée par
  // `compteAnalyse`, qui interdit de la retélécharger tant que le compteur du
  // serveur n'a pas bougé. Et quand il a bougé, il y a précisément quelque
  // chose de nouveau à montrer. La liste ne fait que grandir : personne ne perd
  // ce qu'il était en train de lire.
  // Jamais parti (premier passage à 'active' après le montage) : sondage normal,
  // soumis au repos, puisque l'effet vient déjà d'en lancer un.
  if (!partiEnFond) return { force: false };
  return { force: maintenant - partiEnFond >= seuilRetour };
}

export default decisionRetour;
