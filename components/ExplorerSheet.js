import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, Keyboard,
  KeyboardAvoidingView, Platform, Switch, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { analyseListe, normaliseSaisie } from '../utils/importList';
import { track } from '../services/analytics';

// Rayon des suggestions. 150 m ne rendait presque jamais rien : dans un quartier
// déjà bien flashé, les Invaders restants sont plus loin, et l'on se retrouvait
// devant un volet vide. 300 m reste l'échelle d'un pâté de maisons, et huit
// pastilles défilantes valent mieux que trois figées.
const RAYON_M = 300;
const MAX_SUGGESTIONS = 8;

// Distance approchée en mètres, projection plane locale. Sur 150 m l'erreur est
// très en dessous de la précision du GPS : inutile de payer un haversine.
function distanceM(aLat, aLng, bLat, bLng) {
  const kx = Math.cos((aLat * Math.PI) / 180) * 111320;
  const dy = (bLat - aLat) * 110540;
  const dx = (bLng - aLng) * kx;
  return Math.hypot(dx, dy);
}

/**
 * Volet de report d'un Invader, en mode explorateur.
 *
 * Un VOLET et non un écran : les épingles étant masquées, reporter est le geste
 * central du mode, répété à chaque trouvaille. L'envoyer sur une page séparée
 * imposait un aller-retour à chaque fois, et surtout faisait perdre l'animation
 * de récompense, on revenait sur la carte une fois la pastille déjà posée.
 * Ici la carte reste dessous, et l'alien apparaît sous les yeux.
 *
 * L'identifiant vient de FlashInvaders, qui l'affiche après chaque flash
 * (« YOU FOUND PA_554 »). L'app n'a donc pas à deviner ce qu'on regarde : c'est
 * ce qui rend le mode jouable sans jamais rien dévoiler.
 *
 * Le volet porte aussi l'explication du mode et la sortie. Une carte sans
 * épingles se lit comme une panne : il faut pouvoir comprendre où l'on est et
 * en sortir sans chercher, mais depuis un endroit qu'on n'ouvre pas par accident.
 */
