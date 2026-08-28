import * as Notifications from 'expo-notifications';
import i18n from '../i18n';
import { planNotificationsISS, armePour } from '../utils/issNotifications';

/**
 * Programmation des rappels ISS — la couche OS au-dessus du calendrier pur
 * (`utils/issNotifications.js`, qui décide QUAND ; ici on décide COMMENT).
 *
 * Principe : annuler-puis-reprogrammer. À chaque synchronisation on retire
 * toutes les notifications marquées `type: 'iss'` (et elles seules : celles de
 * la Balade et des Actus ont leurs propres types), puis on reprogramme depuis
 * l'état courant. Pas d'état à réconcilier, pas de doublon possible, et un
 * passage désarmé disparaît vraiment.
 *
 * Budget : iOS plafonne à 64 notifications programmées, partagées avec le reste
 * de l'app. On limite aux 8 premiers passages armés (2 rappels chacun au plus),
 * soit 16 : très en dessous, et de toute façon au-delà de 16 jours les heures
 * de passage ne sont plus assez sûres pour mériter un réveil.
 */

const MAX_PASSAGES = 8;


// Même son que l'alerte de proximité (Balade) : déjà embarqué dans le binaire.
// Seule l'alerte imminente sonne fort ; le rappel de la veille reste sobre.
const SON_IMMINENT = 'alerte_arcade_grave.wav';

// L'heure DU LIEU observé : la phrase dit « au zénith de {{city}} », elle doit
// donc porter l'heure qu'il sera là-bas. `timeZone: undefined` retombe sur celui
// de l'appareil, ce qui couvre les villes mémorisées avant l'ajout des fuseaux.
const heureLocale = (ms, fuseau) =>
  new Date(ms).toLocaleTimeString(i18n.language, {
    hour: '2-digit', minute: '2-digit', timeZone: fuseau || undefined,
  });

function contenu(entree, lieuNom, fuseau) {
  const p = entree.passage;
  const heure = heureLocale(p.picMs, fuseau);
  const sec = Math.max(1, Math.round((p.flashableFinMs - p.flashableDebutMs) / 1000));

  if (entree.type === 'veille') {
    return {
      title: i18n.t('iss.notif.veilleTitle'),
      body: i18n.t('iss.notif.veilleBody', { time: heure, city: lieuNom, sec }),
      sound: true,
    };
  }
  return {
    title: i18n.t('iss.notif.imminentTitle'),
    body: i18n.t('iss.notif.imminentBody', { time: heure, sec }),
    sound: SON_IMMINENT,
  };
}

/**
 * Ce que le SYSTÈME a réellement en attente pour nous — pas ce qu'on croit lui
 * avoir demandé. Sert à afficher une confirmation vérifiable : sans elle, une
 * permission refusée ou un échec silencieux passerait inaperçu.
 * @returns {Promise<number>}
 */
export async function compterNotificationsISS() {
  try {
    const tout = await Notifications.getAllScheduledNotificationsAsync();
    return tout.filter((n) => n?.content?.data?.type === 'iss').length;
  } catch {
    return 0;
  }
}

/** Demande la permission notifications. À appeler sur GESTE (l'armement d'une
 *  cloche), jamais au montage : règle Google Play. Rend true si accordée. */
export async function demanderPermissionISS() {
  try {
    const etat = await Notifications.getPermissionsAsync();
    if (etat.granted) return true;
    const res = await Notifications.requestPermissionsAsync();
    return !!res.granted;
  } catch {
    return false;
  }
}

/**
 * Aligne les notifications programmées sur l'état courant de l'écran.
 * @param {Array} passages  sortie de passagesISS (triée par date)
 * @param {Set<number>} armes  les picMs dont la cloche est armée
 * @param {string} lieuNom  nom de la ville affichée dans les textes
 * @param {string} [fuseau]  fuseau IANA du lieu, pour l'heure citée dans le texte
 *
 * NOTE : le CALENDRIER (nuit ou heure ouvrable, d'où une ou deux alertes) reste
 * calculé sur le fuseau de l'APPAREIL, volontairement. Il décide du moment où le
 * téléphone sonne : c'est le sommeil de celui qui le tient qui compte, pas
 * l'heure qu'il est à l'autre bout du monde. Les deux coïncident dès qu'on est
 * dans la ville qu'on a choisie, c'est-à-dire dans le cas normal.
 * Ne lève jamais : au pire, silence (les rappels sont un confort).
 */
export async function synchroniserNotificationsISS(passages, armes, lieuNom, fuseau) {
  try {
    // 1. Purge des nôtres, et seulement des nôtres.
    const programmees = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      programmees
        .filter((n) => n?.content?.data?.type === 'iss')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );

    // 2. Reprogrammation depuis l'état courant.
    const vises = (passages || [])
      .filter((p) => armePour(armes, p.picMs) !== null)
      .slice(0, MAX_PASSAGES);
    if (vises.length === 0) return;

    const plan = planNotificationsISS(vises, Date.now(), MAX_PASSAGES);
    await Promise.all(
      plan.map((e) =>
        Notifications.scheduleNotificationAsync({
          content: {
            ...contenu(e, lieuNom, fuseau),
            data: { type: 'iss', picMs: e.passage.picMs },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(e.quandMs),
          },
        }).catch(() => {}),
      ),
    );
  } catch {
    /* jamais bloquant */
  }
}

export default synchroniserNotificationsISS;
