import { AdvisoryProvider, useAdvisories } from '@/hooks/useAdvisories';
import { Tabs } from 'expo-router';
import { Bell, FileText, Home, Map } from 'lucide-react-native';
import { sizing, typeScale, typography, useTheme } from '../../theme';

export default function TabLayout() {
  return <AdvisoryProvider><ReportTabs /></AdvisoryProvider>;
}

function ReportTabs() {
  const { alerts, area } = useAdvisories();
  const count = alerts.state.kind === 'ready'
    ? alerts.state.data.items.filter((item) => !area || item.villageNames.includes(area.name)).length : 0;
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
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarBadge: count || undefined, tabBarIcon: ({ color }) => <Bell size={sizing.icon} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Reports', tabBarIcon: ({ color }) => <FileText size={sizing.icon} color={color} /> }} />
    </Tabs>
  );
}
