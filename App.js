import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Silkscreen_400Regular, Silkscreen_700Bold } from '@expo-google-fonts/silkscreen';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './i18n';
import { AppProvider, useAppContext } from './context/AppContext';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import MapScreen from './screens/MapScreen';
import ListScreen from './screens/ListScreen';
import TrajetScreen from './screens/TrajetScreen';
import ChasseScreen from './screens/ChasseScreen';
import PalmèresScreen from './screens/PalmèresScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import AboutScreen from './screens/AboutScreen';
import OnboardingScreen from './screens/OnboardingScreen';

const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator();

function MainTabs() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.tabBarBg,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      }}
    >
      <Tab.Screen name="Carte" component={MapScreen}
        options={{ tabBarLabel: t('tabs.map'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Liste" component={ListScreen}
        options={{ tabBarLabel: t('tabs.list'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Trajet" component={TrajetScreen}
        options={{ tabBarLabel: t('tabs.route'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Chasse" component={ChasseScreen}
        options={{ tabBarLabel: t('tabs.hunt'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Palmarès" component={PalmèresScreen}
        options={{ tabBarLabel: t('tabs.palmares'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Stats" component={StatsScreen}
        options={{ tabBarLabel: t('tabs.stats'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'stats-chart' : 'stats-chart-outline'} size={size} color={color} /> }} />
    </Tab.Navigator>
  );
}

// ─── AppShell : affiche l'onboarding ou l'app principale ─────────────────────

function AppShell() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const { showOnboarding, completeOnboarding, loaded } = useAppContext();

  // Pendant le chargement AsyncStorage (très bref)
  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  // Premier lancement (ou replay depuis Réglages)
  if (showOnboarding) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen onComplete={completeOnboarding} />
      </>
    );
  }

  // App principale
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          <Root.Screen name="Main" component={MainTabs} />
          <Root.Screen
            name="Réglages"
            component={SettingsScreen}
            options={{
              headerShown: true,
              title: t('settings.title'),
              presentation: 'modal',
              headerTintColor: theme.accent,
              headerTitleStyle: {
                fontFamily: 'Silkscreen_700Bold',
                fontSize: 16,
                color: theme.textPrimary,
              },
              headerStyle: { backgroundColor: theme.surface },
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
          <Root.Screen
            name="À propos"
            component={AboutScreen}
            options={{
              headerShown: true,
              title: t('about.title'),
              headerTintColor: theme.accent,
              headerTitleStyle: {
                fontFamily: 'Silkscreen_700Bold',
                fontSize: 16,
                color: theme.textPrimary,
              },
              headerStyle: { backgroundColor: theme.surface },
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
        </Root.Navigator>
      </NavigationContainer>
    </>
  );
}

// ─── ThemedApp : attend les polices puis monte l'AppShell ─────────────────────

function ThemedApp() {
  const { theme } = useTheme();

  const [fontsLoaded, fontError] = useFonts({
    Silkscreen_400Regular,
    Silkscreen_700Bold,
    PressStart2P_400Regular,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ThemedApp />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
