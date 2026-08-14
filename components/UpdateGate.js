import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, AppState } from 'react-native';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import Logo from './Logo';
import { track } from '../services/analytics';

/**
 * Barrière de premier lancement.
 *
 * Le problème, mesuré et non supposé : par défaut, expo-updates démarre sur le
 * bundle EMBARQUÉ, télécharge la mise à jour en arrière-plan et ne l'applique
 * qu'au redémarrage suivant (`fallbackToCacheTimeout` vaut 0, `checkAutomatically`
 * vaut ALWAYS — documentation du SDK 54). Quelqu'un qui installe depuis l'App
 * Store et ouvre UNE fois voit donc l'app telle qu'elle était le jour du build.
 * Entre le build 17 et aujourd'hui : 251 commits, et la fonctionnalité des lieux
 * n'existait même pas. Des utilisateurs ont signalé l'absence des losanges ;
 * c'était exactement ça.
 *
 * Remettre du contenu dans le binaire ne corrigerait rien : ça remettrait le
 * compteur à zéro, et le décalage reviendrait au trentième commit suivant.
 *
 * ── On OBSERVE, on ne relance pas ─────────────────────────────────────────
 *
 * expo-updates a DÉJÀ lancé sa propre vérification au démarrage. Appeler
 * `checkForUpdateAsync` ici ne l'accélérerait pas : les procédures natives sont
 * sérialisées, l'appel se mettrait en file DERRIÈRE le téléchargement automatique
 * et referait ensuite son travail — doublant l'attente au moment précis où elle
 * est déjà trop longue, c'est-à-dire sur les réseaux lents qui justifient tout
 * ce composant. On se contente donc de regarder l'état par `useUpdates()` et de
 * recharger dès qu'une mise à jour est prête ; c'est le motif de l'exemple
 * officiel d'Expo.
 *
 * ── Quatre garde-fous, parce qu'un écran d'attente est vite pire que le mal ──
 *
 *  1. UNE SEULE FOIS dans la vie de l'installation. `isEmbeddedLaunch` reste vrai
 *     tant qu'aucune mise à jour ne tourne : il ne peut donc pas servir seul de
 *     condition d'arrêt. Sans le drapeau `CLE_FAIT`, quelqu'un qui installe au
 *     lendemain d'une publication — donc sans aucune mise à jour à recevoir —
 *     paierait un aller-retour réseau bloquant à CHAQUE démarrage à froid, à vie.
 *  2. Une butée de temps armée AVANT tout `await`. Le disque peut ne jamais
 *     répondre, et un `try/catch` n'attrape pas une promesse qui ne se règle
 *     jamais : la butée est la seule garantie d'ouverture.
 *  3. Une sortie manuelle toujours atteignable, proposée avant l'expiration du
 *     plus court des budgets.
 *  4. Passé la butée, plus aucun rechargement : on ne recharge pas l'app sous les
 *     doigts de quelqu'un qui s'en sert déjà. Le téléchargement se poursuit et
 *     servira au lancement suivant, comportement normal d'expo-updates.
 */

const CLE_FAIT   = '@invader_gate_fait';     // cycle conclu : ne plus jamais barrer
const CLE_ESSAIS = '@invader_gate_essais';   // tentatives restées sans conclusion

// Budgets calibrés sur une mesure : le bundle JS d'une mise à jour pèse 8,5 Mo
// (dist/metadata.json). Les assets déjà présents dans le binaire ne sont pas
// retéléchargés, c'est donc surtout ce bundle qui passe — environ 7 s sur une 4G
// correcte, davantage en dessous.
const BUDGET_PREMIER_MS = 20000;
const BUDGET_ENSUITE_MS = 6000;
const MAX_ESSAIS = 3;
// Strictement inférieur au plus court des budgets, sans quoi la sortie manuelle
// n'existerait qu'au tout premier lancement.
const OFFRIR_PASSER_MS = 4000;

// L'ordre des termes compte : `isEnabled` est faux en Expo Go comme en
// développement, et le court-circuit évite d'y appeler une API qui lève
// `ERR_UPDATES_DISABLED`.
//
// `isEmergencyLaunch` est le garde anti-boucle : quand une mise à jour ne démarre
// pas, expo-updates retombe sur le bundle embarqué et lève ce drapeau. Comparé
// strictement à `true` parce qu'expo-updates l'expose brut, sans garde — un
// `undefined` ferait taire le garde sans que rien ne le signale.
const DOIT_BARRER =
  Updates.isEnabled && Updates.isEmergencyLaunch !== true && Updates.isEmbeddedLaunch;

