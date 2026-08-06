import { useState, useMemo, useCallback } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Share, Alert, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { useGamification } from '../context/GamificationContext';
import { analyseListe, exportListe } from '../utils/importList';
import { track } from '../services/analytics';

// Écran « Mes flashés » — atteint par l'en-tête de la Liste.
//
// Deux besoins, une page. Reprendre d'un coup une collection constituée ailleurs
// (l'utilisateur arrive de FlashInvaders avec des centaines de flashs), et
// emporter la sienne (changement de téléphone, second appareil).
//
// Il n'y a PAS de sélecteur de fichier : ce serait une dépendance native, donc un
// build et une revue Apple. Un champ où l'on colle fait le même travail, se livre
// par-dessus les airs, et ne présume rien de la provenance du texte.
//
// Rien n'est écrit avant confirmation : le décompte s'affiche d'abord. Un import
// silencieux qui avale trois lignes sans le dire est pire qu'un import qui échoue.
export default function ImportScreen({ navigation }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { flashed, bulkFlash, bulkUnflash } = useAppContext();
  const { beginBatch } = useGamification();

  const [texte, setTexte] = useState('');
  // Identifiants du dernier import, pour l'annulation. Volontairement local à
  // l'écran : le filet couvre le moment où l'on peut se rendre compte de
  // l'erreur, pas indéfiniment. Quitter l'écran vaut acceptation.
  const [dernier, setDernier] = useState(null);
  const analyse = useMemo(() => (texte.trim() ? analyseListe(texte, flashed) : null), [texte, flashed]);

  const confirmer = useCallback(() => {
    if (!analyse?.nouveaux.length) return;
    Keyboard.dismiss();
    const ajoutes = analyse.nouveaux;
    // beginBatch AVANT bulkFlash : sans la fenêtre groupée, un import qui franchit
    // dix paliers enchaîne dix célébrations de 3,5 s.
    beginBatch();
    bulkFlash(ajoutes);
    track('import_applied', {
      added: ajoutes.length,
      already: analyse.dejaFlashes.length,
      unknown: analyse.inconnus.length,
      cities: Object.keys(analyse.villes).length,
    });
    setTexte('');
    setDernier(ajoutes);
    Alert.alert(t('import.done.title'), t('import.done.body', { count: ajoutes.length }));
  }, [analyse, beginBatch, bulkFlash, t]);

  const annuler = useCallback(() => {
    if (!dernier?.length) return;
    Alert.alert(
      t('import.undo.title'),
      t('import.undo.body', { count: dernier.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('import.undo.confirm'),
          style: 'destructive',
          onPress: () => {
            bulkUnflash(dernier);
            track('import_undone', { removed: dernier.length });
            setDernier(null);
          },
        },
      ]
    );
  }, [dernier, bulkUnflash, t]);

  const exporter = useCallback(async () => {
    const corps = exportListe(flashed);
    if (!corps) { Alert.alert(t('import.export.emptyTitle'), t('import.export.emptyBody')); return; }
    track('import_exported', { count: flashed.size });
    try {
      await Share.share({ subject: t('import.export.subject'), message: corps });
    } catch (_) { /* partage annulé */ }
  }, [flashed, t]);

  return (
    <ScrollView style={st.page} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <View style={st.compteurBloc}>
        <Text style={st.compteur}>{flashed.size}</Text>
        <Text style={st.compteurLabel}>{t('import.counter')}</Text>
      </View>

      <Text style={st.label}>{t('import.paste.label')}</Text>
      <TextInput
        style={st.zone}
        value={texte}
        onChangeText={setTexte}
        multiline
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={t('import.paste.placeholder')}
        placeholderTextColor={theme.textSecondary}
        textAlignVertical="top"
      />
      <Text style={st.aide}>{t('import.paste.hint')}</Text>

      {analyse && (
        <View style={st.resultat}>
          <Ligne theme={theme} valeur={analyse.nouveaux.length} ton="accent" texte={t('import.res.new')} />
          {analyse.dejaFlashes.length > 0 && (
            <Ligne theme={theme} valeur={analyse.dejaFlashes.length} texte={t('import.res.already')} />
          )}
          {analyse.detruits.length > 0 && (
            <Ligne theme={theme} valeur={analyse.detruits.length} ton="warn" texte={t('import.res.destroyed')} />
          )}
          {analyse.inconnus.length > 0 && (
            <>
              <Ligne theme={theme} valeur={analyse.inconnus.length} ton="warn" texte={t('import.res.unknown')} />
              <Text style={st.rejets} numberOfLines={3}>{analyse.inconnus.slice(0, 12).join(' · ')}</Text>
            </>
          )}
          {analyse.total === 0 && <Text style={st.rien}>{t('import.res.none')}</Text>}
        </View>
      )}

      <TouchableOpacity
        style={[st.bouton, !analyse?.nouveaux.length && st.boutonInactif]}
        onPress={confirmer}
        disabled={!analyse?.nouveaux.length}
        activeOpacity={0.8}
      >
        <Text style={[st.boutonTexte, !analyse?.nouveaux.length && st.boutonTexteInactif]}>
          {analyse?.nouveaux.length
            ? t('import.apply', { count: analyse.nouveaux.length })
            : t('import.applyIdle')}
        </Text>
      </TouchableOpacity>

      {dernier?.length > 0 && (
        <TouchableOpacity style={st.annuler} onPress={annuler} activeOpacity={0.8}>
          <Ionicons name="arrow-undo-outline" size={16} color={theme.destructive} />
          <Text style={st.annulerTexte}>{t('import.undo.action', { count: dernier.length })}</Text>
        </TouchableOpacity>
      )}

      <View style={st.separateur} />

      <Text style={st.label}>{t('import.export.label')}</Text>
      <Text style={st.aide}>{t('import.export.hint')}</Text>
      <TouchableOpacity style={st.boutonSecondaire} onPress={exporter} activeOpacity={0.8}>
        <Ionicons name="share-outline" size={17} color={theme.textPrimary} />
        <Text style={st.boutonSecondaireTexte}>{t('import.export.action')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Ligne({ theme, valeur, texte, ton }) {
  const couleur = ton === 'accent' ? theme.accent : ton === 'warn' ? theme.statusDamaged : theme.textSecondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
      <Text style={[typography.arcadeHeading, { fontSize: 13, color: couleur, minWidth: 34, textAlign: 'right' }]}>
        {valeur}
      </Text>
      <Text style={{ fontSize: 13.5, color: theme.textPrimary, flex: 1 }}>{texte}</Text>
    </View>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: t.bg },
    content: { padding: 18, paddingBottom: 44 },

    compteurBloc: {
      alignItems: 'center', backgroundColor: t.surface, borderRadius: 14,
      paddingVertical: 18, marginBottom: 22, borderWidth: 1, borderColor: t.border,
    },
    compteur: { ...typography.arcadeScore, color: t.accent },
    compteurLabel: { fontSize: 12.5, color: t.textSecondary, marginTop: 6 },

    label: { ...typography.fieldLabel, color: t.textSecondary, marginBottom: 8 },
    zone: {
      backgroundColor: t.surfaceHigh, borderRadius: 11, borderWidth: 1, borderColor: t.border,
      padding: 12, minHeight: 130, maxHeight: 200, fontSize: 13.5, color: t.textPrimary,
      fontFamily: undefined,
    },
    aide: { fontSize: 12, color: t.textSecondary, marginTop: 7, lineHeight: 17 },

    resultat: {
      marginTop: 14, backgroundColor: t.surface, borderRadius: 11,
      borderWidth: 1, borderColor: t.border, paddingVertical: 6, paddingHorizontal: 12,
    },
    rejets: {
      fontSize: 11.5, color: t.textSecondary, paddingBottom: 8, paddingTop: 2, lineHeight: 16,
    },
    rien: { fontSize: 13, color: t.textSecondary, paddingVertical: 8 },

    bouton: {
      marginTop: 16, backgroundColor: t.accent, borderRadius: 11,
      paddingVertical: 14, alignItems: 'center',
    },
    boutonInactif: { backgroundColor: t.surfaceHigh },
    boutonTexte: { ...typography.actionLabel, color: t.bg },
    boutonTexteInactif: { color: t.textSecondary },

    annuler: {
      marginTop: 12, paddingVertical: 11, borderRadius: 11,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.destructive,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    annulerTexte: { fontSize: 13, fontWeight: '600', color: t.destructive },

    separateur: { height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 26 },

    boutonSecondaire: {
      marginTop: 12, backgroundColor: t.surfaceHigh, borderRadius: 11, paddingVertical: 13,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    },
    boutonSecondaireTexte: { fontSize: 13.5, fontWeight: '600', color: t.textPrimary },
  });
}
