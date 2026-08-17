import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { decisionRetour } from '../utils/sondageSync';
import { useGamification } from '../context/GamificationContext';
import { getUid, getCompteConnu, setCompteConnu, sonderCompte, recupererGalerie } from '../services/flashinvaders';
import { track } from '../services/analytics';

/**
 * Bandeau « tu as flashé X Invaders depuis ta dernière visite ».
 *
 * PROPOSE, ne fait pas. On ne modifie pas la progression de quelqu'un sans le
 * lui dire : la synchronisation reste un geste de l'utilisateur, et un simple
 * appui suffit à la refuser.
 *
 * Sondage à deux étages. Le profil pèse 389 octets et porte déjà le nombre total
 * de flashs du compte ; la galerie en pèse 92 000. On ne télécharge donc la
 * seconde que si le compteur du serveur a bougé depuis la dernière
 * synchronisation réussie. Comparaison faite avec CE compteur-là, jamais avec le
 * total local, qui inclut les marquages manuels et diffère en permanence.
 *
 * Fusion ADDITIVE. Ce que FlashInvaders connaît et qu'on n'a pas est ajouté ; ce
 * qui a été coché à la main ici et n'existe pas là-bas est conservé. L'inverse
 * ferait disparaître le travail de l'utilisateur à la première synchronisation.
 *
 * Échoue en silence : pas de réseau, serveur fermé, UID révoqué, le bandeau ne
 * s'affiche simplement pas. C'est un confort, jamais un passage obligé.
 */
const REPOS_MS = 60000;   // pas plus d'un sondage par minute, en usage normal

// Un aller-retour vers FlashInvaders lève le repos. C'est LE geste de la chasse :
// on photographie là-bas, on revient ici, et l'écart de compteur date de quelques
// secondes. Le repos d'une minute, pensé contre les sondages en rafale, tombait
// pile sur ce trajet — il faut moins d'une minute pour flasher — et le bandeau
// n'apparaissait donc qu'au lancement suivant. Le seuil écarte les retours qui ne
// sont pas des allers-retours : boîte de dialogue système, volet de contrôle,
// écran verrouillé effleuré. Sonder coûte 389 octets ; la galerie, elle, reste
// gardée par `compteAnalyse` et n'est retéléchargée que si le compteur a bougé.
const RETOUR_MIN_MS = 3000;

