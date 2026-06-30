import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { makeSession, invaderIdsInRange } from '../utils/session';
import { BADGES, evaluateBadges, getBadge } from '../data/badges';
import { loadSessions, addSession } from '../services/sessionStore';
import { loadUnlocked, saveUnlocked } from '../services/badgeStore';

const Ctx = createContext(null);

export function GamificationProvider({ children }) {
  const { flashedDates, getFlashHistory, loaded: appLoaded } = useAppContext();

  const [sessions, setSessions] = useState([]);
  const [unlocked, setUnlocked] = useState({});      // { id: ISO }
  const [queue, setQueue] = useState([]);            // ids à célébrer (FIFO)
  const [pendingRecap, setPendingRecap] = useState(null); // session à afficher en récap
  const [loaded, setLoaded] = useState(false);

  const unlockedRef = useRef({});
  unlockedRef.current = unlocked;

  // Chargement initial
  useEffect(() => {
    (async () => {
      const [s, u] = await Promise.all([loadSessions(), loadUnlocked()]);
      setSessions(s);
      setUnlocked(u);
      setLoaded(true);
    })();
  }, []);

  // Débloque des badges. celebrate=true → pousse dans la file de célébration
  // (pour les déblocages hors session) ; false → silencieux (affichés dans le récap).
  const unlockIds = useCallback((newIds, { celebrate } = {}) => {
    if (!newIds.length) return;
    const now = new Date().toISOString();
    const nu = { ...unlockedRef.current };
    for (const id of newIds) nu[id] = now;
    unlockedRef.current = nu;
    setUnlocked(nu);
    saveUnlocked(nu);
    if (celebrate) setQueue((q) => [...q, ...newIds]);
  }, []);

  /** Enregistre une session terminée, débloque les badges, prépare le récap. */
  const recordSession = useCallback(async (draft, opts = {}) => {
    const startMs = new Date(draft.startedAt).getTime();
    const endMs = new Date(draft.endedAt).getTime();
    const ids = invaderIdsInRange(flashedDates, startMs, endMs);
    const session = makeSession({ ...draft, invaderIds: ids });

    // Session « vide » (rien flashé, ~aucune distance) → on n'enregistre pas
    const empty = ids.length === 0 && (!session.distanceKm || session.distanceKm < 0.1);
    if (opts.skipIfEmpty && empty) return null;

    const nextSessions = await addSession(session);
    setSessions(nextSessions);

    const ctx = { session, sessions: nextSessions, flashHistory: getFlashHistory() };
    const newBadgeIds = evaluateBadges(ctx, unlockedRef.current);
    unlockIds(newBadgeIds, { celebrate: false }); // montrés dans le récap

    setPendingRecap({ session, newBadgeIds });
    return session;
  }, [flashedDates, getFlashHistory, unlockIds]);

  /** Vérifie les badges hors session (ex. après un flash : Oiseau de nuit…). */
  const checkBadges = useCallback(() => {
    const ctx = { session: null, sessions, flashHistory: getFlashHistory() };
    unlockIds(evaluateBadges(ctx, unlockedRef.current), { celebrate: true });
  }, [sessions, getFlashHistory, unlockIds]);

  const dismissCelebration = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clearRecap = useCallback(() => setPendingRecap(null), []);

  // Badges enrichis (def + état) pour la galerie
  const badges = useMemo(
    () => BADGES.map((b) => ({ ...b, unlockedAt: unlocked[b.id] ?? null })),
    [unlocked]
  );
  const unlockedCount = useMemo(() => Object.keys(unlocked).length, [unlocked]);
  const celebration = queue.length ? getBadge(queue[0]) : null;

  const value = {
    loaded: loaded && appLoaded,
    sessions,
    badges,
    unlockedCount,
    totalBadges: BADGES.length,
    recordSession,
    checkBadges,
    celebration,
    dismissCelebration,
    pendingRecap,
    clearRecap,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGamification() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGamification doit être utilisé dans GamificationProvider');
  return ctx;
}
