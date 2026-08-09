import { STATUS_COLOR, statusKey } from '../constants';

// Priorité : flashé (lbl_flashed) > colorOverride > couleur du statut
export function getMarkerColor(inv, labels, labelDefs, colorOverrides, statusColors, flashed) {
  if (flashed.has(inv.id)) {
    const flashedDef = labelDefs.find((d) => d.id === 'lbl_flashed');
    if (flashedDef) return flashedDef.color;
  }
  if (colorOverrides[inv.id]) return colorOverrides[inv.id];
  const key = statusKey(inv.status);
  return statusColors[key] ?? STATUS_COLOR[key];
}
