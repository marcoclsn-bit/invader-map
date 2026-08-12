import { useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { track } from '../services/analytics';

/**
 * Ampoule d'indice, sur une ligne d'Invader, et son volet.
 *
 * Deux indices, et l'ordre n'est pas décoratif : ils ne révèlent pas la même
 * chose. Le gros plan montre la mosaïque seule, donc CE QU'ON CHERCHE, sans dire
 * où. Le plan large la montre sur son mur, donc OÙ ELLE EST : c'est la réponse.
 * D'où deux niveaux, le second explicitement annoncé comme révélant l'emplacement
 * et distingué visuellement, pour qu'on sache ce qu'on s'apprête à perdre.
 *
 * Volet maison et non `Alert` native : trois boutons empilés d'iOS ne peuvent pas
 * porter le sous-titre qui dit ce que chaque niveau dévoile, et le style tranche
 * avec le reste de l'app. Même grammaire que le volet du mode explorateur.
 *
 * Disponible même en mode explorateur, contrairement aux liens de la fiche :
 * un indice demandé volontairement, Invader par Invader, n'est pas l'app qui
 * dévoile, c'est le chasseur qui renonce.
 *
 * Aucune image n'est affichée ni mise en cache : liens sortants uniquement.
 */
export default function IndiceButton({ invader, style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const [ouvert, setOuvert] = useState(false);

  const zoom = invader?.photoUrl;
  const large = invader?.photoWideUrl;

  const fermer = useCallback(() => setOuvert(false), []);
  const ouvrir = useCallback((url, niveau) => {
    setOuvert(false);
    track('indice', { niveau, city: invader.id.slice(0, invader.id.lastIndexOf('_')) });
    Linking.openURL(url).catch(() => {});
  }, [invader]);

  if (!zoom && !large) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOuvert(true)}
        style={style}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('indice.a11y', { id: invader.id })}
      >
        <Ionicons name="bulb-outline" size={17} color={theme.accentScore} />
      </TouchableOpacity>

      <Modal visible={ouvert} transparent animationType="slide" onRequestClose={fermer}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={st.fond} onPress={fermer} />
          <View style={st.volet}>
            <View style={st.poignee} />

            <View style={st.entete}>
              <Ionicons name="bulb-outline" size={16} color={theme.accentScore} />
              <Text style={st.titre}>{t('indice.titre', { id: invader.id })}</Text>
              <TouchableOpacity onPress={fermer} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={st.corps}>{t('indice.corps')}</Text>

            {zoom ? (
              <TouchableOpacity style={st.option} onPress={() => ouvrir(zoom, 1)} activeOpacity={0.8}>
                <Ionicons name="scan-outline" size={20} color={theme.textPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={st.optionTitre}>{t('indice.niveau1')}</Text>
                  <Text style={st.optionSous}>{t('indice.niveau1Sub')}</Text>
                </View>
                <Ionicons name="open-outline" size={15} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null}

            {large ? (
              <TouchableOpacity style={[st.option, st.optionFort]} onPress={() => ouvrir(large, 2)} activeOpacity={0.8}>
                <Ionicons name="image-outline" size={20} color={theme.accentScore} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.optionTitre, { color: theme.accentScore }]}>{t('indice.niveau2')}</Text>
                  <Text style={st.optionSous}>{t('indice.niveau2Sub')}</Text>
                </View>
                <Ionicons name="open-outline" size={15} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : null}

            <Text style={st.source}>{t('indice.source')}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    volet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 18, borderTopRightRadius: 18,
      paddingHorizontal: 18, paddingTop: 8, paddingBottom: 32,
      borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    poignee: {
      alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
      backgroundColor: t.border, marginBottom: 14,
    },
    entete: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    titre: { ...typography.arcadeHeading, fontSize: 13, color: t.textPrimary, flex: 1 },
    corps: { fontSize: 13, color: t.textSecondary, lineHeight: 19, marginBottom: 14 },
    option: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.surfaceHigh, borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
    },
    optionFort: { borderColor: t.accentScore },
    optionTitre: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
    optionSous: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
    source: { fontSize: 11, color: t.textSecondary, textAlign: 'center', marginTop: 6 },
  });
}
