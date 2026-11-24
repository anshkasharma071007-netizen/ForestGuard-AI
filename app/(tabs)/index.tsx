import { Link, router } from 'expo-router';
import { ChevronRight, CircleAlert, FileText, ShieldCheck } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionTitle } from '../../components/SectionTitle';
import { advisories, demoLocation } from '../../data';
import { radius, spacing, typography, useTheme } from '../../theme';

export default function HomeScreen() {
  const { colors } = useTheme();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <ScreenHeader />
    <View style={styles.eyebrow}><View style={[styles.dot, { backgroundColor: colors.moss }]} /><Text style={[styles.eyebrowText, { color: colors.moss }]}>PUBLIC SAFETY COMPANION</Text></View>
    <Text style={[styles.heading, { color: colors.primaryText }]}>Stay aware near the forest.</Text>
    <Text style={[styles.intro, { color: colors.secondaryText }]}>Official updates and simple guidance for communities around protected areas.</Text>

    <View style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.locationIcon, { backgroundColor: colors.successTint }]}><ShieldCheck size={22} color={colors.moss} /></View><View style={styles.locationCopy}><Text style={[styles.smallLabel, { color: colors.mutedText }]}>YOUR SELECTED AREA</Text><Text style={[styles.locationTitle, { color: colors.primaryText }]}>{demoLocation}</Text><Text style={[styles.locationDetail, { color: colors.secondaryText }]}>Updates are based on this area</Text></View><ChevronRight size={20} color={colors.mutedText} /></View>

    <View style={[styles.advisoryCard, { backgroundColor: colors.deepForest }]}><View style={styles.advisoryTop}><View style={styles.liveDot} /><Text style={[styles.smallLabel, { color: colors.lime }]}>NEARBY WILDLIFE ADVISORY</Text></View><Text style={styles.advisoryTitle}>Stay clear of stream edges after dusk.</Text><Text style={styles.advisoryText}>Recent movement was reported near the Turiya stream corridor. Keep a safe distance from the forest boundary.</Text><Text style={[styles.advisoryTime, { color: '#AAB8AD' }]}>Updated today at 07:40 by Forest Control</Text></View>

    <PrimaryButton label="Report a sighting" icon="plus" onPress={() => router.push('/report')} />
    <View style={styles.linkRow}><Link href="/history" asChild><Pressable style={styles.secondaryLink}><FileText size={17} color={colors.moss} /><Text style={[styles.secondaryLinkText, { color: colors.secondaryText }]}>View submitted reports</Text><ChevronRight size={17} color={colors.mutedText} /></Pressable></Link></View>

    <View style={styles.section}><SectionTitle title="Official advisories" action="View all" />{advisories.map((advisory) => <View key={advisory.id} style={[styles.advisoryRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.alertIcon, { backgroundColor: advisory.tone === 'amber' ? colors.warningTint : colors.successTint }]}><CircleAlert size={19} color={advisory.tone === 'amber' ? colors.amber : colors.moss} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.primaryText }]}>{advisory.title}</Text><Text style={[styles.rowDetail, { color: colors.mutedText }]} numberOfLines={2}>{advisory.detail}</Text><Text style={[styles.rowTime, { color: colors.mutedText }]}>{advisory.time}</Text></View></View>)}</View>
    <Link href="/guidelines" asChild><Pressable style={styles.guideline}><Text style={[styles.guidelineText, { color: colors.secondaryText }]}>Read safety guidelines</Text><ChevronRight size={17} color={colors.moss} /></Pressable></Link>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: 20, paddingBottom: 32 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  eyebrowText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heading: { fontFamily: typography.heading, fontSize: 28, lineHeight: 34, fontWeight: '700', marginBottom: spacing.sm },
  intro: { fontSize: 15, lineHeight: 23, marginBottom: spacing.xl },
  locationCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.md },
  locationIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  locationCopy: { flex: 1 },
  smallLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  locationTitle: { fontSize: 16, fontWeight: '700', marginTop: 3 },
  locationDetail: { fontSize: 12, marginTop: 3 },
  advisoryCard: { borderRadius: radius.card, padding: spacing.lg, marginBottom: spacing.md },
  advisoryTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C4E87A' },
  advisoryTitle: { color: '#F4F6ED', fontFamily: typography.heading, fontWeight: '700', fontSize: 22, lineHeight: 27, marginBottom: spacing.sm },
  advisoryText: { color: '#C2CDC2', fontSize: 14, lineHeight: 21 },
  advisoryTime: { fontSize: 11, marginTop: spacing.lg },
  linkRow: { alignItems: 'center', marginVertical: spacing.md },
  secondaryLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  secondaryLinkText: { flex: 1, fontSize: 14, fontWeight: '700' },
  section: { marginTop: spacing.lg },
  advisoryRow: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.card, padding: spacing.md, marginBottom: spacing.sm },
  alertIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  rowDetail: { fontSize: 13, lineHeight: 19 },
  rowTime: { fontSize: 11, marginTop: 8 },
  guideline: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E4DFD1', marginTop: spacing.sm },
  guidelineText: { fontSize: 14, fontWeight: '700' },
});
