import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import {
  persistCandidates, persistNotifStrings, startStroll, stopStroll,
} from '../services/strollEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Pont React → moteur de proximité (services/strollEngine).
// - Tient à jour les « candidats » (Invaders non flashés, non détruits) et les
//   textes de notification dans AsyncStorage (lus par la tâche de fond).
// - Démarre/arrête le geofencing selon les réglages du Mode balade.
// Composant non visuel.
// ─────────────────────────────────────────────────────────────────────────────
export default function StrollEngine() {
  const { invaders, flashed, stroll, currentCityCode, loaded } = useAppContext();
  const { t } = useTranslation();

  // Refs pour lire les valeurs fraîches dans les callbacks async
  const dataRef = useRef({ invaders, flashed, stroll, t });
  dataRef.current = { invaders, flashed, stroll, t };

  // Calcule + persiste les candidats (non flashés, non détruits) de la ville courante
  async function syncCandidates() {
    const { invaders: inv, flashed: fl, stroll: s, t: tr } = dataRef.current;
    const candidates = inv
      .filter(i => i.status !== 'destroyed' && (!s.unflashedOnly || !fl.has(i.id)))
      .map(i => ({ id: i.id, lat: i.lat, lng: i.lng }));
    await persistNotifStrings(tr('stroll.notif.title'), tr('stroll.notif.body', { id: '{id}' }));
    await persistCandidates(candidates);
    return candidates.length;
  }

  // Garde les candidats à jour tant que le mode tourne (flash, changement de ville…)
  useEffect(() => {
    if (!loaded || !stroll.enabled) return;
    syncCandidates();
  }, [loaded, stroll.enabled, stroll.unflashedOnly, invaders, flashed, currentCityCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Démarre/arrête le geofencing selon enabled (et le relance si rayon/cible changent)
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      if (stroll.enabled) {
        await syncCandidates();          // candidats à jour AVANT de poser les geofences
        if (!cancelled) await startStroll();
      } else {
        await stopStroll();
      }
    })();
    return () => { cancelled = true; };
  }, [loaded, stroll.enabled, stroll.radius, stroll.unflashedOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
