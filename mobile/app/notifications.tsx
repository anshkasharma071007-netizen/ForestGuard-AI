import { useLanguage } from '@/i18n';
import { router } from 'expo-router';
import { ChevronRight, CircleCheck, CircleX, ClipboardCheck, FileCheck2, RefreshCw } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCitizenNotifications } from '@/citizen-notifications';
import { Feedback, RiskPill, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import type { CitizenNotification } from '@/services/api';
import { radius, spacing, typeScale, useTheme } from '@/theme';

const eventIcons = { submitted: FileCheck2, approved: ClipboardCheck, rejected: CircleX, resolved: CircleCheck };
const groups = ['Today', 'Yesterday', 'Earlier'] as const;

function groupNotifications(items: CitizenNotification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const grouped: Record<typeof groups[number], CitizenNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const timestamp = Date.parse(item.createdAt);
    grouped[timestamp >= today.getTime() ? 'Today' : timestamp >= yesterday.getTime() ? 'Yesterday' : 'Earlier'].push(item);
  }
  return grouped;
}

export default function Notifications() {
  const { t, term, errorText, dateTime } = useLanguage();
  const { inbox, state, saving, markRead, reload, refreshing, refreshError } = useCitizenNotifications();
  const { colors } = useTheme();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string>();
  const busy = useRef(false);
  const grouped = groupNotifications(inbox?.items ?? []);

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

  return <Screen refresh={{ onRefresh: reload, refreshing }} header={
    <ScreenHeader title={t('Notifications')} back action={<IconAction icon={RefreshCw} tone="header"
      label={t('Refresh notifications')} loading={refreshing} onPress={reload} />} />
  }>
    <View style={styles.list}>
      {!!inbox?.items.length && <View style={styles.header}>
        <SupportingText>{t('{count} unread', { count: inbox.unread })}</SupportingText>
        <TextAction label={t('Mark all as read')} onPress={() => void open()} disabled={!inbox.unread || saving} loading={saving && !opening} />
      </View>}
      {state.kind === 'loading' && <Feedback title={t('Loading notifications…')} kind="loading" />}
      {'message' in state && <Feedback title={t('Could not load notifications')} detail={state.message} kind="error" retry={reload} />}
      {!!(error || refreshError) && <SupportingText error>{errorText(error || refreshError)}</SupportingText>}
      {inbox?.items.length === 0 && <Feedback title={t('No notifications yet')} detail={t('Updates about your reports will appear here.')} />}
      {groups.map(group => grouped[group].length > 0 && <View style={styles.group} key={group}>
        <SectionTitle title={t(group)} />
        {grouped[group].map(item => {
          const Icon = eventIcons[item.event as keyof typeof eventIcons] ?? FileCheck2;
          const label = term('event', item.event, 'Report updated');
          const rejected = item.event === 'rejected';
          return <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={`${label}, ${item.reportTitle ?? item.code}${item.readAt ? '' : ', ' + t('unread')}`}
            accessibilityState={{ busy: opening === item.id, disabled: saving }} disabled={saving}
            onPress={() => void open(item)} style={({ pressed }) => [styles.item, {
              borderColor: item.readAt ? colors.border : colors.controlBorder,
              backgroundColor: pressed || !item.readAt ? colors.softAccent : colors.card,
            }]}>
            <View style={[styles.icon, { backgroundColor: rejected ? colors.dangerTint : colors.card }]}>
              <Icon size={19} color={rejected ? colors.clay : colors.accent} />
            </View>
            <View style={styles.info}>
              <Text style={[typeScale.card, { color: colors.primaryText }]}>{label}</Text>
              <SupportingText>{item.reportTitle ?? item.code}</SupportingText>
              <SupportingText>{dateTime(item.createdAt)}</SupportingText>
              {item.risk && <RiskPill severity={item.risk} />}
            </View>
            {!item.readAt && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
            <ChevronRight size={17} color={colors.secondaryText} />
          </Pressable>;
        })}
      </View>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  group: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  item: { borderWidth: 1, borderRadius: radius.input, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 38, height: 38, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
