export const STATUS_COLOR = {
  ok: '#34C759',
  damaged: '#FF9500',
  destroyed: '#FF3B30',
  unknown: '#8E8E93',
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

// Étiquettes prédéfinies (recolorables, non supprimables)
// lbl_flashed : étiquette système — gérée automatiquement via l'état flashé, non assignable manuellement
export const DEFAULT_LABEL_DEFS = [
  { id: 'lbl_flashed', name: 'Déjà flashé', color: '#5856D6', isDefault: true, system: true },
  { id: 'lbl_voir',    name: 'À voir',       color: '#007AFF', isDefault: true },
  { id: 'lbl_favori',  name: 'Favori',       color: '#FFCC00', isDefault: true },
];
