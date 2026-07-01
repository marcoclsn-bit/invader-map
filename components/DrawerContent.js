import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { typography } from '../theme/tokens';
import Logo from './Logo';

// ─── Élément de navigation ────────────────────────────────────────────────────

function NavItem({ icon, label, active, onPress, theme, badge }) {
  const filled = icon.endsWith('-outline') ? icon : (active ? icon : `${icon}-outline`);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.item, active && { backgroundColor: theme.accentDim }]}
      activeOpacity={0.7}
    >
      <Ionicons name={filled} size={20} color={active ? theme.accent : theme.textSecondary} />
      <Text style={[styles.label, { color: active ? theme.accent : theme.textPrimary }]}>{label}</Text>
      {badge > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <Text style={[styles.badgeText, { color: theme.bg }]}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Contenu du drawer ────────────────────────────────────────────────────────

export default function DrawerContent({ navigation, state }) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { dataVersion, newsUnreadCount } = useAppContext();
  const insets = useSafeAreaInsets();

  const currentRoute = state.routes[state.index]?.name;

  const mainItems = [
    { name: 'Tabs',     icon: 'map',          label: t('tabs.map') },
    { name: 'Liste',    icon: 'list',         label: t('tabs.list') },
    { name: 'News',     icon: 'newspaper',    label: t('news.title'), badge: newsUnreadCount },
    { name: 'Balade',   icon: 'walk',         label: t('stroll.title') },
    { name: 'Palmarès', icon: 'ribbon',       label: t('tabs.palmares') },
    { name: 'Stats',    icon: 'stats-chart',  label: t('tabs.stats') },
  ];

  function goTo(screen) {
    // "Tabs" = retour à l'expérience terrain (onglet Carte par défaut)
    if (screen === 'Tabs') { navigation.navigate('Tabs', { screen: 'Carte' }); return; }
    navigation.navigate(screen);
  }
  function goToModal(screen) {
    navigation.closeDrawer();
    navigation.getParent()?.navigate(screen);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, paddingTop: insets.top }]}>

      {/* En-tête : logo (variante auto selon le thème) en haut à gauche */}
      <View style={styles.appHeader}>
        <Logo size={44} />
        <Text style={[typography.arcadeTitle, { color: theme.accent, marginTop: 10 }]}>{t('common.appName')}</Text>
        {dataVersion ? (
          <Text style={[styles.version, { color: theme.textSecondary }]}>v{dataVersion}</Text>
        ) : null}
      </View>

      <View style={[styles.sep, { backgroundColor: theme.border }]} />

      {/* Navigation principale */}
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {mainItems.map(item => (
          <NavItem
            key={item.name}
            icon={item.icon}
            label={item.label}
            active={currentRoute === item.name}
            onPress={() => goTo(item.name)}
            theme={theme}
            badge={item.badge}
          />
        ))}

        <View style={[styles.sep, { backgroundColor: theme.border, marginVertical: 8 }]} />

        <NavItem
          icon="bulb-outline"
          label={t('feedback.idea.title')}
          onPress={() => goToModal('Idée')}
          theme={theme}
        />
        <NavItem
          icon="settings-outline"
          label={t('settings.title')}
          onPress={() => goToModal('Réglages')}
          theme={theme}
        />
        <NavItem
          icon="help-circle-outline"
          label={t('guide.title')}
          onPress={() => goToModal('Guide')}
          theme={theme}
        />
        <NavItem
          icon="information-circle-outline"
          label={t('about.title')}
          onPress={() => goToModal('À propos')}
          theme={theme}
        />
      </ScrollView>

      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1 },
  appHeader:  { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 20 },
  emoji:      { fontSize: 40 },
  version:    { fontSize: 11, marginTop: 4 },
  sep:        { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    marginHorizontal: 8, marginBottom: 2, borderRadius: 10,
  },
  label: {
    marginLeft: 14, fontSize: 14,
    fontFamily: 'Silkscreen_400Regular',
  },
  badge: {
    marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
