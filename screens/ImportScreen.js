import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator,
  ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, Share, Alert, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { useGamification } from '../context/GamificationContext';
import { analyseListe, exportListe, exportNotes, analyseNotes } from '../utils/importList';
import { lireFichierTexte, ecrireEtPartager, dateDuJour } from '../utils/fichiers';
import { recupererGalerie, uidValide, getUid, setUid, oublierUid, setCompteConnu } from '../services/flashinvaders';
import { track } from '../services/analytics';

// Écran « Importer mes flashs » — menu, en-tête de la Liste, et carte d'accueil
// de la Liste quand rien n'est encore flashé.
//
// Deux besoins, une page. Reprendre d'un coup une collection constituée ailleurs
// (l'utilisateur arrive de FlashInvaders avec des centaines de flashs), et
// emporter la sienne (changement de téléphone, second appareil).
//
// Les moyens sont présentés comme TROIS CARTES NOMMÉES, pas comme un formulaire
// à dérouler. La version précédente ouvrait sur un champ « Ton UID » : celui qui
// ignore ce qu'est un UID — l'immense majorité — en concluait que l'import ne
// lui était pas destiné et repartait. Des cartes ne sont pas une décoration
// ici, elles rendent le CHOIX visible. Elles ne sont pas numérotées : ce sont
// des chemins alternatifs, pas des étapes d'une séquence.
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
  const { flashed, flashedDates, bulkFlash, bulkUnflash, notes, setNote } = useAppContext();
  const { beginBatch } = useGamification();

  const [texte, setTexte] = useState('');
  // Import par UID FlashInvaders. L'UID reste sur l'appareil et ne part que vers
  // l'interface officielle : jamais dans un événement de mesure, jamais journalisé.
  const [uid, setUidLocal] = useState('');
  const [uidConnu, setUidConnu] = useState(false);
  const [chargement, setChargement] = useState(false);
  useEffect(() => { getUid().then((v) => { if (v) { setUidLocal(v); setUidConnu(true); } }); }, []);
  // Identifiants du dernier import, pour l'annulation. Volontairement local à
  // l'écran : le filet couvre le moment où l'on peut se rendre compte de
  // l'erreur, pas indéfiniment. Quitter l'écran vaut acceptation.
  const [dernier, setDernier] = useState(null);
  // Horodatages du dernier téléchargement par UID. L'import verse les
  // identifiants dans le champ de collage pour n'avoir qu'un seul parcours de
  // confirmation — mais du texte ne transporte pas de date. On les garde donc
  // ici, et on les applique à ceux qui en ont une. Une liste collée à la main
  // n'en a aucune : le comportement d'avant vaut toujours pour elle.
  const datesUid = useRef(null);
  // Le MÊME champ accepte les deux. On colle, l'app reconnaît : une sauvegarde de
  // notes commence par une accolade, une liste non. Demander à l'utilisateur de
  // choisir le bon champ avant de coller serait lui faire porter notre problème.
  const notesCollees = useMemo(() => analyseNotes(texte, notes), [texte, notes]);
  const analyse = useMemo(
    () => (texte.trim() && !notesCollees ? analyseListe(texte, flashed) : null),
    [texte, flashed, notesCollees],
  );
  // Dates récupérables sans rien ajouter : le cas de quelqu'un qui avait DÉJÀ
  // importé sa galerie. Rien de nouveau à cocher, mais tout un historique à
  // dater. Sans ce compte, le bouton resterait « Rien à ajouter » et l'intérêt
  // principal de la manœuvre lui serait inaccessible.
  const [signature, setSignature] = useState(0);
  const aDater = useMemo(() => {
    const d = datesUid.current;
    if (!d) return 0;
    let n = 0;
    for (const id of Object.keys(d)) {
      if (flashed.has(id) && !flashedDates.has(id)) n += 1;
    }
    return n;
    // `signature` force le recalcul après un téléchargement, datesUid étant une ref.
  }, [flashed, flashedDates, signature]);
  const aFaire = (analyse?.nouveaux.length || 0) + aDater;

  const confirmer = useCallback(() => {
    if (!analyse?.nouveaux.length && !datesUid.current) return;
    Keyboard.dismiss();
    const ajoutes = analyse.nouveaux;
    // beginBatch AVANT bulkFlash : sans la fenêtre groupée, un import qui franchit
    // dix paliers enchaîne dix célébrations de 3,5 s.
    beginBatch();
    // Deux sources de dates : celles du dernier téléchargement par uID, et celles
    // lues en seconde colonne du texte collé. Les secondes l'emportent, car elles
    // viennent d'une sauvegarde que l'utilisateur a produite lui-même.
    bulkFlash(ajoutes, { ...(datesUid.current || {}), ...(analyse.dates || {}) });
    track('import_applied', {
      added: ajoutes.length,
      already: analyse.dejaFlashes.length,
      unknown: analyse.inconnus.length,
      cities: Object.keys(analyse.villes).length,
    });
    setTexte('');
    setDernier(ajoutes.length ? ajoutes : null);
    Alert.alert(
      t('import.done.title'),
      ajoutes.length
        ? t('import.done.body', { count: ajoutes.length })
        : t('import.done.datesOnly', { count: aDater }),
    );
  }, [analyse, aDater, beginBatch, bulkFlash, t]);

  // Récupère la galerie et verse le résultat dans le MÊME champ que le
  // copier-coller : une seule analyse, un seul écran de résultat, un seul bouton
  // de confirmation. L'UID change la provenance, pas le parcours.
  const recuperer = useCallback(async () => {
    Keyboard.dismiss();
    setChargement(true);
    try {
      const { ids, dates } = await recupererGalerie(uid);
      datesUid.current = dates;
      setSignature((n) => n + 1);
      await setUid(uid);
      // Point de départ du bandeau de synchronisation : sans lui, le premier
      // lancement suivant annoncerait « X nouveaux » pour la liste entière.
      await setCompteConnu(ids.length);
      setUidConnu(true);
      setTexte(ids.join('\n'));
      track('import_uid', { count: ids.length });   // JAMAIS l'uid lui-même
    } catch (e) {
      const motif = e?.motif || 'reseau';
      track('import_uid_echec', { motif });
      Alert.alert(t('import.uid.errTitle'), t(`import.uid.err.${motif}`));
    } finally {
      setChargement(false);
    }
  }, [uid, t]);

  const effacerUid = useCallback(() => {
    Alert.alert(t('import.uid.forgetTitle'), t('import.uid.forgetBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('import.uid.forgetOk'), style: 'destructive',
        onPress: async () => { await oublierUid(); setUidLocal(''); setUidConnu(false); } },
    ]);
  }, [t]);

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

  // Le contenu du fichier va dans le MÊME champ que le collage. Une liste, une
  // sauvegarde de notes, un export d'un autre outil : c'est l'analyse qui décide
  // ensuite. Rien de nouveau à comprendre pour l'utilisateur, juste une autre
  // façon d'amener le texte.
  const ouvrirFichier = useCallback(async () => {
    try {
      const res = await lireFichierTexte();
      if (!res) return;
      setTexte(res.contenu);
      track('import_file_opened', { taille: res.contenu.length });
    } catch (e) {
      Alert.alert(t('import.file.errTitle'), t('import.file.errBody'));
    }
  }, [t]);

  const restaurerNotes = useCallback(() => {
    if (!notesCollees?.total) return;
    Alert.alert(
      t('import.notes.confirmTitle'),
      t('import.notes.confirmBody', { count: notesCollees.total, ecrase: notesCollees.existantes }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: () => {
            for (const [id, valeur] of Object.entries(notesCollees.notes)) setNote(id, valeur);
            track('notes_imported', { count: notesCollees.total });
            setTexte('');
            Alert.alert(t('import.notes.doneTitle'),
              t('import.notes.doneBody', { count: notesCollees.total }));
          },
        },
      ],
    );
  }, [notesCollees, setNote, t]);

  const exporterNotes = useCallback(async () => {
    const combien = Object.keys(notes ?? {}).length;
    if (!combien) { Alert.alert(t('import.notes.emptyTitle'), t('import.notes.emptyBody')); return; }
    track('notes_exported', { count: combien });
    const corps = exportNotes(notes, dateDuJour());
    try {
      // Fichier d'abord : une sauvegarde se range, elle ne se colle pas dans un
      // message. Repli sur le texte si le partage de fichier est indisponible.
      const ok = await ecrireEtPartager(
        `invaderquest-notes-${dateDuJour()}.json`, corps,
        { mimeType: 'application/json', titre: t('import.notes.subject') },
      );
      if (!ok) await Share.share({ subject: t('import.notes.subject'), message: corps });
    } catch (_) { /* partage annulé */ }
  }, [notes, t]);

  const exporter = useCallback(async () => {
    const corps = exportListe(flashed, flashedDates);
    if (!corps) { Alert.alert(t('import.export.emptyTitle'), t('import.export.emptyBody')); return; }
    track('import_exported', { count: flashed.size });
    try {
      const ok = await ecrireEtPartager(
        `invaderquest-flashs-${dateDuJour()}.txt`, corps,
        { mimeType: 'text/plain', titre: t('import.export.subject') },
      );
      if (!ok) await Share.share({ subject: t('import.export.subject'), message: corps });
    } catch (_) { /* partage annulé */ }
  }, [flashed, flashedDates, t]);

  return (
    <ScrollView style={st.page} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
      <View style={st.compteurBloc}>
        <Text style={st.compteur}>{flashed.size}</Text>
        <Text style={st.compteurLabel}>{t('import.counter')}</Text>
      </View>

      <Text style={st.intro}>{t('import.intro')}</Text>

      {/* ── Moyen 1 : compte FlashInvaders ────────────────────────────────
          Placé AVANT le collage : quand on a un UID, c'est le chemin le plus
          court, et il remplit le même champ que le copier-coller. */}
      <View style={st.carte}>
      <View style={st.carteTitre}>
        <Ionicons name="cloud-download-outline" size={18} color={theme.accent} />
        <Text style={st.label}>{t('import.uid.label')}</Text>
      </View>
      <View style={st.uidRow}>
        <TextInput
          style={[st.zone, st.uidChamp]}
          value={uid}
          onChangeText={setUidLocal}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t('import.uid.placeholder')}
          placeholderTextColor={theme.textSecondary}
        />
        <TouchableOpacity
          style={[st.uidBtn, (!uidValide(uid) || chargement) && st.boutonInactif]}
          onPress={recuperer}
          disabled={!uidValide(uid) || chargement}
          activeOpacity={0.8}
        >
          {chargement
            ? <ActivityIndicator size="small" color={theme.bg} />
            : <Ionicons name="cloud-download-outline" size={18} color={uidValide(uid) ? theme.bg : theme.textSecondary} />}
        </TouchableOpacity>
      </View>
      <Text style={st.aide}>{t('import.uid.hint')}</Text>
      {uidConnu && (
        <TouchableOpacity onPress={effacerUid} hitSlop={8}>
          <Text style={st.uidOubli}>{t('import.uid.forget')}</Text>
        </TouchableOpacity>
      )}
      </View>

      {/* ── Moyen 2 : une liste collée ─────────────────────────────────── */}
      <View style={st.carte}>
      <View style={st.carteTitre}>
        <Ionicons name="clipboard-outline" size={18} color={theme.accent} />
        <Text style={st.label}>{t('import.paste.label')}</Text>
      </View>
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

      {/* Le fichier verse son contenu dans le champ ci-dessus : une seule
          analyse, un seul écran de résultat. Coller ou ouvrir, c'est le même
          parcours à partir d'ici. */}
      <TouchableOpacity style={st.boutonSecondaire} onPress={ouvrirFichier} activeOpacity={0.8}>
        <Ionicons name="document-text-outline" size={17} color={theme.textPrimary} />
        <Text style={st.boutonSecondaireTexte}>{t('import.file.action')}</Text>
      </TouchableOpacity>

      {/* Une sauvegarde de notes a été reconnue : on ne parle plus d'Invaders. */}
      {notesCollees && (
        <View style={st.resultat}>
          <Ligne theme={theme} valeur={notesCollees.nouvelles} ton="accent"
            texte={t('import.notes.resNew')} />
          {notesCollees.existantes > 0 && (
            <Ligne theme={theme} valeur={notesCollees.existantes} ton="warn"
              texte={t('import.notes.resOverwrite')} />
          )}
          {notesCollees.total === 0 && <Text style={st.rien}>{t('import.notes.resNone')}</Text>}
        </View>
      )}

      {notesCollees && notesCollees.total > 0 && (
        <TouchableOpacity style={st.bouton} onPress={restaurerNotes} activeOpacity={0.8}>
          <Text style={st.boutonTexte}>
            {t('import.notes.restore', { count: notesCollees.total })}
          </Text>
        </TouchableOpacity>
      )}

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
          {analyse.avecDates > 0 && (
            <Ligne theme={theme} valeur={analyse.avecDates} texte={t('import.res.withDates')} />
          )}
          {aDater > 0 && (
            <Ligne theme={theme} valeur={aDater} ton="accent" texte={t('import.res.dates')} />
          )}
          {analyse.total === 0 && <Text style={st.rien}>{t('import.res.none')}</Text>}
        </View>
      )}

      <TouchableOpacity
        style={[st.bouton, !aFaire && st.boutonInactif]}
        onPress={confirmer}
        disabled={!aFaire}
        activeOpacity={0.8}
      >
        <Text style={[st.boutonTexte, !aFaire && st.boutonTexteInactif]}>
          {analyse?.nouveaux.length
            ? t('import.apply', { count: analyse.nouveaux.length })
            : aDater
              ? t('import.applyDates', { count: aDater })
              : t('import.applyIdle')}
        </Text>
      </TouchableOpacity>

      {dernier?.length > 0 && (
        <TouchableOpacity style={st.annuler} onPress={annuler} activeOpacity={0.8}>
          <Ionicons name="arrow-undo-outline" size={16} color={theme.destructive} />
          <Text style={st.annulerTexte}>{t('import.undo.action', { count: dernier.length })}</Text>
        </TouchableOpacity>
      )}
      </View>

      {/* ── Moyen 3 : à la main ────────────────────────────────────────────
          Ce n'est pas un import, mais c'est bien la troisième réponse à « comment
          je marque mes flashs ? ». L'omettre laissait croire qu'il fallait un
          fichier ou un UID pour commencer. */}
      <View style={st.carte}>
        <View style={st.carteTitre}>
          <Ionicons name="flash-outline" size={18} color={theme.accent} />
          <Text style={st.label}>{t('import.hand.label')}</Text>
        </View>
        <Text style={[st.aide, { marginTop: 0 }]}>{t('import.hand.hint')}</Text>
        <TouchableOpacity
          style={st.boutonSecondaire}
          onPress={() => navigation.navigate('Main', { screen: 'Liste' })}
          activeOpacity={0.8}
        >
          <Ionicons name="list-outline" size={17} color={theme.textPrimary} />
          <Text style={st.boutonSecondaireTexte}>{t('import.hand.action')}</Text>
        </TouchableOpacity>
      </View>

      <View style={st.separateur} />

      <View style={st.carte}>
        <View style={st.carteTitre}>
          <Ionicons name="share-outline" size={18} color={theme.accent} />
          <Text style={st.label}>{t('import.export.label')}</Text>
        </View>
        <Text style={[st.aide, { marginTop: 0 }]}>{t('import.export.hint')}</Text>
        <TouchableOpacity style={st.boutonSecondaire} onPress={exporter} activeOpacity={0.8}>
          <Ionicons name="list-outline" size={17} color={theme.textPrimary} />
          <Text style={st.boutonSecondaireTexte}>{t('import.export.action')}</Text>
        </TouchableOpacity>
      </View>

      {/* Les notes partent SÉPARÉMENT. Mêlées à quatre cents identifiants, elles
          donneraient un bloc qu'on ne peut plus coller nulle part — et ce sont
          elles qu'on tient le plus à ne pas perdre, puisqu'elles n'existent
          qu'ici. */}
      <View style={st.carte}>
        <View style={st.carteTitre}>
          <Ionicons name="create-outline" size={18} color={theme.accent} />
          <Text style={st.label}>{t('import.notes.label')}</Text>
        </View>
        <Text style={[st.aide, { marginTop: 0 }]}>
          {t('import.notes.hint', { count: Object.keys(notes ?? {}).length })}
        </Text>
        <TouchableOpacity style={st.boutonSecondaire} onPress={exporterNotes} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={17} color={theme.textPrimary} />
          <Text style={st.boutonSecondaireTexte}>{t('import.notes.action')}</Text>
        </TouchableOpacity>
      </View>
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

    intro: { fontSize: 13, color: t.textSecondary, lineHeight: 18, marginBottom: 18 },
    carte: {
      backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border,
      padding: 14, marginBottom: 14,
    },
    carteTitre: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    label: { ...typography.fieldLabel, color: t.textSecondary, flex: 1 },
    uidRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    uidChamp: { flex: 1, minHeight: 46, maxHeight: 46, paddingTop: 13 },
    uidBtn: {
      width: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.accent,
    },
    uidOubli: { fontSize: 12, color: t.textSecondary, textDecorationLine: 'underline', marginTop: 8 },
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
