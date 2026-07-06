import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import {
  persistCandidates, persistNotifStrings, startStroll, stopStroll,
} from '../services/strollEngine';
import { focusInvaderOnMap } from '../utils/navigationRef';

// ─────────────────────────────────────────────────────────────────────────────
// Pont React → moteur de proximité (services/strollEngine).
// - Tient à jour les « candidats » (Invaders non flashés, non détruits) et les
//   textes de notification dans AsyncStorage (lus par la tâche de fond).
// - Démarre/arrête le geofencing selon les réglages du Mode balade.
// Composant non visuel.
// ─────────────────────────────────────────────────────────────────────────────
export default function StrollEngine() {
  const { invaders, flashed, stroll, currentCityCode, setCurrentCity, loaded } = useAppContext();
  const { t } = useTranslation();

  // Refs pour lire les valeurs fraîches dans les callbacks async
  const dataRef = useRef({ invaders, flashed, stroll, t, currentCityCode, setCurrentCity });
  dataRef.current = { invaders, flashed, stroll, t, currentCityCode, setCurrentCity };

  // Calcule + persiste les candidats de la ville courante.
  // Règle : statut dans les statuts choisis (défaut ok/endommagé/inconnu),
  //         JAMAIS détruit, JAMAIS flashé (déjà fait).
  async function syncCandidates() {
    const { invaders: inv, flashed: fl, stroll: s, t: tr } = dataRef.current;
    const allowed = new Set(
      Array.isArray(s.alertStatuses) && s.alertStatuses.length ? s.alertStatuses : ['ok', 'damaged', 'unknown']
    );
    const candidates = inv
      .filter(i => i.status !== 'destroyed' && allowed.has(i.status) && !fl.has(i.id))
      .map(i => ({ id: i.id, lat: i.lat, lng: i.lng }));
    // Variantes de texte (rotation aléatoire à chaque alerte) — persistées pour la tâche de fond.
    const bodies = tr('stroll.notif.bodies', { returnObjects: true, id: '{id}' });
    await persistNotifStrings(tr('stroll.notif.title'), Array.isArray(bodies) ? bodies : [bodies]);
    await persistCandidates(candidates);
    return candidates.length;
  }

  // Garde les candidats à jour tant que le mode tourne (flash, changement de ville…)
  useEffect(() => {
    if (!loaded || !stroll.enabled) return;
    syncCandidates();
  }, [loaded, stroll.enabled, stroll.alertStatuses, invaders, flashed, currentCityCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Démarre/arrête le geofencing selon enabled (et le relance si rayon/statuts changent)
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
  }, [loaded, stroll.enabled, stroll.radius, stroll.alertStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap sur une notification de proximité → carte + fiche de l'Invader
  useEffect(() => {
    function handleResponse(response) {
      const data = response?.notification?.request?.content?.data;
      if (data?.type !== 'stroll' || !data.invId) return;
      const { currentCityCode: cc, setCurrentCity: setCity } = dataRef.current;
      focusInvaderOnMap(data.invId, {
        onCity: (code) => { if (code && code !== cc) setCity(code); },
      });
    }

    // App lancée depuis une notif (démarrage à froid)
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) handleResponse(resp);
    }).catch(() => {});

    // App déjà ouverte / en arrière-plan
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);

  return null;
}
