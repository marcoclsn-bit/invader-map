import { Platform, Share } from 'react-native';
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
// Transmet un feedback pré-rempli. Deux voies, dans l'ordre :
//   1. Compositeur mail natif (expo-mail-composer) si dispo → e-mail pré-adressé.
//   2. Sinon feuille de partage native (Share) — TOUJOURS disponible (Gmail,
//      Messages, Copier…). L'adresse de contact est incluse dans le message.
// On abandonne le repli `mailto:` : sur iOS sans app Mail configurée, il ne fait
// rien silencieusement (cause du « rien ne se passe »).
// Retourne : 'sent' | 'saved' | 'cancelled' | 'shared' | 'no_mail'
// ─────────────────────────────────────────────────────────────────────────────
export async function sendFeedbackEmail({ subject, body }) {
  const available = await MailComposer.isAvailableAsync().catch(() => false);
  if (available) {
    try {
      const { status } = await MailComposer.composeAsync({
        recipients: FEEDBACK_EMAIL ? [FEEDBACK_EMAIL] : [],
        subject,
        body,
      });
      return status; // 'sent' | 'saved' | 'cancelled' | 'undetermined'
    } catch {
      // échec de présentation → on bascule sur le partage
    }
  }

  // Feuille de partage native (fiable partout). Adresse rappelée dans le texte.
  try {
    await Share.share({
      subject,
      message: `${subject}\n\n${body}\n\n→ ${FEEDBACK_EMAIL}`,
    });
    return 'shared';
  } catch {
    return 'no_mail';
  }
}
