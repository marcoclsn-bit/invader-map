import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { useGamification } from '../context/GamificationContext';
import { getUid, getCompteConnu, setCompteConnu, sonderCompte, recupererGalerie } from '../services/flashinvaders';
import { track } from '../services/analytics';

/**
 * Bandeau « tu as flashé X Invaders depuis ta dernière visite ».
 *
 * PROPOSE, ne fait pas. On ne modifie pas la progression de quelqu'un sans le
 * lui dire : la synchronisation reste un geste de l'utilisateur, et un simple
 * appui suffit à la refuser.
 *
 * Sondage à deux étages. Le profil pèse 389 octets et porte déjà le nombre total
 * de flashs du compte ; la galerie en pèse 92 000. On ne télécharge donc la
 * seconde que si le compteur du serveur a bougé depuis la dernière
 * synchronisation réussie. Comparaison faite avec CE compteur-là, jamais avec le
 * total local, qui inclut les marquages manuels et diffère en permanence.
 *
 * Fusion ADDITIVE. Ce que FlashInvaders connaît et qu'on n'a pas est ajouté ; ce
 * qui a été coché à la main ici et n'existe pas là-bas est conservé. L'inverse
 * ferait disparaître le travail de l'utilisateur à la première synchronisation.
 *
 * Échoue en silence : pas de réseau, serveur fermé, UID révoqué, le bandeau ne
 * s'affiche simplement pas. C'est un confort, jamais un passage obligé.
 */
const REPOS_MS = 60000;   // pas plus d'un sondage par minute

export default function SyncBanner({ style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { flashed, bulkFlash } = useAppContext();
  const { beginBatch } = useGamification();

  const [nouveaux, setNouveaux] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [masque, setMasque] = useState(false);
  const dernierSondage = useRef(0);

  const sonder = useCallback(async () => {
    const maintenant = Date.now();
    if (maintenant - dernierSondage.current < REPOS_MS) return;
    dernierSondage.current = maintenant;

    const uid = await getUid();
    if (!uid) return;
    const compte = await sonderCompte(uid);
    if (compte == null) return;

    const connu = await getCompteConnu();
    if (connu == null) { await setCompteConnu(compte); return; }
    const ecart = compte - connu;
    if (ecart > 0) { setNouveaux(ecart); setMasque(false); }
  }, []);

  useEffect(() => {
    sonder();
    const sub = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') sonder();
    });
    return () => sub.remove();
  }, [sonder]);

  const synchroniser = useCallback(async () => {
    setEnCours(true);
    try {
      const uid = await getUid();
      const { ids } = await recupererGalerie(uid);
      const ajouts = ids.filter((id) => !flashed.has(id));
      if (ajouts.length) {
        beginBatch();      // sans la fenêtre groupée, dix paliers = dix célébrations
        bulkFlash(ajouts);
      }
      await setCompteConnu(ids.length);
      track('sync_applied', { added: ajouts.length });
      setNouveaux(0);
    } catch (e) {
      track('sync_echec', { motif: e?.motif || 'reseau' });
      setMasque(true);     // on ne harcèle pas : on réessaiera au prochain retour
    } finally {
      setEnCours(false);
    }
  }, [flashed, bulkFlash, beginBatch]);

  if (!nouveaux || masque) return null;

  return (
    <View style={[st.bandeau, style]}>
      <Ionicons name="sync-outline" size={17} color={theme.accent} />
      <Text style={st.texte} numberOfLines={2}>
        {t('sync.banner', { count: nouveaux })}
      </Text>
      <TouchableOpacity style={st.action} onPress={synchroniser} disabled={enCours} activeOpacity={0.8}>
        {enCours
          ? <ActivityIndicator size="small" color={theme.bg} />
          : <Text style={st.actionTexte}>{t('sync.action')}</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setMasque(true)} hitSlop={10} accessibilityLabel={t('common.cancel')}>
        <Ionicons name="close" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    bandeau: {
      position: 'absolute', left: 12, right: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.surface, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 11,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
    },
    texte: { flex: 1, fontSize: 13, color: t.textPrimary, lineHeight: 18 },
    action: {
      backgroundColor: t.accent, borderRadius: 9,
      paddingHorizontal: 12, paddingVertical: 7, minWidth: 92, alignItems: 'center',
    },
    actionTexte: { fontSize: 13, fontWeight: '700', color: t.bg },
  });
}
