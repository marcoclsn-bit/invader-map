import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useSorties } from '../components/session/useSorties';
import { CITIES } from '../cities/registry';

// ─── Mes sorties ──────────────────────────────────────────────────────────────
//
// Reconstituées après coup depuis les horodatages des flashs — voir
// utils/sorties.js pour le pourquoi. Aucune n'est ENREGISTRÉE : cet écran ne
// fait qu'ouvrir le récap existant, par `previewRecap`. Une balade libre sur la
// carte devient donc partageable au même titre qu'un Trajet ou une Chasse, sans
// que rien n'ait eu à être déclenché au départ.
//
// La liste, et pas seulement la dernière : l'envie de partager arrive parfois
// plusieurs jours après. Le découpage produit la liste de toute façon.

function formatDuree(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

function Ligne({ sortie, theme, t, langue, onPress }) {
  const st = getStyles(theme);
  const debut = new Date(sortie.startedAt);
  const dureeSec = Math.max(0,
    Math.round((new Date(sortie.endedAt).getTime() - debut.getTime()) / 1000));
  const ville = CITIES[sortie.city]?.name ?? sortie.city;

  return (
    <TouchableOpacity style={st.ligne} onPress={onPress} activeOpacity={0.8}>
      <View style={st.ligneTexte}>
        <Text style={st.date}>
          {debut.toLocaleDateString(langue, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={st.detail}>
          {t('sorties.resume', { count: sortie.invaderIds.length, ville, duree: formatDuree(dureeSec) })}
        </Text>
      </View>
      <Ionicons name="share-social-outline" size={20} color={theme.accent} />
    </TouchableOpacity>
  );
}

export default function SortiesScreen({ navigation }) {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const st = getStyles(theme);
  const insets = useSafeAreaInsets();
  const { sorties, ouvrir } = useSorties();


  return (
    <View style={[st.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Les écrans du tiroir n'ont pas d'en-tête de navigation : chacun porte
          le sien, avec le seul chemin de retour vers le menu. */}
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={st.titre} numberOfLines={1}>{t('sorties.title')}</Text>
      </View>

      {sorties.length === 0 ? (
        <View style={st.vide}>
          <Ionicons name="footsteps-outline" size={44} color={theme.textSecondary} />
          <Text style={st.videTitre}>{t('sorties.emptyTitle')}</Text>
          <Text style={st.videCorps}>{t('sorties.emptyBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={sorties}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={<Text style={st.intro}>{t('sorties.intro')}</Text>}
          renderItem={({ item }) => (
            <Ligne
              sortie={item}
              theme={theme}
              t={t}
              langue={i18n.language}
              onPress={() => ouvrir(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={st.sep} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

let _cache = null;
function getStyles(theme) {
  if (_cache?.theme === theme) return _cache.styles;
  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
    },
    titre: { ...typography.arcadeTitle, color: theme.textPrimary, fontSize: 16, flex: 1 },
    intro: {
      fontSize: 13.5, lineHeight: 20, color: theme.textSecondary,
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    },
    ligne: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 20, paddingVertical: 14,
    },
    ligneTexte: { flex: 1, gap: 4 },
    date: { ...typography.arcadeHeading, fontSize: 12, color: theme.textPrimary },
    detail: { fontSize: 14, color: theme.textSecondary },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: 20 },
    vide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
    videTitre: { ...typography.arcadeHeading, fontSize: 13, color: theme.textPrimary, textAlign: 'center' },
    videCorps: { fontSize: 14, lineHeight: 21, color: theme.textSecondary, textAlign: 'center' },
  });
  _cache = { theme, styles };
  return styles;
}
