import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { track } from '../services/analytics';

/**
 * Présentation du mode explorateur aux utilisateurs DÉJÀ installés.
 *
 * L'onboarding porte le choix pour les nouveaux, mais il ne les reverra jamais :
 * `@invader_onboarding_done` vaut déjà 1 chez tous les utilisateurs actuels, et
 * un envoi par-dessus les airs ne le remet pas à zéro. Sans ce second chemin, le
 * mode n'existerait que pour les prochains installés — soit personne aujourd'hui.
 *
 * Une seule apparition, deux réponses également valables, et le refus est à
 * gauche : on propose une contrainte supplémentaire, ce n'est pas une mise à
 * jour à accepter. Rien ne se décide par défaut.
 */
export default function ExplorerIntro() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { loaded, showOnboarding, explorerIntroSeen, dismissExplorerIntro, setExplorer } = useAppContext();

  if (!loaded || showOnboarding || explorerIntroSeen) return null;

  const repondre = (on) => {
    track('explorer_intro', { choice: on ? 'on' : 'off' });
    if (on) setExplorer(true);
    dismissExplorerIntro();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => repondre(false)}>
      <View style={st.fond}>
        <View style={st.carte}>
          <View style={st.pastille}>
            <Ionicons name="eye-off-outline" size={22} color={theme.accent} />
          </View>

          <Text style={st.titre}>{t('explorer.intro.title')}</Text>
          <Text style={st.corps}>{t('explorer.intro.body')}</Text>
          <Text style={st.note}>{t('explorer.intro.note')}</Text>

          <View style={st.actions}>
            <TouchableOpacity style={[st.bouton, st.boutonGhost]} onPress={() => repondre(false)} activeOpacity={0.85}>
              <Text style={st.boutonGhostTexte}>{t('explorer.intro.keep')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.bouton, st.boutonPlein]} onPress={() => repondre(true)} activeOpacity={0.85}>
              <Text style={st.boutonPleinTexte}>{t('explorer.intro.tryIt')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    fond: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    carte: {
      width: '100%', maxWidth: 380, backgroundColor: t.surface, borderRadius: 18,
      padding: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    pastille: {
      width: 46, height: 46, borderRadius: 23, backgroundColor: t.accentDim,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    titre: { ...typography.arcadeHeading, fontSize: 15, color: t.textPrimary, marginBottom: 10 },
    corps: { fontSize: 13.5, color: t.textPrimary, lineHeight: 20 },
    note: { fontSize: 12, color: t.textSecondary, lineHeight: 17, marginTop: 10 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    bouton: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center' },
    boutonGhost: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    boutonGhostTexte: { fontSize: 13, fontWeight: '600', color: t.textSecondary, textAlign: 'center' },
    boutonPlein: { backgroundColor: t.accent },
    boutonPleinTexte: { fontSize: 13, fontWeight: '700', color: t.bg, textAlign: 'center' },
  });
}
