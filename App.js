import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import NewsScreen from './screens/NewsScreen';
import StrollScreen from './screens/StrollScreen';
import SettingsScreen from './screens/SettingsScreen';
import AboutScreen from './screens/AboutScreen';
import IdeaScreen from './screens/IdeaScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import DrawerContent from './components/DrawerContent';

const Tab    = createBottomTabNavigator();
const Drawer = createDrawerNavigator();
const Root   = createNativeStackNavigator();

// ─── 3 onglets terrain ───────────────────────────────────────────────────────

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
      <Tab.Screen name="Trajet" component={TrajetScreen}
        options={{ tabBarLabel: t('tabs.route'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Chasse" component={ChasseScreen}
        options={{ tabBarLabel: t('tabs.hunt'), tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={size} color={color} /> }} />
    </Tab.Navigator>
  );
}

// ─── Drawer englobant les onglets + écrans secondaires ───────────────────────

function DrawerNavigator() {
  const { theme } = useTheme();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { width: 280, backgroundColor: theme.surface },
        overlayColor: 'rgba(0,0,0,0.45)',
      }}
    >
      {/* "Tabs" = écran par défaut (la tab bar à 3 onglets).
          Le menu (swipe) n'est accessible que depuis l'onglet Carte. */}
      <Drawer.Screen
        name="Tabs"
        component={MainTabs}
        options={({ route }) => {
          const tab = getFocusedRouteNameFromRoute(route) ?? 'Carte';
          return { swipeEnabled: tab === 'Carte' };
        }}
      />
      {/* Écrans accessibles via le menu hamburger */}
      <Drawer.Screen name="Liste" component={ListScreen} />
      <Drawer.Screen name="Palmarès" component={PalmèresScreen} />
      <Drawer.Screen name="Stats" component={StatsScreen} />
      <Drawer.Screen name="News" component={NewsScreen} />
      <Drawer.Screen name="Balade" component={StrollScreen} />
    </Drawer.Navigator>
  );
}

// ─── AppShell : onboarding ou app principale ─────────────────────────────────

function AppShell() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const { showOnboarding, completeOnboarding, loaded } = useAppContext();

  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  if (showOnboarding) {
    return (
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <OnboardingScreen onComplete={completeOnboarding} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer>
        <Root.Navigator screenOptions={{ headerShown: false }}>
          {/* Drawer (+ ses 3 onglets) comme écran principal */}
          <Root.Screen name="Main" component={DrawerNavigator} />
          {/* Modales accessibles depuis le drawer et partout */}
          <Root.Screen
            name="Réglages"
            component={SettingsScreen}
            options={{
              headerShown: true,
              title: t('settings.title'),
              presentation: 'modal',
              headerTintColor: theme.accent,
              headerTitleStyle: { fontFamily: 'Silkscreen_700Bold', fontSize: 16, color: theme.textPrimary },
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
              headerTitleStyle: { fontFamily: 'Silkscreen_700Bold', fontSize: 16, color: theme.textPrimary },
              headerStyle: { backgroundColor: theme.surface },
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
          <Root.Screen
            name="Idée"
            component={IdeaScreen}
            options={{
              headerShown: true,
              title: t('feedback.idea.title'),
              presentation: 'modal',
              headerTintColor: theme.accent,
              headerTitleStyle: { fontFamily: 'Silkscreen_700Bold', fontSize: 16, color: theme.textPrimary },
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
    Silkscreen_400Regular, Silkscreen_700Bold, PressStart2P_400Regular,
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

// ─── Racine ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <ThemedApp />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
