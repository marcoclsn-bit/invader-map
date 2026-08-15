import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity, StyleSheet, Keyboard,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { useAppContext } from '../context/AppContext';
import { statusKey, STATUS_COLOR } from '../constants';
import { CITIES } from '../cities/registry';
import { usePhotoCreneau, PRIORITE_FICHE, POIDS_FLASHINVADERS, POIDS_SPOTTER } from '../services/photoQueue';
import { track } from '../services/analytics';

/**
 * La fiche d'une prise — ce que la grille ne peut pas dire.
 *
 * La Collection montre CE QU'ON A ATTRAPÉ ; celle-ci montre ce qu'on en a vécu.
 * D'un côté ce que l'app sait — l'identifiant, l'année de pose, les points, la
 * ville, le statut. De l'autre ce qu'elle ne devinera jamais : la date où on l'a
 * eu, et une note libre.
 *
 * La note est la SEULE donnée de l'app que l'utilisateur ait vraiment créée.
 * Tout le reste se re-télécharge : les Invaders, les photos, même la liste des
 * flashs si un uID est renseigné. Une note perdue est perdue. D'où l'écriture
 * immédiate à chaque frappe stabilisée, et pas au moment de fermer — une feuille
 * qu'on balaie d'un geste ne doit rien emporter.
 */

const ALIEN = {
  ok: require('../assets/markers/alien_ok.png'),
  damaged: require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden: require('../assets/markers/alien_unknown.png'),
  unknown: require('../assets/markers/alien_unknown.png'),
};

function jour(iso, avecHeure = false) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const lang = i18n.language || 'fr';
  const date = d.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
  if (!avecHeure) return date;
  // Minuit pile signale une date sans heure réelle (import d'une liste, migration) :
  // afficher « à 00:00 » laisserait croire à une sortie nocturne.
  if (d.getHours() === 0 && d.getMinutes() === 0) return date;
  return `${date} · ${d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`;
}

function Ligne({ icone, libelle, valeur, theme, st }) {
  if (!valeur) return null;
  return (
    <View style={st.ligne}>
      <Ionicons name={icone} size={15} color={theme.textSecondary} style={{ width: 20 }} />
      <Text style={st.ligneLibelle}>{libelle}</Text>
      <Text style={st.ligneValeur} numberOfLines={2}>{valeur}</Text>
    </View>
  );
}

