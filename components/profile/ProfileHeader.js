import { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/tokens';
import { useProfile } from './useProfile';
import { AVATARS, avatarSource } from './avatars';

/**
 * En-tête « Profil RPG » — 100 % LOCAL (pseudo + avatar sur l'appareil).
 * @param {{key:string,tier:number,explorer:boolean}} honorific
 * @param {number} total  nb total de flashs (sous-titre)
 */
export default function ProfileHeader({ honorific, total = 0 }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { name, avatar, setName, setAvatar } = useProfile();
  const [picker, setPicker] = useState(false);

  const title = t(`stats.profile.titles.${honorific?.key ?? 'novice'}`);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.row}>
        {/* Avatar */}
        <TouchableOpacity onPress={() => setPicker(true)} activeOpacity={0.8}>
          <View style={[styles.avatarRing, { borderColor: theme.accent, backgroundColor: theme.surfaceHigh, shadowColor: theme.accent }]}>
            <Image source={avatarSource(avatar)} style={styles.avatar} resizeMode="contain" />
          </View>
          <View style={[styles.editBadge, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
            <Ionicons name="pencil" size={11} color={theme.bg} />
          </View>
        </TouchableOpacity>

        {/* Identité */}
        <View style={styles.identity}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('stats.profile.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[styles.name, { color: theme.textPrimary }]}
            maxLength={16}
            returnKeyType="done"
          />
          <Text style={[typography.arcadeHeading, styles.title, { color: theme.accent }]} numberOfLines={1}>
            {title}{honorific?.explorer ? ' ✦' : ''}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('stats.profile.totalFlashes', { count: total })}
          </Text>
        </View>
      </View>

      {/* Badge « profil local » */}
      <View style={styles.localRow}>
        <Ionicons name="phone-portrait-outline" size={12} color={theme.textSecondary} />
        <Text style={[styles.localText, { color: theme.textSecondary }]}>{t('stats.profile.localBadge')}</Text>
      </View>

      {/* Sélecteur d'avatar */}
      <Modal visible={picker} transparent animationType="fade" onRequestClose={() => setPicker(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[typography.arcadeTitle, styles.sheetTitle, { color: theme.textPrimary }]}>
              {t('stats.profile.chooseAvatar')}
            </Text>
            <View style={styles.grid}>
              {AVATARS.map((a) => {
                const selected = a.key === avatar;
                return (
                  <TouchableOpacity
                    key={a.key}
                    onPress={() => { setAvatar(a.key); setPicker(false); }}
                    style={[
                      styles.gridItem,
                      { backgroundColor: theme.surfaceHigh, borderColor: selected ? theme.accent : 'transparent' },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Image source={a.source} style={styles.gridImg} resizeMode="contain" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const RING = 72;
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: {
    width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 6,
  },
  avatar: { width: RING * 0.62, height: RING * 0.62 },
  editBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  identity: { flex: 1, marginLeft: 16 },
  name: { fontSize: 20, fontWeight: '800', paddingVertical: 2 },
  title: { marginTop: 2 },
  subtitle: { fontSize: 12, marginTop: 3 },
  localRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  localText: { fontSize: 11 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 360, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 20 },
  sheetTitle: { textAlign: 'center', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  gridItem: { width: 64, height: 64, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gridImg: { width: 40, height: 40 },
});