export default function SyncBanner({ style }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  // `loaded` est REDONDANT ici, et c'est volontaire : AppShell (App.js) ne rend
  // rien tant que le chargement disque n'est pas fini, donc ce composant ne peut
  // pas être monté avant. La garde est une ceinture par-dessus la bretelle, pour
  // que le jour où ce bandeau serait monté ailleurs, l'invariant parte avec lui —
  // fusionner avant la lecture disque ne perdrait rien (bulkFlash est
  // fonctionnel, l'écriture est gardée) mais la fusion serait ensuite écrasée et
  // l'utilisateur croirait avoir synchronisé.
  const { flashed, bulkFlash, loaded, retires, retiresVus, confirmerRetraits } = useAppContext();
  const { beginBatch } = useGamification();

  const [nouveaux, setNouveaux] = useState([]);      // identifiants à ajouter
  const [ecartes, setEcartes] = useState([]);        // retirés à la main, ignorés
  const [deplie, setDeplie] = useState(false);
  const [masque, setMasque] = useState(false);
  const dernierSondage = useRef(0);
  // Compteur serveur pour lequel la galerie a DÉJÀ été téléchargée et analysée.
  // Sans lui, un bandeau affiché mais laissé de côté faisait retélécharger 92 Ko
  // à chaque retour au premier plan — une fois par minute, indéfiniment, soit
  // 5,5 Mo par heure d'usage sur les serveurs de space-invaders.com, par
  // utilisateur. Le sondage à 389 octets, lui, peut se répéter sans dommage.
  const compteAnalyse = useRef(null);
  // Galerie déjà téléchargée pendant le sondage : appliquer devient instantané
  // et ne coûte pas un second téléchargement de la même liste.
  const idsPrets = useRef(null);
  const datesPretes = useRef(null);
  // `sonder` ne dépend de rien pour ne pas se recréer à chaque flash ; il lit
  // donc la liste courante par une référence plutôt que par la fermeture.
  const flashedRef = useRef(flashed);
  flashedRef.current = flashed;
  const retiresRef = useRef(retires);
  retiresRef.current = retires;
  const vusRef = useRef(retiresVus);
  vusRef.current = retiresVus;

  const sonder = useCallback(async (force = false) => {
    const maintenant = Date.now();
    if (!force && maintenant - dernierSondage.current < REPOS_MS) return;

    const uid = await getUid();
    // Le repos n'est consommé qu'une fois qu'on sait qu'il y a un UID : sans lui,
    // rien n'est parti sur le réseau, et griller la fenêtre ferait rater le premier
    // sondage à celui qui renseigne son identifiant dans la minute qui suit.
    if (!uid) return;
    dernierSondage.current = maintenant;
    const compte = await sonderCompte(uid);
    if (compte == null) return;

    const connu = await getCompteConnu();
    if (connu == null) { await setCompteConnu(compte); return; }
    if (compte <= connu) return;
    // Déjà analysé pour ce compteur : le verdict ne changerait pas, et la
    // réponse serait identique octet pour octet.
    if (compteAnalyse.current === compte) return;

    // Le compteur du serveur a monté — mais il ne dit PAS que ces flashs
    // manquent ici. Le cas le plus courant est justement l'inverse : en chasse,
    // on photographie dans FlashInvaders ET on coche dans InvaderQuest, donc
    // les deux compteurs montent ensemble. Annoncer « 5 nouveaux » sur ce seul
    // écart afficherait un bandeau pour rien, dont l'appui ne ferait rien de
    // visible, et qui reviendrait à chaque ouverture. Seule la galerie tranche.
    let ids, dates;
    try { ({ ids, dates } = await recupererGalerie(uid)); } catch { return; }
    compteAnalyse.current = compte;
    const manquants = ids.filter((id) => !flashedRef.current.has(id));
    // CE QUI A ÉTÉ RETIRÉ À LA MAIN NE REVIENT PAS TOUT SEUL. Ces Invaders sont
    // toujours dans la galerie FlashInvaders, donc « manquants » ici — mais leur
    // absence est un choix, pas un oubli. Les remettre d'office annulerait un
    // geste délibéré, et l'utilisateur ne comprendrait pas pourquoi ils sont de
    // retour. On les met de côté et on propose, séparément.
    const ajouts = manquants.filter((id) => !retiresRef.current.has(id));
    // On n'en parle qu'UNE fois : ceux dont le sort a déjà été tranché par
    // « Ne rien faire » ne remontent plus.
    const refuses = manquants.filter(
      (id) => retiresRef.current.has(id) && !vusRef.current.has(id),
    );
    if (!ajouts.length) {
      // Déjà à jour : on aligne le compteur en silence. Aucun bandeau, aucun
      // geste demandé pour un travail déjà fait.
      await setCompteConnu(ids.length);
      return;
    }
    idsPrets.current = ids;
    datesPretes.current = dates;
    setNouveaux(ajouts);
    setEcartes(refuses);
    setDeplie(false);
    setMasque(false);
  }, []);

  // Instant du passage en arrière-plan : sert à distinguer un vrai aller-retour
  // vers une autre app d'un simple clignotement d'état.
  const partiEnFond = useRef(0);

  useEffect(() => {
    sonder();
    const sub = AppState.addEventListener('change', (etat) => {
      const maintenant = Date.now();
      const d = decisionRetour({
        etat,
        partiEnFond: partiEnFond.current,
        maintenant,
        seuilRetour: RETOUR_MIN_MS,
      });
      if (etat !== 'active') partiEnFond.current = maintenant;
      if (d) sonder(d.force);
    });
    return () => sub.remove();
  }, [sonder]);

  /**
   * Applique, et referme AVANT d'appliquer.
   *
   * La version précédente montrait un indicateur pendant tout le travail, ce qui
   * donnait l'impression d'une synchronisation lente — alors que la galerie est
   * déjà téléchargée depuis le sondage et qu'il ne reste qu'une fusion locale.
   * Ce qui coûte, c'est le rendu qui suit : des centaines de marqueurs et de
   * lignes se redessinent. Le faire DERRIÈRE un bandeau refermé, au lieu de
   * l'attendre devant, ne change pas la durée mais change tout au ressenti.
   *
   * En cas d'échec, le bandeau revient avec sa liste : rien n'est perdu.
   */
  const synchroniser = useCallback(async (avecEcartes = false) => {
    const aAjouter = avecEcartes ? [...nouveaux, ...ecartes] : nouveaux;
    const sauvegarde = { nouveaux, ecartes };
    setNouveaux([]);          // refermé tout de suite : le travail se fait après
    setEcartes([]);
    try {
      let ids = idsPrets.current;
      let dates = datesPretes.current;
      if (!ids) { ({ ids, dates } = await recupererGalerie(await getUid())); }
      if (aAjouter.length) {
        beginBatch();      // sans la fenêtre groupée, dix paliers = dix célébrations
        bulkFlash(aAjouter, dates || undefined);
      }
      await setCompteConnu(ids.length);
      idsPrets.current = null;
      datesPretes.current = null;
      track('sync_applied', { added: aAjouter.length, repris: avecEcartes ? ecartes.length : 0 });
    } catch (e) {
      track('sync_echec', { motif: e?.motif || 'reseau' });
      setNouveaux(sauvegarde.nouveaux);
      setEcartes(sauvegarde.ecartes);
      setMasque(true);     // on ne harcèle pas : on réessaiera au prochain retour
    }
  }, [nouveaux, ecartes, bulkFlash, beginBatch]);


  if (!loaded || !nouveaux.length || masque) return null;

  return (
    <View style={[st.bandeau, style]}>
      <View style={st.ligne}>
        <Ionicons name="sync-outline" size={17} color={theme.accent} />
        <Text style={st.texte} numberOfLines={2}>
          {t('sync.banner', { count: nouveaux.length })}
        </Text>
        <TouchableOpacity style={st.action} onPress={() => synchroniser(false)} activeOpacity={0.8}>
          <Text style={st.actionTexte}>{t('sync.action')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMasque(true)} hitSlop={10} accessibilityLabel={t('common.cancel')}>
          <Ionicons name="close" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* QUELS Invaders. Un nombre seul demande de faire confiance à l'aveugle
          pour un geste qui modifie sa collection : on doit pouvoir regarder
          avant d'accepter. Replié par défaut — la liste est un recours, pas une
          lecture obligatoire. */}
      <TouchableOpacity
        style={st.deplier}
        onPress={() => setDeplie((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
      >
        <Text style={st.deplierTexte}>
          {t(deplie ? 'sync.hideList' : 'sync.showList', { count: nouveaux.length })}
        </Text>
        <Ionicons name={deplie ? 'chevron-up' : 'chevron-down'} size={13} color={theme.textSecondary} />
      </TouchableOpacity>

      {deplie ? (
        <View style={st.liste}>
          <ScrollView style={{ maxHeight: 132 }} nestedScrollEnabled>
            {nouveaux.map((id) => (
              <Text key={id} style={st.item}>{id}</Text>
            ))}
          </ScrollView>

          {/* Les retirés à la main. On explique la situation — l'écart entre les
              deux apps n'a rien d'évident — puis on donne DEUX gestes explicites.
              « Ne rien faire » n'est pas un simple repli : il clôt le sujet pour
              ces identifiants, sinon le même message reviendrait à chaque
              synchronisation pour un choix déjà fait. */}
          {ecartes.length > 0 ? (
            <View style={st.ecartes}>
              <Text style={st.ecartesTexte}>
                {t('sync.removedKept', { count: ecartes.length })}
              </Text>
              <View style={st.ecartesBoutons}>
                <TouchableOpacity
                  style={[st.petitBouton, st.petitBoutonFort]}
                  onPress={() => synchroniser(true)}
                  activeOpacity={0.8}
                >
                  <Text style={st.petitBoutonFortTexte}>{t('sync.restoreRemoved')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={st.petitBouton}
                  onPress={() => { confirmerRetraits(ecartes); setEcartes([]); }}
                  activeOpacity={0.8}
                >
                  <Text style={st.petitBoutonTexte}>{t('sync.leaveRemoved')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    bandeau: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: t.surface, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 11,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
    },
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    texte: { flex: 1, fontSize: 13, color: t.textPrimary, lineHeight: 18 },
    deplier: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      paddingTop: 9, paddingBottom: 2,
    },
    deplierTexte: { fontSize: 11.5, color: t.textSecondary },
    liste: {
      marginTop: 8, backgroundColor: t.surfaceHigh, borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    item: { fontSize: 12.5, color: t.textPrimary, paddingVertical: 3, fontVariant: ['tabular-nums'] },
    ecartes: {
      marginTop: 8, paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border,
    },
    ecartesTexte: { fontSize: 11.5, color: t.textSecondary, lineHeight: 16 },
    ecartesBoutons: { flexDirection: 'row', gap: 8, marginTop: 10 },
    petitBouton: {
      flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
    },
    petitBoutonTexte: { fontSize: 12, color: t.textSecondary, fontWeight: '600' },
    petitBoutonFort: { backgroundColor: t.accent, borderColor: 'transparent' },
    petitBoutonFortTexte: { fontSize: 12, color: t.bg, fontWeight: '700' },
    action: {
      backgroundColor: t.accent, borderRadius: 9,
      paddingHorizontal: 12, paddingVertical: 7, minWidth: 92, alignItems: 'center',
    },
    actionTexte: { fontSize: 13, fontWeight: '700', color: t.bg },
  });
}
