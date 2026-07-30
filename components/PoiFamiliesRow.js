// Ligne récapitulative des familles de lieux, avec sa feuille de réglage.
//
// Remplace les sept pastilles affichées en clair dans le panneau de la Chasse.
// Deux raisons, et la seconde compte davantage que l'encombrement :
//
//   1. Le panneau de la Chasse empilait sept blocs de réglages. Sept pastilles
//      pour un filtre secondaire y pesaient autant que le budget temps.
//   2. Les retirer purement — comme le fait le Trajet aujourd'hui — rend le
//      filtre INVISIBLE. Quelqu'un ayant décoché « Musées » sur la Carte pour
//      désencombrer sa vue obtient des chasses sans musées sans jamais
//      comprendre pourquoi. Une ligne qui affiche l'état corrige les deux : elle
//      allège l'écran ET rend le réglage lisible.
//
// La feuille ne contient QUE les familles. Ouvrir le panneau de filtres complet
// de la Carte depuis la Chasse afficherait les statuts et le mode
// flashés/à faire, qui n'ont aucun effet sur une chasse — pire que de devoir
// revenir en arrière.

import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { POI_FAMILIES } from '../data/poiFamilies';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import PoiFamilyChips from './PoiFamilyChips';

export default function PoiFamiliesRow({ style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { poiPrefs, setPoiPref } = useAppContext();
  const [ouvert, setOuvert] = useState(false);
  const s = makeStyles(theme);

  const total = POI_FAMILIES.length;
  const n = poiPrefs.families.size;
  const resume = n === total ? t('poi.families.all')
    : n === 0 ? t('poi.families.none')
    : t('poi.families.some', { count: n, total });

  const toutes = () => setPoiPref({ families: new Set(POI_FAMILIES.map(f => f.key)) });

  return (
    <>
      <TouchableOpacity
        style={[s.ligne, style]}
        onPress={() => setOuvert(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${t('poi.section')}. ${resume}`}
        accessibilityHint={t('poi.families.edit')}
      >
        <Text style={s.label}>{t('poi.section')}</Text>
        {/* `n === 0` est un cas limite réel : aucune famille = aucun lieu dans la
            chasse. On le signale en couleur d'alerte plutôt qu'en gris discret. */}
        <Text style={[s.valeur, n === 0 && { color: theme.destructive }]} numberOfLines={1}>
          {resume}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      </TouchableOpacity>

      <Modal visible={ouvert} transparent animationType="slide" onRequestClose={() => setOuvert(false)}>
        <Pressable style={s.fond} onPress={() => setOuvert(false)}>
          {/* Pressable interne sans action : absorbe les touches pour qu'un
              appui DANS la feuille ne la referme pas. */}
          <Pressable style={s.feuille}>
            <View style={s.entete}>
              <Text style={s.titre}>{t('poi.section')}</Text>
              <TouchableOpacity
                onPress={() => setOuvert(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <PoiFamilyChips style={{ marginTop: 4 }} />

            {n < total && (
              <TouchableOpacity onPress={toutes} activeOpacity={0.7} style={s.tout}>
                <Text style={s.toutTexte}>{t('poi.families.selectAll')}</Text>
              </TouchableOpacity>
            )}

            <Text style={s.note}>{t('poi.families.shared')}</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    ligne: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, paddingHorizontal: 12, borderRadius: 10,
      backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.border,
    },
    label: { ...typography.fieldLabel, color: t.textSecondary },
    valeur: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: t.textPrimary },

    fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    feuille: {
      backgroundColor: t.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
      padding: 18, paddingBottom: 34, borderTopWidth: 1, borderColor: t.border,
    },
    entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    titre: { ...typography.arcadeHeading, fontSize: 15, color: t.textPrimary },
    tout: { alignSelf: 'flex-start', marginTop: 14 },
    toutTexte: { fontSize: 13, fontWeight: '700', color: t.link ?? t.accent },
    note: { fontSize: 11.5, color: t.textSecondary, marginTop: 16, lineHeight: 16 },
  });
}
