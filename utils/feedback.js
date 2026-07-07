import { Linking, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import i18n from '../i18n';
import { FEEDBACK_EMAIL } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// Bloc d'infos contextuelles ajouté en pied de CHAQUE e-mail de feedback.
// Factorisé ici pour être partagé par la boîte à idées et les signalements.
// ─────────────────────────────────────────────────────────────────────────────
export function buildContextBlock(dataVersion) {
  const appVersion = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '?';
  const build = Application.nativeBuildVersion ?? '?';
  const lang = i18n.language ?? '?';
  const device = Device.modelName ?? '?';
  const os = `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim();

  return [
    '——————————————',
    i18n.t('feedback.context.title'),
    `${i18n.t('feedback.context.appVersion')}: ${appVersion} (${build})`,
    `${i18n.t('feedback.context.dataVersion')}: ${dataVersion ?? '—'}`,
    `${i18n.t('feedback.context.language')}: ${lang}`,
    `${i18n.t('feedback.context.device')}: ${device}`,
    `${i18n.t('feedback.context.os')}: ${os}`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ouvre l'app mail pré-remplie. Utilise expo-mail-composer si disponible,
// sinon repli sur Linking.openURL('mailto:…').
// Retourne : 'sent' | 'saved' | 'cancelled' | 'opened' | 'no_mail'
// ─────────────────────────────────────────────────────────────────────────────
export async function sendFeedbackEmail({ subject, body }) {
  const available = await MailComposer.isAvailableAsync().catch(() => false);

  if (available) {
    const { status } = await MailComposer.composeAsync({
      recipients: FEEDBACK_EMAIL ? [FEEDBACK_EMAIL] : [],
      subject,
      body,
    });
    return status; // 'sent' | 'saved' | 'cancelled' | 'undetermined'
  }

  // Repli mailto: (app mail non détectée par MailComposer).
  // NB : pas de test canOpenURL — il renvoie de faux `false` (iOS sans Apple Mail,
  // Android 11+ et ses restrictions de visibilité). On tente l'ouverture directement :
  // si aucune app mail n'existe, openURL rejette → 'no_mail'.
  const url =
    `mailto:${encodeURIComponent(FEEDBACK_EMAIL)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'no_mail';
  }
}