export default function UpdateGate({ children }) {
  const [ouvert, setOuvert] = useState(!DOIT_BARRER);
  const [proposerPasser, setProposerPasser] = useState(false);
  const [etape, setEtape] = useState(1);
  const { theme } = useTheme();
  const { t } = useTranslation();

  const { isUpdatePending, isChecking, isDownloading, isStartupProcedureRunning,
    lastCheckForUpdateTimeSinceRestart, checkError, downloadError } = Updates.useUpdates();
  // Distingue « le cycle natif n'a pas encore démarré » de « il a fini sans
  // rien trouver ». Les deux se ressemblent à la première image, et les
  // confondre ferait ouvrir la barrière aussitôt, en la marquant conclue :
  // la fonctionnalité serait un trompe-l'œil, sans que rien ne le signale.
  const [graceEcoulee, setGraceEcoulee] = useState(false);

  const entre     = useRef(!DOIT_BARRER);   // dans l'app : plus aucun rechargement
  const vivant    = useRef(true);
  const minuteurs = useRef([]);
  const debut     = useRef(Date.now());
  const enAttente = useRef(false);          // mise à jour prête, application différée

  const laisserEntrer = useCallback((issue) => {
    if (!vivant.current || entre.current) return;
    entre.current = true;
    minuteurs.current.forEach(clearTimeout);
    minuteurs.current = [];
    track('first_launch_gate', { issue, ms: Date.now() - debut.current });
    setOuvert(true);
  }, []);

  // Applique la mise à jour prête. Si l'app n'est pas au premier plan, on ne
  // renonce PAS : recharger en arrière-plan la ramènerait brutalement, mais
  // quelqu'un qui a quitté un écran de chargement n'a aucune session à protéger
  // et n'a même jamais vu l'app. On garde donc la main et on retente au retour.
  const appliquer = useCallback(async () => {
    if (!vivant.current || entre.current) return;
    if (AppState.currentState !== 'active') { enAttente.current = true; return; }
    track('first_launch_gate', { issue: 'appliquee', ms: Date.now() - debut.current });
    try { await AsyncStorage.setItem(CLE_FAIT, '1'); } catch { /* sans effet */ }
    try { await Updates.reloadAsync(); } catch { laisserEntrer('erreur'); }
  }, [laisserEntrer]);

  useEffect(() => {
    if (!DOIT_BARRER) return undefined;

    // Butée dure, armée AVANT tout await : c'est la seule sortie garantie.
    minuteurs.current.push(setTimeout(() => laisserEntrer('delai'), BUDGET_PREMIER_MS));
    minuteurs.current.push(setTimeout(() => vivant.current && setProposerPasser(true), OFFRIR_PASSER_MS));
    minuteurs.current.push(setTimeout(() => vivant.current && setEtape(2), 4500));
    minuteurs.current.push(setTimeout(() => vivant.current && setGraceEcoulee(true), 3000));

    const abo = AppState.addEventListener('change', (etat) => {
      if (etat === 'active' && enAttente.current) { enAttente.current = false; appliquer(); }
    });

    (async () => {
      let fait = null, essais = 0;
      try { fait = await AsyncStorage.getItem(CLE_FAIT); } catch { /* sans effet */ }
      try { essais = Number(await AsyncStorage.getItem(CLE_ESSAIS)) || 0; } catch { /* sans effet */ }

      // Déjà conclu, ou trop de tentatives vaines : la barrière a fait son
      // office et ne doit pas devenir un péage permanent.
      if (fait === '1' || essais >= MAX_ESSAIS) { laisserEntrer('deja'); return; }

      try { await AsyncStorage.setItem(CLE_ESSAIS, String(essais + 1)); } catch { /* sans effet */ }
      if (essais > 0) {
        minuteurs.current.push(setTimeout(() => laisserEntrer('delai'), BUDGET_ENSUITE_MS));
      }
    })();

    return () => {
      vivant.current = false;
      minuteurs.current.forEach(clearTimeout);
      minuteurs.current = [];
      abo.remove();
    };
  }, [laisserEntrer, appliquer]);

  useEffect(() => {
    if (!DOIT_BARRER || entre.current) return;
    if (isUpdatePending) { appliquer(); return; }

    // `isStartupProcedureRunning` est le drapeau du cycle automatique lancé par
    // expo-updates au démarrage : c'est lui qu'on attend, pas le nôtre.
    const cycleFini = !isStartupProcedureRunning && !isChecking && !isDownloading;
    // Preuve qu'une vérification a bel et bien EU LIEU depuis le lancement.
    // Sans elle, on conclurait sur l'état vierge d'avant le démarrage du cycle.
    const preuve = !!lastCheckForUpdateTimeSinceRestart || !!checkError || !!downloadError;

    if (cycleFini && (preuve || graceEcoulee)) {
      const echec = !!checkError || !!downloadError;
      // Une panne réseau n'est PAS une conclusion : la mise à jour reste due, et
      // marquer l'installation comme faite priverait définitivement l'utilisateur
      // de la seule occasion de la recevoir avant d'avoir vu l'app. Seul le cas
      // « le serveur a répondu, il n'y a rien » clôt le sujet. Les tentatives
      // ratées restent bornées par MAX_ESSAIS.
      if (!echec) AsyncStorage.setItem(CLE_FAIT, '1').catch(() => {});
      laisserEntrer(echec ? 'erreur' : 'aucune');
    }
  }, [isUpdatePending, isChecking, isDownloading, isStartupProcedureRunning,
    lastCheckForUpdateTimeSinceRestart, checkError, downloadError,
    graceEcoulee, appliquer, laisserEntrer]);

  if (ouvert) return children;

  const st = getStyles(theme);
  return (
    <View style={st.page}>
      <Logo size={72} />
      <Text style={st.nom}>{t('common.appName')}</Text>
      <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 26 }} />
      <Text style={st.etape}>{t(etape === 1 ? 'update.step1' : 'update.step2')}</Text>
      {proposerPasser && (
        <TouchableOpacity
          onPress={() => laisserEntrer('passe')}
          hitSlop={12}
          style={st.passer}
          accessibilityRole="button"
        >
          <Text style={st.passerTexte}>{t('update.skip')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
    nom: { ...typography.arcadeTitle, color: t.accent, marginTop: 18, textAlign: 'center' },
    etape: { fontSize: 13, color: t.textSecondary, marginTop: 14, textAlign: 'center', lineHeight: 19 },
    passer: { marginTop: 34, paddingVertical: 8, paddingHorizontal: 14 },
    passerTexte: { fontSize: 13, color: t.textSecondary, textDecorationLine: 'underline' },
  });
}
