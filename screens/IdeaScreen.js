import { useState } from 'react';
import {
  ScrollView, View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { buildContextBlock, sendFeedbackEmail } from '../utils/feedback';

export default function IdeaScreen({ navigation }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { dataVersion } = useAppContext();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      Alert.alert(t('feedback.idea.emptyTitle'), t('feedback.idea.emptyBody'));
      return;
    }
    setSending(true);
    try {
      const subj = subject.trim()
        ? t('feedback.idea.emailSubject', { subject: subject.trim() })
        : t('feedback.idea.emailSubjectNoTopic');
      const body = `${message.trim()}\n\n${buildContextBlock(dataVersion)}`;
      const status = await sendFeedbackEmail({ subject: subj, body });

      if (status === 'no_mail') {
        Alert.alert(t('feedback.noMailTitle'), t('feedback.noMailBody'));
      } else if (status === 'sent') {
        Alert.alert(t('feedback.idea.sentTitle'), t('feedback.idea.sentBody'),
          [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
      // 'cancelled' / 'saved' / 'opened' : on ne dérange pas l'utilisateur
    } catch (e) {
      Alert.alert(t('feedback.noMailTitle'), t('feedback.noMailBody'));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={styles.emoji}>💡</Text>
          <Text style={styles.introText}>{t('feedback.idea.intro')}</Text>
        </View>

        <Text style={styles.label}>{t('feedback.idea.subjectLabel')}</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder={t('feedback.idea.subjectPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="next"
        />

        <Text style={styles.label}>{t('feedback.idea.messageLabel')}</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={message}
          onChangeText={setMessage}
          placeholder={t('feedback.idea.messagePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.sendBtn, (sending || !message.trim()) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={sending || !message.trim()}
          activeOpacity={0.8}
        >
          <Ionicons name="paper-plane" size={18} color={theme.bg} />
          <Text style={styles.sendBtnText}>{t('feedback.idea.send')}</Text>
        </TouchableOpacity>

        <Text style={styles.note}>{t('feedback.idea.note')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t) {
  return StyleSheet.create({
    container: { paddingHorizontal: 20, paddingTop: 20 },
    intro: { alignItems: 'center', marginBottom: 24 },
    emoji: { fontSize: 40 },
    introText: {
      marginTop: 10, fontSize: 15, lineHeight: 22,
      color: t.textSecondary, textAlign: 'center',
    },
    label: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      color: t.textSecondary, marginBottom: 8, marginTop: 6,
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: t.surface,
      borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: t.textPrimary, marginBottom: 18,
    },
    textarea: { minHeight: 160 },
    sendBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, marginTop: 4,
    },
    sendBtnDisabled: { opacity: 0.45 },
    sendBtnText: { ...typography.arcadeHeading, fontSize: 14, color: t.bg },
    note: {
      fontSize: 12, lineHeight: 18, color: t.textSecondary,
      textAlign: 'center', marginTop: 16,
    },
  });
}
