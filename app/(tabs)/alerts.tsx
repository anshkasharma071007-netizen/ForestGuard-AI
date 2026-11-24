import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionTitle } from '../../components/SectionTitle';
import { advisories } from '../../data';
import { radius, spacing, typography, useTheme } from '../../theme';

export default function AlertsScreen() {
  const { colors } = useTheme();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}><ScreenHeader showBell={false} /><Text style={[styles.heading, { color: colors.primaryText }]}>Alerts</Text><Text style={[styles.intro, { color: colors.secondaryText }]}>Official notices for {`Pench Landscape`}.</Text><SectionTitle title="Current notices" />{advisories.map((item) => <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: item.tone === 'amber' ? colors.amber : colors.moss }]}>{item.label.toUpperCase()}</Text><Text style={[styles.title, { color: colors.primaryText }]}>{item.title}</Text><Text style={[styles.detail, { color: colors.secondaryText }]}>{item.detail}</Text><Text style={[styles.time, { color: colors.mutedText }]}>{item.time}</Text></View>)}</ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingTop: 20 }, heading: { fontFamily: typography.heading, fontSize: 28, fontWeight: '700', marginBottom: spacing.sm }, intro: { fontSize: 15, lineHeight: 23, marginBottom: spacing.xl }, card: { borderWidth: 1, borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.md }, label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: spacing.sm }, title: { fontFamily: typography.heading, fontSize: 20, fontWeight: '700', lineHeight: 26, marginBottom: spacing.sm }, detail: { fontSize: 14, lineHeight: 21 }, time: { fontSize: 11, marginTop: spacing.lg } });
