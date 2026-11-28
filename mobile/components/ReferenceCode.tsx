import { useLanguage } from '@/i18n';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, typeScale, useTheme } from '@/theme';
import { SupportingText } from './Feedback';
import { IconAction } from './IconAction';

export function ReferenceCode({ code }: { code: string }) {
  const { t } = useLanguage();
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(''), 2400);
    return () => clearTimeout(timeout);
  }, [feedback]);

  async function copy() {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setFeedback('');
    try {
      const copied = await Clipboard.setStringAsync(code);
      setFeedback(copied ? 'Copied' : 'Could not copy');
    } catch {
      setFeedback('Could not copy');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return <View style={styles.wrapper}>
    <View style={styles.row}>
      <Text selectable style={[typeScale.supporting, styles.reference, { color: colors.secondaryText }]}>{code}</Text>
      <IconAction icon={feedback === 'Copied' ? Check : Copy} label={t('Copy reference code')}
        onPress={() => void copy()} loading={busy} />
    </View>
    {!!feedback && <View accessibilityLiveRegion="polite"><SupportingText error={feedback !== 'Copied'}>{t(feedback)}</SupportingText></View>}
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  reference: { flexShrink: 1 },
});
