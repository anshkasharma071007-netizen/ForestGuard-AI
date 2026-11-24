import { Stack, router } from 'expo-router';
import { ArrowLeft, CheckCircle2, Clock3, Plus, RefreshCw, Search, XCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getReportStatus, isApiConfigured } from '../services/api';
import { loadStoredReports, saveStoredReport, type StoredReport } from '../services/report-storage';
import { spacing, radius, typography, useTheme } from '../theme';

type Status = StoredReport['status'];

export default function HistoryScreen() {
  const { colors } = useTheme();
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingError, setAddingError] = useState('');

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    setLoading(true);
    try { setReports(await loadStoredReports()); } catch { setError('Saved reports could not be loaded.'); } finally { setLoading(false); }
  }

  async function addReference() {
    const normalized = referenceCode.trim();
    if (!normalized) { setAddingError('Enter a reference code.'); return; }
    if (!isApiConfigured) { setAddingError('Status lookup is unavailable in demonstration mode.'); return; }
    setAdding(true); setAddingError('');
    try {
      const response = await getReportStatus(normalized);
      const saved: StoredReport = { referenceCode: response.reference_code, status: response.status, submittedAt: new Date().toISOString() };
      await saveStoredReport(saved);
      setReports(await loadStoredReports());
      setReferenceCode('');
    } catch (lookupError) { setAddingError(lookupError instanceof Error ? lookupError.message : 'That report could not be found.'); } finally { setAdding(false); }
  }

  async function refreshReport(report: StoredReport) {
    if (!isApiConfigured) return;
    try {
      const response = await getReportStatus(report.referenceCode);
      await saveStoredReport({ ...report, status: response.status });
      setReports(await loadStoredReports());
    } catch { setError('A report status could not be refreshed.'); }
  }

  return <><Stack.Screen options={{ headerShown: false }} /><ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={20} color={colors.primaryText} /><Text style={[styles.backText, { color: colors.primaryText }]}>Back to home</Text></Pressable><Text style={[styles.heading, { color: colors.primaryText }]}>Submitted reports</Text><Text style={[styles.intro, { color: colors.secondaryText }]}>Saved reference codes only. Personal details are not stored here.</Text><View style={[styles.lookup, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.lookupLabel, { color: colors.mutedText }]}>CHECK AN EXISTING REPORT</Text><View style={styles.lookupRow}><TextInput value={referenceCode} onChangeText={setReferenceCode} placeholder="e.g. FG-2408" placeholderTextColor={colors.mutedText} autoCapitalize="characters" style={[styles.lookupInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.primaryText }]} /><Pressable onPress={addReference} disabled={adding} style={[styles.lookupButton, { backgroundColor: colors.primaryAction, opacity: adding ? 0.6 : 1 }]}>{adding ? <ActivityIndicator size="small" color={colors.lime} /> : <Search size={19} color={colors.lime} />}</Pressable></View>{addingError ? <Text style={[styles.error, { color: colors.clay }]}>{addingError}</Text> : null}</View>{error ? <Text style={[styles.error, { color: colors.clay }]}>{error}</Text> : null}{loading ? <ActivityIndicator color={colors.moss} style={styles.loader} /> : reports.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Plus size={23} color={colors.moss} /><Text style={[styles.emptyTitle, { color: colors.primaryText }]}>No saved reports yet</Text><Text style={[styles.emptyText, { color: colors.mutedText }]}>Submitted report reference codes will appear here.</Text></View> : reports.map((report) => <ReportCard key={report.referenceCode} report={report} onRefresh={() => refreshReport(report)} colors={colors} />)}</ScrollView></>;
}

function ReportCard({ report, onRefresh, colors }: { report: StoredReport; onRefresh: () => void; colors: { card: string; border: string; primaryText: string; secondaryText: string; mutedText: string; moss: string; amber: string; clay: string } }) { const statusColor = report.status === 'closed' ? colors.mutedText : report.status === 'forwarded' ? colors.moss : colors.amber; const StatusIcon = report.status === 'closed' ? XCircle : report.status === 'forwarded' ? CheckCircle2 : Clock3; return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.cardTop}><Text style={[styles.code, { color: colors.moss }]}>{report.referenceCode}</Text><StatusIcon size={19} color={statusColor} /></View><Text style={[styles.title, { color: colors.primaryText }]}>Community report</Text><Text style={[styles.detail, { color: colors.secondaryText }]}>Saved {new Date(report.submittedAt).toLocaleDateString()}</Text><View style={styles.statusRow}><Text style={[styles.status, { color: statusColor }]}>{report.status}</Text><Pressable onPress={onRefresh} style={styles.refresh}><RefreshCw size={15} color={colors.moss} /><Text style={[styles.refreshText, { color: colors.secondaryText }]}>Refresh</Text></Pressable></View></View>; }

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingTop: 24, paddingBottom: 40 }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: spacing.xl }, backText: { fontSize: 14, fontWeight: '700' }, heading: { fontFamily: typography.heading, fontSize: 28, fontWeight: '700', marginBottom: spacing.sm }, intro: { fontSize: 15, lineHeight: 23, marginBottom: spacing.xl }, lookup: { borderWidth: 1, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.lg }, lookupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: spacing.sm }, lookupRow: { flexDirection: 'row', gap: spacing.sm }, lookupInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: radius.input, paddingHorizontal: spacing.md, fontSize: 15 }, lookupButton: { width: 48, minHeight: 48, borderRadius: radius.input, alignItems: 'center', justifyContent: 'center' }, error: { fontSize: 13, lineHeight: 19, marginBottom: spacing.md }, loader: { marginTop: spacing.xl }, empty: { borderWidth: 1, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', gap: spacing.sm }, emptyTitle: { fontFamily: typography.heading, fontSize: 18, fontWeight: '700' }, emptyText: { fontSize: 14, lineHeight: 21, textAlign: 'center' }, card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.md }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, code: { fontFamily: typography.mono, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, title: { fontFamily: typography.heading, fontSize: 19, fontWeight: '700', marginTop: spacing.md, marginBottom: 5 }, detail: { fontSize: 13 }, statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }, status: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, refresh: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 }, refreshText: { fontSize: 12, fontWeight: '700' } });
