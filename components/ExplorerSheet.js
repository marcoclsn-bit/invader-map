import { useState, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { analyseListe } from '../utils/importList';
import { track } from '../services/analytics';

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
export default function ExplorerSheet({ visible, onClose, onFlash }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { flashed, setExplorer } = useAppContext();

  const [texte, setTexte] = useState('');
  const [aide, setAide] = useState(false);

  // Un seul identifiant à la fois : on réutilise l'analyseur de l'import, qui
  // extrait les jetons au lieu de découper. Coller « YOU FOUND PA_554 » en
  // entier fonctionne donc, ce qui évite d'avoir à nettoyer à la main.
  const analyse = texte.trim() ? analyseListe(texte, flashed) : null;
  const cible = analyse?.nouveaux[0] ?? null;
  const deja = analyse?.dejaFlashes[0] ?? null;
  const inconnu = analyse?.inconnus[0] ?? null;

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

    aideTexte: { fontSize: 13, color: t.textPrimary, lineHeight: 19 },
    quitter: {
      marginTop: 18, paddingVertical: 12, borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.destructive,
      alignItems: 'center',
    },
    quitterTexte: { fontSize: 13, fontWeight: '600', color: t.destructive },
  });
}
