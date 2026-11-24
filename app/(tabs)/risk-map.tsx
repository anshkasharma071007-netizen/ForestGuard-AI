import { MapPinned } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { spacing, typography, useTheme } from '../../theme';

export default function RiskMapScreen() {
  const { colors } = useTheme();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}><ScreenHeader showBell={false} /><Text style={[styles.heading, { color: colors.primaryText }]}>Risk map</Text><Text style={[styles.intro, { color: colors.secondaryText }]}>See official wildlife activity and safety notices around your selected area.</Text><EmptyState title="Map connection coming soon" detail="The live risk map will appear here when the Forest Guard service is connected." /><View style={[styles.note, { backgroundColor: colors.card, borderColor: colors.border }]}><MapPinned size={20} color={colors.moss} /><Text style={[styles.noteText, { color: colors.secondaryText }]}>For immediate safety concerns, contact your local forest office.</Text></View></ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingTop: 20 }, heading: { fontFamily: typography.heading, fontSize: 28, fontWeight: '700', marginBottom: spacing.sm }, intro: { fontSize: 15, lineHeight: 23, marginBottom: spacing.xl }, note: { marginTop: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, noteText: { flex: 1, fontSize: 14, lineHeight: 21 } });
