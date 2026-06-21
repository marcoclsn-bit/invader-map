import { STATUS_COLOR } from '../constants';

// Priorité : flashé (lbl_flashed) > colorOverride > 1re étiquette > couleur du statut
export function getMarkerColor(inv, labels, labelDefs, colorOverrides, statusColors, flashed) {
  if (flashed.has(inv.id)) {
    const flashedDef = labelDefs.find((d) => d.id === 'lbl_flashed');
    if (flashedDef) return flashedDef.color;
  }
  if (colorOverrides[inv.id]) return colorOverrides[inv.id];
  const invLabelIds = labels[inv.id];
  if (invLabelIds?.length > 0) {
    const firstDef = labelDefs.find((d) => d.id === invLabelIds[0]);
    if (firstDef) return firstDef.color;
  }
  return statusColors[inv.status] ?? STATUS_COLOR[inv.status];
}
