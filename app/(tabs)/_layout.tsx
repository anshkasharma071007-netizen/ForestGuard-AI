import { Tabs } from 'expo-router';
import { Bell, FileText, Home, Map } from 'lucide-react-native';
import { useTheme } from '../../theme';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.lime,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: { backgroundColor: colors.deepForest, borderTopWidth: 0 },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      tabBarItemStyle: { minHeight: 48 },
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={22} color={color} /> }} />
      <Tabs.Screen name="risk-map" options={{ title: 'Map', tabBarIcon: ({ color }) => <Map size={22} color={color} /> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color }) => <Bell size={22} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Reports', tabBarIcon: ({ color }) => <FileText size={22} color={color} /> }} />
    </Tabs>
  );
}
