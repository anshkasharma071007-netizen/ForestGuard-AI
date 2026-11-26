import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { AdvisoryList } from '@/components/AdvisoryList';
import { EmptyState } from '@/components/EmptyState';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import { VillageSelector } from '@/components/VillageSelector';
import type { Village } from '@/services/api';
import { spacing } from '@/theme';

export default function HomeScreen() {
  const [area, setArea] = useState<Village | null>(null);

  return (
    <Screen tab>
      <ScreenHeader />
      <View style={styles.content}>
        <View style={styles.group}>
          <SectionTitle title="Area" />
          <VillageSelector selected={area} onSelect={setArea} />
        </View>
        <View>
          <SectionTitle title="Local wildlife risk" />
          <EmptyState title="Risk data unavailable" />
        </View>
        <PrimaryButton label="Report an incident" icon="plus" onPress={() => router.push('/report')} />
        <View style={styles.shortcuts}>
          <TextAction label="Map" onPress={() => router.navigate('/risk-map')} />
          <TextAction label="My reports" onPress={() => router.navigate('/history')} />
        </View>
        <View>
          <SectionTitle title="Latest alerts" action={{ label: 'View all', onPress: () => router.navigate('/alerts') }} />
          <AdvisoryList state={{ kind: 'unavailable' }} />
        </View>
        <TextAction label="Safety guidelines" onPress={() => router.push('/guidelines')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  group: { gap: spacing.sm },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
