import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
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
 * mode n'existerait que pour les prochains installés, soit personne aujourd'hui.
 *
 * DEUX étapes, et l'activation seulement à la seconde. Le premier panneau dit
 * pourquoi le mode existe, le second ce qui va concrètement changer. Un bouton
 * unique aurait laissé activer sans avoir rien lu, or c'est un mode qui vide la
 * carte : quelqu'un qui n'a pas compris pourquoi conclura que l'app est cassée.
 * Le libellé de la première étape est donc « En savoir plus » et non « Essayer »,
 * puisqu'il n'active rien : l'appeler autrement serait le premier malentendu.
 */
export default function ExplorerIntro() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { loaded, showOnboarding, explorerIntroSeen, dismissExplorerIntro, setExplorer, explorer } = useAppContext();

  // `explorer` déjà actif : proposer d'essayer ce qu'on utilise n'a aucun sens.
  // Le cas arrive à qui a trouvé le réglage avant que la présentation ne sorte.
  if (!loaded || showOnboarding || explorerIntroSeen || explorer) return null;

  const [etape, setEtape] = useState(1);

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

          <Text style={st.titre}>
            {t(etape === 1 ? 'explorer.intro.title' : 'explorer.intro.step2Title')}
          </Text>

          {/* Défilable : le second panneau est long, et sur un petit écran les
              boutons doivent rester atteignables sans tronquer le texte. */}
          <ScrollView style={st.zone} contentContainerStyle={{ paddingBottom: 4 }}>
            {etape === 1 ? (
              <Text style={st.corps}>{t('explorer.intro.body')}</Text>
            ) : (
              [['s1t', 's1b'], ['s2t', 's2b'], ['s3t', 's3b']].map(([ti, bo]) => (
                <View key={ti} style={st.bloc}>
                  <Text style={st.blocTitre}>{t(`explorer.intro.${ti}`)}</Text>
                  <Text style={st.blocCorps}>{t(`explorer.intro.${bo}`)}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={st.actions}>
            {etape === 1 ? (
              <>
                <TouchableOpacity style={[st.bouton, st.boutonPlein]} onPress={() => setEtape(2)} activeOpacity={0.85}>
                  <Text style={st.boutonPleinTexte}>{t('explorer.intro.more')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.bouton, st.boutonGhost]} onPress={() => repondre(false)} activeOpacity={0.85}>
                  <Text style={st.boutonGhostTexte}>{t('explorer.intro.keep')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={[st.bouton, st.boutonPlein]} onPress={() => repondre(true)} activeOpacity={0.85}>
                  <Text style={st.boutonPleinTexte}>{t('explorer.intro.activate')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.bouton, st.boutonGhost]} onPress={() => setEtape(1)} activeOpacity={0.85}>
                  <Text style={st.boutonGhostTexte}>{t('explorer.intro.back')}</Text>
                </TouchableOpacity>
              </>
            )}
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
    zone: { maxHeight: 380 },
    corps: { fontSize: 13.5, color: t.textPrimary, lineHeight: 20 },
    bloc: { marginBottom: 14 },
    blocTitre: { fontSize: 13.5, fontWeight: '700', color: t.textPrimary, lineHeight: 19 },
    blocCorps: { fontSize: 13, color: t.textSecondary, lineHeight: 18, marginTop: 3 },
    // Empilés, et non côte à côte : « Continuer comme avant » passait sur deux
    // lignes là où « Essayer » en tenait une, et le bouton plein s'étirait à la
    // même hauteur, son libellé flottait au milieu d'une boîte trop grande.
    // Une colonne rend la mise en page indifférente à la longueur des libellés,
    // y compris dans les trois autres langues.
    actions: { gap: 10, marginTop: 20 },
    bouton: { paddingVertical: 13, borderRadius: 11, alignItems: 'center' },
    boutonGhost: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    boutonGhostTexte: { fontSize: 13, fontWeight: '600', color: t.textSecondary, textAlign: 'center' },
    boutonPlein: { backgroundColor: t.accent },
    boutonPleinTexte: { fontSize: 13, fontWeight: '700', color: t.bg, textAlign: 'center' },
  });
}