export default function CollectionSheet({ invader, onFermer, onVoirSurCarte }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const { flashed, flashedDates, fiPhotos, photosSpotter, notes, setNote } = useAppContext();

  const [texte, setTexte] = useState('');
  // On lit la note par une RÉFÉRENCE, et on ne se resynchronise QUE lorsque la
  // fiche change d'Invader. Se caler sur `notes` aurait été une faute grave : à
  // chaque enregistrement, l'état revenait à la valeur qui venait d'être écrite —
  // donc en pleine frappe, les caractères tapés depuis étaient effacés.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const idOuvert = invader?.id ?? null;
  useEffect(() => {
    setTexte(idOuvert ? (notesRef.current?.[idOuvert] ?? '') : '');
  }, [idOuvert]);

  // Trois états, et non deux : « rien à faire », « en train d'écrire », « écrit ».
  // C'est la distinction que Marco a demandée, et elle est juste — un bouton qui
  // reste actif alors qu'il n'y a rien à enregistrer laisse croire à un travail
  // en attente.
  const enregistre = idOuvert ? texte === (notes?.[idOuvert] ?? '') : true;
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { if (enregistre) setEnCours(false); }, [enregistre]);

  const enregistrer = useCallback(() => {
    if (!idOuvert) return;
    setEnCours(true);
    setNote(idOuvert, texte);
  }, [idOuvert, texte, setNote]);

  // Enregistrement à la frappe stabilisée. 900 ms : assez pour ne pas écrire à
  // chaque lettre, assez court pour qu'une fermeture brutale ne coûte rien.
  useEffect(() => {
    if (!idOuvert) return undefined;
    if (texte === (notesRef.current?.[idOuvert] ?? '')) return undefined;
    const minuteur = setTimeout(enregistrer, 900);
    return () => clearTimeout(minuteur);
  }, [texte, idOuvert, enregistrer]);

  const fermer = useCallback(() => {
    // Dernière chance : ce qui n'a pas encore été stabilisé part maintenant.
    if (idOuvert && texte !== (notesRef.current?.[idOuvert] ?? '')) setNote(idOuvert, texte);
    Keyboard.dismiss();
    onFermer();
  }, [idOuvert, texte, setNote, onFermer]);

  const estFlashe = invader ? flashed.has(invader.id) : false;
  const perso = invader ? fiPhotos?.[invader.id] : null;
  const spotter = photosSpotter && invader ? invader.photoUrl : null;
  const { src, fini } = usePhotoCreneau(
    estFlashe ? (perso || spotter) : null,
    PRIORITE_FICHE,
    perso ? POIDS_FLASHINVADERS : POIDS_SPOTTER,
  );

  if (!invader) return null;

  const dateFlash = flashedDates?.get?.(invader.id);
  const ville = CITIES[invader.city]?.name ?? invader.city;
  const couleur = STATUS_COLOR[statusKey(invader.status)];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={fermer}>
      <KeyboardAvoidingView
        style={st.fond}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={fermer} />
        <View style={st.corps}>
          <View style={st.poignee} />

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 26 }}>
            <View style={st.visuel}>
              {src ? (
                <Image
                  source={{ uri: src }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover" transition={140} cachePolicy="disk"
                  onLoadEnd={fini} onError={fini}
                />
              ) : (
                <Image
                  source={ALIEN[statusKey(invader.status)] ?? ALIEN.unknown}
                  style={{ width: 74, height: 54, opacity: 0.5 }}
                  contentFit="contain"
                  tintColor={estFlashe ? theme.flashed : theme.textSecondary}
                  transition={0}
                />
              )}
            </View>

            <View style={st.tete}>
              <Text style={st.id} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {invader.id}
              </Text>
              <View style={[st.pastille, { backgroundColor: estFlashe ? theme.flashed : theme.surfaceHigh }]}>
                <Text style={[st.pastilleTexte, { color: estFlashe ? theme.bg : theme.textSecondary }]}>
                  {invader.points} {t('common.pts')}
                </Text>
              </View>
            </View>

            <View style={st.bloc}>
              <Ligne icone="business-outline" libelle={t('collection.sheet.city')}
                valeur={ville} theme={theme} st={st} />
              <Ligne icone="calendar-outline" libelle={t('collection.sheet.posed')}
                valeur={jour(invader.datePosed)} theme={theme} st={st} />
              <Ligne icone="flash-outline" libelle={t('collection.sheet.flashed')}
                valeur={estFlashe ? (jour(dateFlash, true) ?? t('collection.sheet.noDate')) : null}
                theme={theme} st={st} />
              <View style={st.ligne}>
                <View style={[st.point, { backgroundColor: couleur, marginLeft: 3, marginRight: 8 }]} />
                <Text style={st.ligneLibelle}>{t('collection.sheet.status')}</Text>
                <Text style={st.ligneValeur}>{t(`common.status.${invader.status}`)}</Text>
              </View>
            </View>

            <View style={st.enteteNote}>
              <Text style={st.titreNote}>{t('collection.sheet.note')}</Text>
              {/* L'état est AFFICHÉ. Une sauvegarde silencieuse oblige à fermer la
                  fiche et à la rouvrir pour savoir si elle a eu lieu — c'est
                  exactement ce que Marco a dû faire, et c'est ainsi qu'il a trouvé
                  le bug. Un mot suffit à supprimer le doute. */}
              {enregistre && texte.length > 0 ? (
                <View style={st.etat}>
                  <Ionicons name="checkmark-circle" size={14} color={theme.accent} />
                  <Text style={[st.etatTexte, { color: theme.accent }]}>
                    {t('collection.sheet.saved')}
                  </Text>
                </View>
              ) : null}
            </View>
            <TextInput
              style={st.champ}
              value={texte}
              onChangeText={setTexte}
              multiline
              textAlignVertical="top"
              placeholder={t('collection.sheet.notePlaceholder')}
              placeholderTextColor={theme.textSecondary}
              maxLength={600}
              onBlur={() => { if (idOuvert && !enregistre) setNote(idOuvert, texte); }}
            />
            <Text style={st.aide}>{t('collection.sheet.noteHint')}</Text>

            {/* Le bouton porte l'action ET son état. Il reste TOUJOURS visible,
                grisé et inerte quand il n'y a rien à enregistrer : le faire
                disparaître obligerait à chercher où est passé le geste, et le
                laisser actif laisserait croire à un travail en attente. */}
            <TouchableOpacity
              style={[st.enregistrer, enregistre && st.enregistrerInactif]}
              onPress={() => { enregistrer(); Keyboard.dismiss(); }}
              disabled={enregistre || enCours}
              activeOpacity={0.8}
            >
              {enCours ? (
                <ActivityIndicator size="small" color={theme.bg} />
              ) : (
                <Ionicons
                  name="save-outline" size={16}
                  color={enregistre ? theme.textSecondary : theme.bg}
                />
              )}
              <Text style={[st.enregistrerTexte, enregistre && { color: theme.textSecondary }]}>
                {t(enCours ? 'collection.sheet.saving' : 'collection.sheet.save')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.bouton} onPress={() => { track('collection_to_map'); onVoirSurCarte(invader); }} activeOpacity={0.8}>
              <Ionicons name="map-outline" size={17} color={theme.textPrimary} />
              <Text style={st.boutonTexte}>{t('collection.sheet.seeOnMap')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    corps: {
      maxHeight: '86%', backgroundColor: t.surface,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingHorizontal: 18, paddingBottom: 22,
    },
    poignee: {
      width: 38, height: 4, borderRadius: 2, backgroundColor: t.border,
      alignSelf: 'center', marginTop: 10, marginBottom: 14,
    },
    visuel: {
      height: 190, borderRadius: 14, backgroundColor: t.surfaceHigh,
      borderWidth: 1, borderColor: t.border, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    tete: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    id: { ...typography.arcadeTitle, fontSize: 19, color: t.textPrimary, flex: 1 },
    pastille: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
    pastilleTexte: { fontSize: 12.5, fontWeight: '700' },

    bloc: {
      marginTop: 14, backgroundColor: t.surfaceHigh, borderRadius: 12,
      borderWidth: 1, borderColor: t.border, paddingVertical: 4, paddingHorizontal: 12,
    },
    ligne: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
    ligneLibelle: { fontSize: 12.5, color: t.textSecondary, width: 96 },
    ligneValeur: { fontSize: 13.5, color: t.textPrimary, flex: 1, fontWeight: '600' },
    point: { width: 9, height: 9, borderRadius: 5 },

    enteteNote: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 20, marginBottom: 8,
    },
    titreNote: { ...typography.fieldLabel, color: t.textSecondary },
    etat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    etatTexte: { fontSize: 11.5, color: t.textSecondary },
    enregistrer: {
      marginTop: 12, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    enregistrerInactif: { backgroundColor: t.surfaceHigh },
    enregistrerTexte: { fontSize: 14, fontWeight: '700', color: t.bg },
    champ: {
      backgroundColor: t.surfaceHigh, borderRadius: 12, borderWidth: 1, borderColor: t.border,
      padding: 13, minHeight: 96, fontSize: 14, color: t.textPrimary, lineHeight: 20,
    },
    aide: { fontSize: 11.5, color: t.textSecondary, marginTop: 7, lineHeight: 16 },

    bouton: {
      marginTop: 20, backgroundColor: t.surfaceHigh, borderRadius: 12, paddingVertical: 13,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
      borderWidth: 1, borderColor: t.border,
    },
    boutonTexte: { fontSize: 14, fontWeight: '600', color: t.textPrimary },
  });
}
