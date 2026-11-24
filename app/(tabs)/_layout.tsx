import { Tabs } from 'expo-router';
import { Home, Map, Bell, Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';

export default function TabLayout() {
  const { colors } = useTheme();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.lime, tabBarInactiveTintColor: '#9AA99D', tabBarStyle: [styles.tabBar, { backgroundColor: colors.deepForest }], tabBarLabelStyle: styles.label, tabBarItemStyle: styles.item, tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabIcon color={String(color)} focused={focused}><Home size={22} color={color} /></TabIcon> }} />
    <Tabs.Screen name="risk-map" options={{ title: 'Risk Map', tabBarIcon: ({ color, focused }) => <TabIcon color={String(color)} focused={focused}><Map size={22} color={color} /></TabIcon> }} />
    <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: ({ color, focused }) => <TabIcon color={String(color)} focused={focused}><Bell size={22} color={color} /></TabIcon> }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, focused }) => <TabIcon color={String(color)} focused={focused}><Settings size={22} color={color} /></TabIcon> }} />
  </Tabs>;
}

function TabIcon({ children, color, focused }: { children: React.ReactNode; color: string; focused: boolean }) {
  return <View style={styles.icon}>{children}{focused && <View style={[styles.indicator, { backgroundColor: color }]} />}</View>;
}

const styles = StyleSheet.create({
  tabBar: { height: 76, paddingTop: 8, paddingBottom: 10, borderTopWidth: 0, elevation: 0 },
  item: { minHeight: 48 },
  label: { fontSize: 11, fontWeight: '600' },
  icon: { alignItems: 'center', justifyContent: 'center', height: 32, minWidth: 48 },
  indicator: { position: 'absolute', bottom: -2, width: 18, height: 3, borderRadius: 2 },
});
