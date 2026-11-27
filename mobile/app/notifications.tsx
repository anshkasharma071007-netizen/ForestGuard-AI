import { router } from 'expo-router';
import { ChevronRight, RefreshCw } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { eventLabels, useCitizenNotifications } from '@/citizen-notifications';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextAction } from '@/components/TextAction';
import type { CitizenNotification } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';

export default function Notifications() {
  const { inbox, state, saving, markRead, reload, refreshing, refreshError } = useCitizenNotifications();
  const { colors } = useTheme();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string>();
  const busy = useRef(false);

  async function open(item?: CitizenNotification) {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setOpening(item?.id);
    try {
      if ((!item || !item.readAt) && !await markRead(item?.id)) return;
      if (item) router.push({ pathname: '/report-detail', params: { code: item.code } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update notifications.');
    } finally {
      busy.current = false;
      setOpening(undefined);
    }
  }

  return <Screen>
    <ScreenHeader title="Notifications" back action={<IconAction icon={RefreshCw} label="Refresh notifications" loading={refreshing} onPress={reload} />} />
    <View style={styles.list}>
      {inbox && <View style={styles.header}>
        <SupportingText>{inbox.unread} unread</SupportingText>
        <TextAction label="Mark all as read" onPress={() => void open()} disabled={!inbox.unread || saving} loading={saving && !opening} />
      </View>}
      {state.kind === 'loading' && <Feedback title="Loading notifications…" kind="loading" />}
      {'message' in state && <Feedback title="Could not load notifications" detail={state.message} kind="error" retry={reload} />}
      {!!(error || refreshError) && <SupportingText error>{error || refreshError}</SupportingText>}
      {inbox?.items.length === 0 && <Feedback title="No notifications" />}
      {inbox?.items.map((item) => <Pressable key={item.id} accessibilityRole="button"
        accessibilityLabel={`${eventLabels[item.event] ?? 'Report updated'}, ${item.reportTitle ?? item.code}${item.readAt ? '' : ', unread'}`}
        accessibilityState={{ busy: opening === item.id, disabled: saving }} disabled={saving}
        onPress={() => void open(item)} style={({ pressed }) => [styles.item, { borderColor: colors.border,
          backgroundColor: pressed ? colors.successTint : colors.card }]}>
        {!item.readAt && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
        <View style={styles.info}>
          <Text style={[typeScale.card, { color: colors.primaryText }]}>{eventLabels[item.event] ?? 'Report updated'}</Text>
          <Text style={[typeScale.body, { color: colors.primaryText }]}>{item.reportTitle ?? item.code}</Text>
          <SupportingText>{new Date(item.createdAt).toLocaleString()}</SupportingText>
        </View>
        <ChevronRight size={16} color={colors.mutedText} />
      </Pressable>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  item: { borderWidth: 1, borderRadius: radius.input, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  info: { flex: 1, gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
