import { Tabs } from 'expo-router';
import { Home, Map, UserRound } from 'lucide-react-native';
import { sizing, typeScale, typography, useTheme } from '../../theme';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.lime,
      tabBarInactiveTintColor: colors.tabInactive,
      tabBarStyle: { backgroundColor: colors.deepForest, borderTopWidth: 0 },
      tabBarLabelStyle: { fontSize: typeScale.supporting.fontSize, fontFamily: typography.strong },
      tabBarItemStyle: { minHeight: sizing.touch },
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: colors.background },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={sizing.icon} color={color} /> }} />
      <Tabs.Screen name="risk-map" options={{ title: 'Map', tabBarIcon: ({ color }) => <Map size={sizing.icon} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserRound size={sizing.icon} color={color} /> }} />
    </Tabs>
  );
}
