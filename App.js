import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppProvider } from './context/AppContext';
import MapScreen from './screens/MapScreen';
import ListScreen from './screens/ListScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
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
        </Tab.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
