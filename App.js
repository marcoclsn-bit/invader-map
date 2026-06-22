import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Silkscreen_400Regular, Silkscreen_700Bold } from '@expo-google-fonts/silkscreen';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { AppProvider } from './context/AppContext';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import MapScreen from './screens/MapScreen';
import ListScreen from './screens/ListScreen';
import TrajetScreen from './screens/TrajetScreen';
import ChasseScreen from './screens/ChasseScreen';
import PalmèresScreen from './screens/PalmèresScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator();

function MainTabs() {
  const { theme } = useTheme();
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
        options={{ tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Liste" component={ListScreen}
        options={{ tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Trajet" component={TrajetScreen}
        options={{ tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Chasse" component={ChasseScreen}
        options={{ tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={size} color={color} /> }} />
      <Tab.Screen name="Palmarès" component={PalmèresScreen}
        options={{ tabBarIcon: ({ color, size, focused }) =>
          <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={size} color={color} /> }} />
    </Tab.Navigator>
  );
}

function ThemedApp() {
  const { theme, isDark } = useTheme();

  const [fontsLoaded, fontError] = useFonts({
    Silkscreen_400Regular,
    Silkscreen_700Bold,
    PressStart2P_400Regular,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppProvider>
        <NavigationContainer>
          <Root.Navigator screenOptions={{ headerShown: false }}>
            <Root.Screen name="Main" component={MainTabs} />
            <Root.Screen
              name="Réglages"
              component={SettingsScreen}
              options={{
                headerShown: true,
                title: 'Réglages',
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
          </Root.Navigator>
        </NavigationContainer>
      </AppProvider>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
