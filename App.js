import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppProvider } from './context/AppContext';
import MapScreen from './screens/MapScreen';
import ListScreen from './screens/ListScreen';
import TrajetScreen from './screens/TrajetScreen';
import ChasseScreen from './screens/ChasseScreen';
import PalmèresScreen from './screens/PalmèresScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Root = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
      }}
    >
      <Tab.Screen
        name="Carte"
        component={MapScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Liste"
        component={ListScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Trajet"
        component={TrajetScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'navigate' : 'navigate-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Chasse"
        component={ChasseScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Palmarès"
        component={PalmèresScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'ribbon' : 'ribbon-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
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
              headerTintColor: '#007AFF',
              headerTitleStyle: { color: '#1C1C1E' },
            }}
          />
        </Root.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
