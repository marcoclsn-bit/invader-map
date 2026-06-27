// ─────────────────────────────────────────────────────────────────────────────
// Adresse de destination des e-mails de feedback (boîte à idées + signalements
// de statut). Pour changer l'adresse plus tard, modifiez UNIQUEMENT cette ligne.
// Laissez '' pour ouvrir l'app mail sans destinataire pré-rempli.
export const FEEDBACK_EMAIL = 'marchenri.colson@gmail.com';
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
  { id: 'lbl_flashed', name: 'Déjà flashé', color: '#3DF96B', isDefault: true, system: true },
];