export default function ExplorerSheet({ visible, onClose, onFlash, position }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const {
    flashed, setExplorer, invaders, currentCityCode,
    explorerSuggest, setExplorerSuggest,
  } = useAppContext();

  const [texte, setTexte] = useState('');
  const [aide, setAide] = useState(false);
  // Position de repli. `position` vient du suivi de l'écran appelant, qui ne la
  // renseigne qu'au-dessus d'un seuil de précision : à l'ouverture de l'app, ou
  // en ville dense, elle reste souvent nulle et AUCUNE suggestion n'apparaissait.
  // `getLastKnownPositionAsync` répond tout de suite, sans réveiller le GPS.
  const [repli, setRepli] = useState(null);
  useEffect(() => {
    if (!visible || position) return;
    let annule = false;
    (async () => {
      try {
        const loc = await Location.getLastKnownPositionAsync();
        if (!annule && loc?.coords) {
          setRepli({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch { /* pas de position : on affichera simplement le champ de saisie */ }
    })();
    return () => { annule = true; };
  }, [visible, position]);
  const pos = position ?? repli;

  // Un seul identifiant à la fois : on réutilise l'analyseur de l'import, qui
  // extrait les jetons au lieu de découper. Coller « YOU FOUND PA_554 » en
  // entier fonctionne donc, ce qui évite d'avoir à nettoyer à la main.
  //
  // La saisie passe d'abord par la normalisation : en marchant, on tape « 284 »
  // et non « PA_284 ». La ville est déjà celle de la carte affichée.
  const analyse = texte.trim() ? analyseListe(normaliseSaisie(texte, currentCityCode), flashed) : null;
  const cible = analyse?.nouveaux[0] ?? null;
  const deja = analyse?.dejaFlashes[0] ?? null;
  const inconnu = analyse?.inconnus[0] ?? null;

  // Les plus proches, non flashés. Calculé seulement quand le volet est ouvert
  // ET que l'option est active : sur 1 597 Invaders c'est une passe linéaire,
  // mais inutile de la refaire à chaque frappe — d'où la mémoïsation sur la
  // position, qui ne bouge pas pendant qu'on tape.
  const suggestions = useMemo(() => {
    if (!visible || !explorerSuggest || !pos) return [];
    const out = [];
    for (const inv of invaders) {
      if (flashed.has(inv.id)) continue;
      const d = distanceM(pos.latitude, pos.longitude, inv.lat, inv.lng);
      if (d <= RAYON_M) out.push({ id: inv.id, d });
    }
    // Ordonnées par distance, la plus proche en tête. C'est un CHOIX assumé et
    // non un oubli : l'ordre reste un indice d'éloignement relatif, mais sans
    // mètres il ne permet pas de savoir si l'on se rapproche. Le plus souvent,
    // la première pastille est celle qu'on vient de flasher — la ranger ailleurs
    // faisait chercher.
    return out.sort((a, b) => a.d - b.d).slice(0, MAX_SUGGESTIONS).map(({ id }) => id);
  }, [visible, explorerSuggest, pos, invaders, flashed]);

  const fermer = useCallback(() => {
    Keyboard.dismiss();
    setTexte('');
    setAide(false);
    onClose?.();
  }, [onClose]);

  const valider = useCallback(() => {
    if (!cible) return;
    Keyboard.dismiss();
    track('explorer_log', { city: cible.slice(0, cible.lastIndexOf('_')) });
    setTexte('');
    onClose?.();
    // Après la fermeture : l'animation se joue sur la carte redevenue visible.
    onFlash?.(cible);
  }, [cible, onClose, onFlash]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={fermer}>
      {/* Sans remontée au clavier, le volet reste sous lui : on ne voyait QUE le
          clavier, ni le champ, ni le bouton, ni l'aide. Le champ prend le focus
          tout seul, donc le cas n'est pas un cas limite, c'est le cas normal. */}
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={st.fond} onPress={fermer} />
        <View style={st.volet}>
        <View style={st.poignee} />

        <View style={st.entete}>
          <Ionicons name="eye-off-outline" size={16} color={theme.accent} />
          <Text style={st.titre}>{t('explorer.sheet.title')}</Text>
          <TouchableOpacity
            onPress={() => setAide(a => !a)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('explorer.sheet.about')}
          >
            <Ionicons
              name={aide ? 'close-circle-outline' : 'help-circle-outline'}
              size={20}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {aide ? (
          <View>
            <Text style={st.aideTexte}>{t('explorer.sheet.help')}</Text>

            {/* Réglage placé ICI et nulle part ailleurs : c'est le seul endroit
                où l'on explique ce que le mode promet, donc le seul où l'on peut
                dire honnêtement ce que cette option lui retire. */}
            <View style={st.suggestRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.suggestLabel}>{t('explorer.sheet.suggestLabel')}</Text>
                <Text style={st.suggestHint}>{t('explorer.sheet.suggestHint')}</Text>
              </View>
              <Switch
                value={explorerSuggest}
                onValueChange={(v) => {
                  setExplorerSuggest(v);
                  track('explorer_suggest', { state: v ? 'on' : 'off' });
                }}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={theme.bg}
              />
            </View>

            <TouchableOpacity
              style={st.quitter}
              onPress={() => { setExplorer(false); track('explorer_mode', { state: 'off', from: 'sheet' }); fermer(); }}
              activeOpacity={0.8}
            >
              <Text style={st.quitterTexte}>{t('explorer.sheet.leave')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={st.champ}
              value={texte}
              onChangeText={setTexte}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              placeholder={t('explorer.sheet.placeholder')}
              placeholderTextColor={theme.textSecondary}
              returnKeyType="done"
              onSubmitEditing={valider}
            />

            {/* Le numéro seul suffit : la pastille porte donc ce qu'on aurait à
                taper, pas l'identifiant complet. Elle remplit le champ au lieu
                de valider — un doigt qui glisse ne doit pas écrire un flash.
                AUCUNE DISTANCE, ni à l'écran ni dans l'étiquette d'accessibilité :
                sans elle, la pastille dit « il y en a un par ici » et non « il
                est à 30 m dans cette direction ». */}
            {/* Sans intitulé, une pastille « 309 » posée sous le champ ne dit
                rien de ce qu'elle est ni d'où elle sort. */}
            {suggestions.length > 0 && (
              <Text style={st.pastillesTitre}>{t('explorer.sheet.suggestTitle')}</Text>
            )}
            {suggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={st.pastilles}
                style={st.pastillesRail}
              >
                {suggestions.map((id) => (
                  <TouchableOpacity
                    key={id}
                    style={st.pastille}
                    onPress={() => setTexte(id.slice(id.lastIndexOf('_') + 1))}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('explorer.sheet.suggestA11y', { id })}
                  >
                    <Text style={st.pastilleId}>{id.slice(id.lastIndexOf('_') + 1)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={st.retour}>
              {cible
                ? t('explorer.sheet.ready', { id: cible })
                : deja
                  ? t('explorer.sheet.already', { id: deja })
                  : inconnu
                    ? t('explorer.sheet.unknown', { id: inconnu })
                    : t('explorer.sheet.hint')}
            </Text>

            <TouchableOpacity
              style={[st.bouton, !cible && st.boutonInactif]}
              onPress={valider}
              disabled={!cible}
              activeOpacity={0.85}
            >
              <Text style={[st.boutonTexte, !cible && st.boutonTexteInactif]}>
                {t('explorer.sheet.confirm')}
              </Text>
            </TouchableOpacity>
          </>
        )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    entete: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    titre: { ...typography.arcadeHeading, fontSize: 13, color: t.textPrimary, flex: 1 },

    champ: {
      backgroundColor: t.surfaceHigh, borderRadius: 11,
      borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 17, letterSpacing: 1, color: t.textPrimary,
    },
    retour: { fontSize: 12.5, color: t.textSecondary, marginTop: 9, lineHeight: 17, minHeight: 34 },

    bouton: {
      marginTop: 6, backgroundColor: t.accent, borderRadius: 11,
      paddingVertical: 14, alignItems: 'center',
    },
    boutonInactif: { backgroundColor: t.surfaceHigh },
    boutonTexte: { ...typography.actionLabel, color: t.bg },
    boutonTexteInactif: { color: t.textSecondary },

    pastillesTitre: {
      ...typography.fieldLabel, color: t.textSecondary, marginTop: 12,
    },
    pastillesRail: { marginTop: 8, marginHorizontal: -18 },
    pastilles: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
    pastille: {
      backgroundColor: t.surfaceHigh, borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    pastilleId: { ...typography.arcadeHeading, fontSize: 13, color: t.textPrimary },

    aideTexte: { fontSize: 13, color: t.textPrimary, lineHeight: 19 },
    suggestRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18,
      paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    suggestLabel: { fontSize: 13, fontWeight: '600', color: t.textPrimary },
    suggestHint: { fontSize: 11.5, color: t.textSecondary, lineHeight: 16, marginTop: 3 },
    quitter: {
      marginTop: 18, paddingVertical: 12, borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.destructive,
      alignItems: 'center',
    },
    quitterTexte: { fontSize: 13, fontWeight: '600', color: t.destructive },
  });
}
