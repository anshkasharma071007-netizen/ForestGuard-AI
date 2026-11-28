import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { Dropdown, InputField, SelectionRow } from '@/components/Controls';
import { Feedback, SupportingText } from '@/components/Feedback';
import { IconAction } from '@/components/IconAction';
import { ReportRow } from '@/components/ReportRow';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenReports } from '@/services/api';
import { spacing } from '@/theme';

import { reportFilters, reportStatuses } from '@/report-status';

export default function AllReports() {
  const { access } = useCitizen();
  const focused = useIsFocused();
  const active = useAppActive();
  const [search, setSearch] = useState('');
  const { status } = useLocalSearchParams<{ status?: string }>();
  const defaultFilter = reportFilters.find(option => option.id === status) ?? reportFilters[0];
  const [filter, setFilter] = useState(defaultFilter);
  useEffect(() => setFilter(defaultFilter), [defaultFilter]);
  const [expanded, setExpanded] = useState(false);
  const fetchReports = useCallback((signal: AbortSignal) => getCitizenReports(access, signal), [access]);
  const { state, reload, refreshing, refreshError } = usePublicData(fetchReports, focused && active, 10000);
  const query = search.trim().toLowerCase();
  const filtered = state.kind === 'ready' ? state.data.filter(
    (report) => (filter.id === 'all' || reportStatuses[report.status].group === filter.id)
      && (!query || [report.title, report.reference_code].some((text) => text.toLowerCase().includes(query))),
  ) : [];

  return <Screen refresh={{ onRefresh: reload, refreshing }} header={
    <ScreenHeader title="Report history" back action={<IconAction icon={RefreshCw} tone="header"
      label="Refresh all reports" loading={refreshing} onPress={reload} />} />
  }>
    <View style={{ gap: spacing.sm }}>
      <InputField label="Search reports" placeholder="Title or reference code" value={search} onChangeText={setSearch}
        autoCorrect={false} returnKeyType="search" />
      <Dropdown label={filter.label} accessibilityLabel={`Status filter: ${filter.label}`} expanded={expanded} onPress={() => setExpanded(!expanded)} />
      {expanded && <View accessibilityRole="radiogroup" accessibilityLabel="Report status">
        {reportFilters.map((option) => <SelectionRow key={option.id} label={option.label} selected={filter.id === option.id}
          onPress={() => { setFilter(option); setExpanded(false); }} />)}
      </View>}
      {state.kind === 'loading' && <Feedback title="Loading reports…" kind="loading" />}
      {'message' in state && <Feedback title="Could not load reports" detail={state.message} kind="error" retry={reload} />}
      {!!refreshError && <SupportingText error>{refreshError}</SupportingText>}
      {state.kind === 'ready' && (filtered.length
        ? filtered.map((report) => <ReportRow key={report.reference_code} report={report} showReference />)
        : <Feedback title={state.data.length ? 'No matching reports' : 'No reports yet'} />)}
    </View>
  </Screen>;
}
