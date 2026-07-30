// Réglage « Tu es plutôt… » — Chasseur / Curieux / Touriste.
//
// Remplace trois boutons de même poids par ce qu'ils sont réellement : trois
// positions sur UN MÊME AXE. En interne, POI_ALPHA vaut 0 → 0,4 → 0,8 ; l'ancien
// affichage en segments indépendants masquait ce continuum, et ses libellés
// nommaient un concept (« Équilibré » — entre quoi ?) au lieu d'un résultat.
//
// La bande colorée indique une POSITION entre deux priorités, pas la composition
// du parcours à venir. Ce choix vient d'une mesure : sur 878 chasses simulées,
// la part de lieux passe de 13,6 % à 19,5 % entre Curieux et Touriste. Une barre
// remplie aurait bougé de six points — invisible —, et le réglage aurait semblé
// sans effet. Pire, la formule interne (étapes × alpha ÷ 2) annonce 16,7 % et
// 28,6 % : la barre aurait surestimé les lieux d'une fois et demie.
//
// Le dégradé est dessiné à la main. expo-linear-gradient embarque du code natif :
// l'ajouter obligerait à recompiler et interdirait la mise à jour par OTA.

import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';

const CHOIX = ['pure', 'balanced', 'visit'];
const NUANCES = 22; // assez pour que la bande paraisse continue sur 4 dp de haut

const versRvb = (hex) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const melange = (a, b, t) => {
  const [r1, g1, b1] = versRvb(a);
  const [r2, g2, b2] = versRvb(b);
  const c = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
};

// `hintPrefix` : la Chasse et le Trajet n'expliquent pas la même chose. Là-bas
// l'objectif répartit un budget de TEMPS, ici il fixe seulement combien de lieux
// on retient dans un couloir — une distance. Les deux écrans gardent donc leurs
// propres phrases, seul le contrôle est mutualisé.
function ObjectivePicker({ value, onChange, style, hintPrefix = 'hunt.objective.hint_' }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const s = makeStyles(theme);
  const index = Math.max(0, CHOIX.indexOf(value));

  return (
    <View style={[s.bloc, style]}>
      <Text style={s.label}>{t('hunt.objective.label')}</Text>

      <View style={s.segments} accessibilityRole="radiogroup">
        {CHOIX.map((k) => {
          const actif = k === value;
          return (
            <TouchableOpacity
              key={k}
              style={[s.segment, actif && s.segmentActif]}
              onPress={() => onChange(k)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={`${t(`hunt.objective.${k}`)}. ${t(`${hintPrefix}${k}`)}`}
            >
              <Text style={[s.segmentTexte, actif && s.segmentTexteActif]} numberOfLines={1}>
                {t(`hunt.objective.${k}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Axe : vert (Invaders) → or (lieux). Le repère se place sous le segment
          choisi, ce qui relie visuellement le choix à sa position sur l'axe. */}
      <View style={s.axe} accessible={false} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: NUANCES }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              backgroundColor: melange(theme.accent, theme.accentScore, i / (NUANCES - 1)),
            }}
          />
        ))}
      </View>
      <View style={s.reperes} accessible={false} importantForAccessibility="no-hide-descendants">
        {CHOIX.map((k, i) => (
          <View key={k} style={s.repereCase}>
            {i === index && <View style={s.repere} />}
          </View>
        ))}
      </View>

      <View style={s.legende} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text style={[s.legendeTexte, { color: theme.accent }]}>{t('hunt.objective.poleInvaders')}</Text>
        <Text style={[s.legendeTexte, { color: theme.accentScore }]}>{t('hunt.objective.polePlaces')}</Text>
      </View>

      <Text style={s.hint}>{t(`${hintPrefix}${value}`)}</Text>
    </View>
  );
}

export default memo(ObjectivePicker);

function makeStyles(t) {
  return StyleSheet.create({
    bloc: { marginTop: 14 },
    label: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
      color: t.textSecondary, textTransform: 'uppercase', marginBottom: 8,
    },
    segments: { flexDirection: 'row', gap: 6 },
    segment: {
      flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4,
      borderRadius: 10, backgroundColor: t.surfaceHigh,
      borderWidth: 1, borderColor: 'transparent',
    },
    segmentActif: { borderColor: t.accentScore, backgroundColor: `${t.accentScore}1A` },
    segmentTexte: { fontSize: 12.5, fontWeight: '600', color: t.textSecondary },
    segmentTexteActif: { color: t.accentScore, fontWeight: '800' },

    axe: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 10 },
    reperes: { flexDirection: 'row', marginTop: 4 },
    repereCase: { flex: 1, alignItems: 'center' },
    repere: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.textPrimary },

    legende: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    legendeTexte: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

    hint: { fontSize: 11, color: t.textSecondary, marginTop: 8, lineHeight: 15 },
  });
}
