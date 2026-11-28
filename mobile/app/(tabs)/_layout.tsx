import { Tabs } from 'expo-router';
import { House, Map, UserRound, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, sizing, typeScale, typography, useTheme } from '@/theme';

function TabIcon({ icon: Icon, focused }: { icon: LucideIcon; focused: boolean }) {
  const { colors } = useTheme();
  return <View style={{
    width: 54, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: focused ? colors.softAccent : 'transparent',
  }}><Icon size={20} color={focused ? colors.accent : colors.secondaryText} strokeWidth={focused ? 2.3 : 1.7} /></View>;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.secondaryText,
      tabBarStyle: {
        height: 60 + bottom, paddingTop: 3, paddingBottom: 4 + bottom,
        backgroundColor: colors.card, borderTopColor: colors.border,
      },
      tabBarLabelPosition: 'below-icon',
      tabBarLabelStyle: { fontSize: typeScale.supporting.fontSize, fontFamily: typography.strong },
      tabBarItemStyle: { minHeight: sizing.touch },
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: colors.background },
      freezeOnBlur: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon icon={House} focused={focused} /> }} />
      <Tabs.Screen name="risk-map" options={{ title: 'Map', tabBarIcon: ({ focused }) => <TabIcon icon={Map} focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon icon={UserRound} focused={focused} /> }} />
    </Tabs>
  );
}
