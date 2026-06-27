import { STATUS_COLOR } from '../constants';

// Priorité : flashé (lbl_flashed) > colorOverride > couleur du statut
export function getMarkerColor(inv, labels, labelDefs, colorOverrides, statusColors, flashed) {
  if (flashed.has(inv.id)) {
    const flashedDef = labelDefs.find((d) => d.id === 'lbl_flashed');
    if (flashedDef) return flashedDef.color;
  }
  if (colorOverrides[inv.id]) return colorOverrides[inv.id];
  return statusColors[inv.status] ?? STATUS_COLOR[inv.status];
}
