// Invitation à activer la couche « Lieux à voir ». Affichée UNE fois sur la
// carte, avec la carte visible derrière : la fonctionnalité devient concrète au
// moment où on la propose.
//
// Pourquoi ici et pas dans l'onboarding : celui-ci est gardé par un simple
// booléen sans version, donc un utilisateur déjà installé ne le reverrait
// jamais. Un encart sur la carte atteint tout le monde.

import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { POI_FAMILIES } from '../data/poiFamilies';
import { getPois } from '../services/poiData';

let _cache = null;
function getStyles(theme) {
  if (_cache?.theme === theme) return _cache.styles;
  const styles = makeStyles(theme);
  _cache = { theme, styles };
  return styles;
}

export default function PoiIntroCard({ cityCode, style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { poiPrefs, setPoiPref, togglePoiFamily, dismissPoiIntro } = useAppContext();
  const styles = getStyles(theme);
  const count = getPois(cityCode).length;
  // La couche est allumée par défaut depuis que les lieux sont notre promesse.
  // Deux publics voient donc cette carte, et il faut leur parler différemment :
  //   • nouvelle installation → les lieux sont DÉJÀ là, on les présente ;
  //   • mise à jour d'un ancien utilisateur → la couche est éteinte, on la propose.
  // Sans cette distinction, un nouveau venu lisait « Afficher sur la carte » pour
  // quelque chose qu'il avait déjà sous les yeux, et « Nouveau » pour une
  // fonctionnalité qu'il n'avait jamais connue autrement.
  const dejaActive = poiPrefs.enabled;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.diamond} />
        <Text style={styles.title}>{dejaActive ? t('poi.section') : t('poi.intro.title')}</Text>
        <TouchableOpacity onPress={dismissPoiIntro} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.body}>{t(dejaActive ? 'poi.intro.bodyOn' : 'poi.intro.body', { count })}</Text>
      <Text style={styles.question}>{t('poi.intro.question')}</Text>

      <ScrollView style={styles.famScroll} contentContainerStyle={styles.famRow} showsVerticalScrollIndicator={false}>
        {POI_FAMILIES.map(({ key, icon }) => {
          const active = poiPrefs.families.has(key);
          return (
            <TouchableOpacity
              key={key}
              onPress={() => togglePoiFamily(key)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: theme.accentScore, borderColor: theme.accentScore }
                  : { backgroundColor: 'transparent', borderColor: theme.border },
              ]}
            >
              <Ionicons name={icon} size={14} color={active ? theme.bg : theme.textSecondary} />
              <Text style={[styles.chipText, { color: active ? theme.bg : theme.textPrimary }]}>
                {t(`poi.family.${key}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.actions}>
        {/* « Plus tard » n'a de sens que s'il reste quelque chose à activer.
            La couche étant déjà visible, le proposer laisserait croire qu'on
            peut l'éteindre ici — ce que ce bouton ne fait pas. */}
        {!dejaActive && (
          <TouchableOpacity style={styles.btn} onPress={dismissPoiIntro} activeOpacity={0.85}>
            <Text style={styles.btnText}>{t('poi.intro.later')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => { if (!dejaActive) setPoiPref({ enabled: true }); dismissPoiIntro(); }}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {t(dejaActive ? 'poi.intro.gotIt' : 'poi.intro.enable')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    card: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: t.surface, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.accentScore,
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    diamond: { width: 14, height: 14, borderRadius: 3, backgroundColor: t.accentScore, transform: [{ rotate: '45deg' }] },
    title: { flex: 1, ...typography.arcadeHeading, fontSize: 14, color: t.accentScore },
    body: { marginTop: 12, fontSize: 14, lineHeight: 20, color: t.textPrimary },
    question: { marginTop: 10, fontSize: 12.5, color: t.textSecondary },
    famScroll: { maxHeight: 132, marginTop: 10 },
    famRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5,
    },
    chipText: { fontSize: 12, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    btn: {
      flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
      backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.border,
    },
    btnText: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    btnPrimary: { flex: 1.4, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: t.accentScore },
    btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#221A00' },
  });
}
