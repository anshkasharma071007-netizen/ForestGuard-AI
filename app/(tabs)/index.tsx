import { router } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { AdvisoryList } from '@/components/AdvisoryList';
import { NavigationRow } from '@/components/Controls';
import { SupportingText } from '@/components/Feedback';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { VillageSelector } from '@/components/VillageSelector';
import { usePublicData } from '@/hooks/usePublicData';
import { getPublicAlerts, type Village } from '@/services/api';
import { spacing } from '@/theme';

export default function HomeScreen() {
  const [area, setArea] = useState<Village | null>(null);
  const alerts = usePublicData(getPublicAlerts);

  return (
    <Screen tab>
      <ScreenHeader settings />
      <View style={styles.content}>
        <VillageSelector selected={area} onSelect={setArea} label="Area" />
        <View style={styles.group}>
          <SectionTitle title="Local wildlife risk" />
          <SupportingText>A verified risk rating is unavailable. Check field alerts for active advisories.</SupportingText>
        </View>
        <PrimaryButton label="Report an incident" icon="plus" onPress={() => router.push('/report')} />
        <View>
          <SectionTitle title={area ? 'Nearby alerts' : 'Latest alerts'}
            action={{ label: 'View all', onPress: () => router.navigate('/alerts') }} />
          <AdvisoryList state={alerts.state} retry={alerts.reload} villageName={area?.name} limit={2} />
        </View>
        <NavigationRow label="Safety guidelines" icon={BookOpen} onPress={() => router.push('/guidelines')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  group: { gap: spacing.xs },
});
