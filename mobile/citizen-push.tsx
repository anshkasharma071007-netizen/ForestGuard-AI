import { useLanguage } from '@/i18n';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router, useRootNavigationState } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useCitizen } from '@/citizen-context';
import { SupportingText } from '@/components/Feedback';
import { SectionTitle } from '@/components/SectionTitle';
import { TextAction } from '@/components/TextAction';
import { useAppActive } from '@/hooks/useAppActive';
import { openPushEvent, type PushPreferences } from '@/services/api';
import { supportsPush, syncPushDevice } from '@/services/push-device';
import { spacing, typeScale, useTheme } from '@/theme';

export function CitizenPushCoordinator() {
  const { access, profile, selectAlertLocation } = useCitizen();
  const ready = Boolean(useRootNavigationState()?.key);
  const active = useAppActive();
  const enabled = Boolean(profile?.push.reports || profile?.push.nearby);
  const allowed = Boolean(profile?.location && profile.emailVerified);
  const handled = useRef<string | null>(null);
  const selectLocation = useRef(selectAlertLocation);
  selectLocation.current = selectAlertLocation;

  useEffect(() => {
    if (!supportsPush || !active || !allowed) return;
    let cleanup: (() => void) | undefined;
    let stopped = false;
    if (enabled) {
      void syncPushDevice(access, true).catch(() => {});
      void import('expo-notifications').then(notifications => {
        if (stopped) return;
        const subscription = notifications.addPushTokenListener(token => {
          void syncPushDevice(access, true, false, token).catch(() => {});
        });
        cleanup = () => subscription.remove();
      }).catch(() => {});
    }
    return () => { stopped = true; cleanup?.(); };
  }, [access, active, allowed, enabled]);

  useEffect(() => {
    if (!supportsPush || !ready || !allowed) return;
    let stopped = false;
    let cleanup: (() => void) | undefined;
    void import('expo-notifications').then(notifications => {
      if (stopped) return;
      notifications.setNotificationHandler({
        handleNotification: async ({ request }) => {
          const nearby = request.content.data?.kind === 'map';
          return { shouldShowBanner: nearby, shouldShowList: nearby, shouldPlaySound: false, shouldSetBadge: false };
        },
      });
      const open = async (response: NotificationResponse) => {
        const request = response.notification.request;
        if (handled.current === request.identifier) return;
        handled.current = request.identifier;
        const { id } = request.content.data ?? {};
        if (typeof id !== 'string') return;
        try {
          const target = await openPushEvent(access, id);
          if (stopped || access.signal?.aborted) return;
          if (target.screen === 'report') {
            router.push({ pathname: '/report-detail', params: { code: target.code } });
          } else {
            selectLocation.current({ source: 'saved' });
            router.push({ pathname: '/(tabs)/risk-map', params: { alert: String(target.alertId) } });
          }
        } catch { /* A stale or signed-out notification grants no access. */ }
        finally { if (!stopped) notifications.clearLastNotificationResponse(); }
      };
      const subscription = notifications.addNotificationResponseReceivedListener(response => void open(response));
      cleanup = () => subscription.remove();
      const last = notifications.getLastNotificationResponse();
      if (last) void open(last);
    }).catch(() => {});
    return () => { stopped = true; cleanup?.(); };
  }, [access, allowed, ready]);

  return null;
}

export function PushSettings() {
  const { t, errorText } = useLanguage();
  const { access, profile, savePush } = useCitizen();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  const [blocked, setBlocked] = useState(false);

  if (Platform.OS !== 'android' || !profile?.emailVerified) return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return <>
    <SectionTitle title={t('Push notifications')} />
    <SupportingText>{t('Use the Forest Guard AI Android development build to receive push notifications.')}</SupportingText>
  </>;

  const preferences = profile.push;
  const enabled = preferences.reports || preferences.nearby;
  async function update(next: PushPreferences, save: boolean) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError(false);
    setBlocked(false);
    try {
      if (save) await savePush(next);
      const wanted = next.reports || next.nearby;
      const registered = await syncPushDevice(access, wanted, wanted);
      if (access.signal?.aborted) return;
      if (wanted && !registered) {
        const notifications = await import('expo-notifications');
        const permission = await notifications.getPermissionsAsync();
        setBlocked(!permission.canAskAgain);
        setNotice('Allow notifications on this device to receive push messages.');
      } else if (registered) {
        setNotice('Push notifications are enabled on this device.');
      }
    } catch (failure) {
      if (access.signal?.aborted) return;
      setError(true);
      setNotice(failure instanceof Error ? failure.message : 'Could not update push notifications.');
    } finally {
      if (!access.signal?.aborted) setBusy(false);
    }
  }

  return <View style={{ gap: spacing.sm }}>
    <SectionTitle title={t('Push notifications')} />
    <View style={styles.preference}>
      <Text style={[typeScale.card, styles.label, { color: colors.primaryText }]}>{t('Report updates')}</Text>
      <Switch trackColor={{ false: colors.controlBorder, true: colors.softAccent }} thumbColor={colors.primaryAction} accessibilityLabel={t('Report updates')} value={preferences.reports} disabled={busy}
        onValueChange={reports => void update({ ...preferences, reports }, true)} />
    </View>
    <View style={styles.preference}>
      <Text style={[typeScale.card, styles.label, { color: colors.primaryText }]}>{t('Nearby verified wildlife alerts')}</Text>
      <Switch trackColor={{ false: colors.controlBorder, true: colors.softAccent }} thumbColor={colors.primaryAction} accessibilityLabel={t('Nearby verified wildlife alerts')} value={preferences.nearby}
        disabled={busy || !profile.savedAlertLocation}
        onValueChange={nearby => void update({ ...preferences, nearby }, true)} />
    </View>
    <SupportingText>{t('Nearby push alerts use your saved location and {radius} km radius.', { radius: profile.alertRadiusKm })}</SupportingText>
    {!!notice && <SupportingText error={error}>{error ? errorText(notice) : t(notice)}</SupportingText>}
    {blocked ? <TextAction label={t('Open Settings')} onPress={() => {
      void Linking.openSettings().catch(() => setNotice('Open device Settings to allow notifications.'));
    }} /> : enabled && <TextAction label={t('Enable on this device')} disabled={busy} onPress={() => void update(preferences, false)} />}
  </View>;
}

const styles = StyleSheet.create({
  preference: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { flex: 1 },
});
