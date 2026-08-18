import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { makeSession, invaderIdsInRange } from '../utils/session';
import { BADGES, evaluateBadges, getBadge } from '../data/badges';
import { loadSessions, addSession } from '../services/sessionStore';
import { loadUnlocked, saveUnlocked } from '../services/badgeStore';
import { track } from '../services/analytics';

const Ctx = createContext(null);

export function GamificationProvider({ children }) {
  const {
    flashed, flashedDates, getFlashHistory, loaded: appLoaded,
    invaders, currentCityCode, cityIndex, news, cityProgress,
  } = useAppContext();

  // Contexte étendu passé aux prédicats (points, villes terminées, statuts de la
  // ville active, actus…). Via ref pour éviter des closures périmées.
  const extraCtxRef = useRef({});
  extraCtxRef.current = { invaders, currentCityCode, cityIndex, news, cityProgress };

  const [sessions, setSessions] = useState([]);
  const [unlocked, setUnlocked] = useState({});      // { id: ISO }
  const [queue, setQueue] = useState([]);            // ids à célébrer (FIFO)
  const [pendingRecap, setPendingRecap] = useState(null); // session à afficher en récap
  const [loaded, setLoaded] = useState(false);
  const [batchBadges, setBatchBadges] = useState(null);   // récap groupé { ids } | null

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
    const session = makeSession({ ...draft, invaderIds: ids, poiIds: draft.poiIds ?? [] });

    // Session « vide » (rien flashé, ~aucune distance) → on n'enregistre pas
    const empty = ids.length === 0 && (!session.distanceKm || session.distanceKm < 0.1);
    if (opts.skipIfEmpty && empty) {
      // Événement le plus révélateur du tunnel : l'utilisateur a bien démarré et
      // terminé, mais rien n'a été capté. Distingue « personne ne démarre » de
      // « on démarre mais l'enregistrement ne marche pas ».
      track('recap_skipped', {
        source: session.source ?? 'unknown',
        distanceKm: Math.round((session.distanceKm ?? 0) * 100) / 100,
        durationMin: Math.round((session.durationSec ?? 0) / 60),
      });
      return null;
    }

    const nextSessions = await addSession(session);
    setSessions(nextSessions);

    const ctx = { session, sessions: nextSessions, flashHistory: getFlashHistory(), ...extraCtxRef.current };
    const newBadgeIds = evaluateBadges(ctx, unlockedRef.current);
    unlockIds(newBadgeIds, { celebrate: false }); // montrés dans le récap

    setPendingRecap({ session, newBadgeIds });
    track('recap_shown', {
      source: session.source ?? 'unknown',
      invaders: ids.length,
      distanceKm: Math.round((session.distanceKm ?? 0) * 10) / 10,
      durationMin: Math.round((session.durationSec ?? 0) / 60),
      badges: newBadgeIds.length,
      pois: session.poiIds?.length ?? 0,
    });
    return session;
  }, [flashedDates, getFlashHistory, unlockIds]);

  /** Vérifie les badges hors session (ex. après un flash : Oiseau de nuit…). */
  const checkBadges = useCallback(() => {
    const ctx = { session: null, sessions, flashHistory: getFlashHistory(), ...extraCtxRef.current };
    unlockIds(evaluateBadges(ctx, unlockedRef.current), { celebrate: true });
  }, [sessions, getFlashHistory, unlockIds]);

  // Évaluation AUTOMATIQUE à chaque changement de flashs (Carte, Trajet, Chasse,
  // Liste…). C'est ce qui débloque les badges hors session (speedrunner, combos,
  // oiseau de nuit, explorateur, centurion…) sans attendre une fin de session.
  // 1er passage après chargement = SILENCIEUX (marque les badges déjà mérités par
  // l'historique sans déclencher une rafale de célébrations au démarrage).
  const primed = useRef(false);
  useEffect(() => {
    if (!(loaded && appLoaded)) return;
    const ctx = { session: null, sessions, flashHistory: getFlashHistory(), ...extraCtxRef.current };
    const newIds = evaluateBadges(ctx, unlockedRef.current);
    // Pendant une fenêtre groupée, on débloque en silence et on accumule : les
    // trophées seront annoncés une seule fois, à la fermeture de la fenêtre.
    const groupe = Date.now() < batchUntilRef.current;
    unlockIds(newIds, { celebrate: primed.current && !groupe });
    if (groupe && newIds.length) batchIdsRef.current.push(...newIds);
    primed.current = true;
    // cityProgress dans les deps : les trophées points/villes dépendent du registre
    // (qui se met à jour ~500 ms après un flash).
  }, [flashed, flashedDates, cityProgress, loaded, appLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissCelebration = useCallback(() => setQueue((q) => q.slice(1)), []);
  const clearRecap = useCallback(() => setPendingRecap(null), []);

  /**
   * Affiche un récap SANS RIEN ENREGISTRER.
   *
   * `recordSession` fait deux choses qu'on avait fini par confondre : il montre
   * le récap, et il écrit la session dans l'historique. Pour une sortie
   * reconstituée après coup, seul le premier est voulu — `addSession` empile
   * sans dédupliquer, donc partager deux fois la même balade créerait deux
   * sessions, fausserait Stats, et débloquerait le badge des dix sessions à
   * coups de partages répétés.
   *
   * Les badges ne sont pas réévalués non plus, et c'est correct : ceux qui
   * dépendent des flashs le sont déjà automatiquement à chaque flash (voir
   * l'effet plus haut). Seuls ceux qui comptent les SESSIONS diffèrent, et
   * ceux-là ne doivent justement pas se déclencher sur un geste de partage.
   */
  const previewRecap = useCallback((session) => {
    if (!session?.invaderIds?.length) return null;
    setPendingRecap({ session, newBadgeIds: [] });
    track('recap_preview', {
      source: session.source ?? 'unknown',
      invaders: session.invaderIds.length,
      durationMin: Math.round((session.durationSec ?? 0) / 60),
    });
    return session;
  }, []);

  // ─── Déblocages groupés (« tout marquer », import d'une liste) ──────────────
  //
  // Un marquage en lot peut franchir dix paliers d'un coup. Célébrés un par un,
  // ça fait dix cartes de 3,5 s enchaînées : l'utilisateur est prisonnier de
  // l'animation pendant plus d'une demi-minute pour une action qu'il a demandée
  // une seule fois.
  //
  // On ouvre donc une fenêtre : pendant sa durée, les trophées sont débloqués
  // sans célébration et accumulés, puis annoncés en un seul écran.
  //
  // Pourquoi une fenêtre de temps plutôt qu'un simple drapeau refermé après le
  // premier passage : l'effet ci-dessus se déclenche DEUX fois pour un même lot,
  // une fois sur `flashed`, une autre ~500 ms plus tard sur `cityProgress` (les
  // trophées de points et de villes dépendent du registre, qui se met à jour
  // après coup). Un drapeau à un coup laisserait la seconde vague célébrer une
  // par une, ce qui est précisément le défaut qu'on corrige.
  const BATCH_WINDOW_MS = 2500;
  const batchUntilRef = useRef(0);
  const batchIdsRef = useRef([]);
  const batchTimerRef = useRef(null);

  const beginBatch = useCallback(() => {
    batchUntilRef.current = Date.now() + BATCH_WINDOW_MS;
    batchIdsRef.current = [];
    clearTimeout(batchTimerRef.current);
    batchTimerRef.current = setTimeout(() => {
      batchUntilRef.current = 0;
      const ids = batchIdsRef.current;
      batchIdsRef.current = [];
      if (ids.length) setBatchBadges({ ids });
    }, BATCH_WINDOW_MS);
  }, []);

  useEffect(() => () => clearTimeout(batchTimerRef.current), []);

  const clearBatchBadges = useCallback(() => setBatchBadges(null), []);

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
    previewRecap,
    beginBatch,
    batchBadges,
    clearBatchBadges,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGamification() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGamification doit être utilisé dans GamificationProvider');
  return ctx;
}
