import { useLanguage } from '@/i18n';
import { ChevronDown, ChevronRight, PawPrint } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Advisory } from '@/services/api';
import { elevation, radius, spacing, typeScale, useTheme } from '@/theme';
import { RiskPill, SupportingText } from './Feedback';
import { PressableScale } from './PressableScale';

const severityInk = { high: 'clay', moderate: 'warningText', low: 'successText' } as const;
const severityTint = { high: 'dangerTint', moderate: 'warningTint', low: 'successTint' } as const;

export function AdvisoryList({ items, onSelect }: { items: Advisory[]; onSelect?: (ids: number[]) => void }) {
  const [expanded, setExpanded] = useState<number>();
  return <View style={styles.list}>
    {items.map(item => <AdvisoryRow key={item.id} item={item} expanded={expanded === item.id}
      onPress={() => onSelect ? onSelect([item.id]) : setExpanded(expanded === item.id ? undefined : item.id)} />)}
  </View>;
}

function AdvisoryRow({ item, expanded, onPress }: { item: Advisory; expanded: boolean; onPress: () => void }) {
  const { t, advisoryTitle, dateTime } = useLanguage();
  const { colors } = useTheme();
  const distance = item.distanceKm === undefined ? undefined
    : item.distanceKm === 0 ? t('Under 1 km away') : t('About {distance} km away', { distance: item.distanceKm });
  const level = item.severity === 'high' || item.severity === 'moderate' || item.severity === 'low' ? item.severity : undefined;
  return <PressableScale accessibilityState={{ expanded }} onPress={onPress} haptic="selection"
    style={[styles.row, elevation.subtle, { backgroundColor: colors.card, borderColor: colors.border }]}
    pressedStyle={{ borderColor: colors.focus }}>
    <View style={styles.heading}>
      <View style={[styles.icon, { backgroundColor: level ? colors[severityTint[level]] : colors.softAccent }]}>
        <PawPrint size={21} color={level ? colors[severityInk[level]] : colors.accent} />
      </View>
      <View style={styles.info}>
        <Text style={[typeScale.card, { color: colors.primaryText }]}>{advisoryTitle(item.title, item.speciesName)}</Text>
        <RiskPill severity={item.severity} />
        <SupportingText>{[distance, dateTime(item.publishedAt), item.isSimulated ? t('Simulated') : null].filter(Boolean).join(' · ')}</SupportingText>
      </View>
      <View style={[styles.chevron, { backgroundColor: colors.background }]}>
        {expanded ? <ChevronDown size={16} color={colors.accent} /> : <ChevronRight size={16} color={colors.accent} />}
      </View>
    </View>
    {expanded && <AdvisoryDetails item={item} />}
  </PressableScale>;
}

export function AdvisoryDetails({ item }: { item: Advisory }) {
  const { t, term, advisorySummary } = useLanguage();
  const { colors } = useTheme();
  return <View style={styles.details}>
    <SupportingText>{[item.villageNames.length && !item.isSimulated ? item.area : t(item.area), ...item.villageNames.filter(name => name !== item.area),
      term('alertStatus', item.status ?? 'active')].join(' · ')}</SupportingText>
    {item.summary && <Text style={[typeScale.body, { color: colors.primaryText }]}>{advisorySummary(item.summary)}</Text>}
    {!item.summary?.includes(item.advice ?? '') && item.advice &&
      <Text style={[typeScale.body, { color: colors.primaryText }]}>{t(item.advice)}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { gap: spacing.md, padding: spacing.md, borderRadius: radius.card, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 42, height: 44, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' },
  chevron: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  details: { gap: spacing.xs },
});
