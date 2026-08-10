// ─────────────────────────────────────────────────────────────────────────────
// Adresse de destination des e-mails de feedback (boîte à idées + signalements
// de statut). Pour changer l'adresse plus tard, modifiez UNIQUEMENT cette ligne.
// Laissez '' pour ouvrir l'app mail sans destinataire pré-rempli.
export const FEEDBACK_EMAIL = 'invader.quest.app@gmail.com';
// ─────────────────────────────────────────────────────────────────────────────

// Couleurs par défaut des statuts (thème sombre — correspondent aux tokens dark)
export const STATUS_COLOR = {
  ok:        '#00E08A',
  damaged:   '#FFB02E',
  destroyed: '#FF4D4D',
  unknown:   '#7A8A82',
};

export const STATUS_LABEL = {
  ok: 'OK',
  damaged: 'Endommagé',
  destroyed: 'Détruit',
  unknown: 'Inconnu',
};

export const ALL_STATUSES = ['ok', 'damaged', 'destroyed', 'unknown'];

// Un Invader peut porter un statut absent de ALL_STATUSES : 'hidden' (« Non
// visible » chez invader-spotter — 24 cas, dont PA_1265 dans le Centre
// Pompidou), et demain n'importe quelle valeur nouvelle de la source amont.
// Le filtre de la carte est une liste blanche : sans ce repli, un statut non
// prévu disparaît de la carte SANS AUCUNE commande pour le faire revenir. C'est
// exactement ce qui est arrivé à 'hidden'. Tout ce qui n'est pas reconnu tombe
// donc dans le seau gris, coché par défaut.
export const statusKey = (status) => (ALL_STATUSES.includes(status) ? status : 'unknown');

// Le seau gris ne contient en pratique que des « non visibles » : c'est ce que
// disent la légende, la puce de filtre et le sélecteur de couleur. La fiche et
// la liste, elles, gardent le statut exact ('Non visible' vs 'Inconnu').
export const statusLabelKey = (status) =>
  (status === 'unknown' ? 'common.status.notVisible' : `common.status.${status}`);

export const DEFAULT_LABELS = {};

// Palette de couleurs pour le sélecteur (12 teintes harmonieuses)
export const PALETTE = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759',
  '#00C7BE', '#007AFF', '#5856D6', '#AF52DE',
  '#FF2D55', '#A2845E', '#8E8E93', '#1C1C1E',
];

// Étiquette système unique : lbl_flashed — gérée automatiquement via l'état flashé
// (donne sa couleur aux Invaders flashés). Les étiquettes personnalisées ont été retirées.
export const DEFAULT_LABEL_DEFS = [
  // Violet et non plus vert : le vert des flashés se distinguait mal du vert
  // « OK », 22° de teinte d'écart et surtout un simple écart de luminosité, le
  // signal le plus fragile en plein soleil. Simulé en deutéranopie, les deux
  // verts et le rouge « détruit » viraient à trois jaunes grisâtres presque
  // identiques. Le violet est à plus de 90° de tous les autres marqueurs.
  // Doit rester en accord avec assets/markers/alien_flashed.png.
  { id: 'lbl_flashed', name: 'Déjà flashé', color: '#9547FB', isDefault: true, system: true },
];
