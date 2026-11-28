import { useLanguage } from '@/i18n';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { useAppActive } from '@/hooks/useAppActive';
import { usePublicData } from '@/hooks/usePublicData';
import { getCitizenNotifications, markCitizenNotificationsRead } from '@/services/api';
import { radius, sizing, spacing, typeScale, useTheme } from '@/theme';

function useInbox() {
  const { profile, access } = useCitizen();
  const active = useAppActive();
  const fetchInbox = useCallback((signal: AbortSignal) => getCitizenNotifications(access, signal), [access]);
  const resource = usePublicData(fetchInbox, !!profile?.location && active, 10000);
  const inbox = resource.state.kind === 'ready' ? resource.state.data : undefined;
  const [toast, setToast] = useState<{ event: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const mutation = useRef(false);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!inbox) return;
    const previous = seen.current;
    seen.current = new Set(inbox.items.map(({ id }) => id));
    if (!previous || !active) return;
    const added = inbox.items.filter(({ id, readAt }) => !readAt && !previous.has(id));
    if (added.length) setToast(added.length === 1 ? { event: added[0].event } : { event: null });
  }, [inbox, active]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function markRead(id?: string) {
    if (mutation.current) return false;
    mutation.current = true;
    setSaving(true);
    try {
      await markCitizenNotificationsRead(access, id);
      if (access.signal.aborted) return false;
      await resource.revalidate(access.signal);
      return !access.signal.aborted;
    } finally {
      mutation.current = false;
      if (!access.signal.aborted) setSaving(false);
    }
  }

  return { ...resource, inbox, toast: active ? toast : null, saving, markRead };
}

const NotificationsContext = createContext<ReturnType<typeof useInbox> | null>(null);

export function CitizenNotificationsProvider({ children }: PropsWithChildren) {
  const value = useInbox();
  const { t, term } = useLanguage();
  const { colors } = useTheme();
  return <NotificationsContext.Provider value={value}>
    {children}
    {!!value.toast && <View pointerEvents="none" style={styles.toastWrap}>
      <Text accessibilityLiveRegion="polite" style={[styles.toast, { color: colors.primaryText, backgroundColor: colors.card, borderColor: colors.controlBorder }]}>
        {value.toast.event ? term('event', value.toast.event, 'Report updated') : t('New report updates')}
      </Text>
    </View>}
  </NotificationsContext.Provider>;
}

export function useCitizenNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('Citizen notifications provider is missing.');
  return context;
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', bottom: 84, alignSelf: 'center', width: '100%', maxWidth: sizing.content, alignItems: 'center' },
  toast: { ...typeScale.action, borderRadius: radius.input, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
