import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { DevicePushToken } from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushDevice, unregisterPushDevice, type CitizenAccess } from '@/services/api';

const installationKey = 'forest-guard.push-installation';
export const supportsPush = Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
let pending: Promise<unknown> = Promise.resolve();
let installationPromise: Promise<string> | undefined;

function installationId() {
  installationPromise ??= (async () => {
    const saved = await AsyncStorage.getItem(installationKey);
    if (saved) return saved;
    const id = uuid.v4();
    await AsyncStorage.setItem(installationKey, id);
    return id;
  })().catch(error => {
    installationPromise = undefined;
    throw error;
  });
  return installationPromise;
}

export function syncPushDevice(access: CitizenAccess, enabled: boolean, prompt = false, nativeToken?: DevicePushToken) {
  const operation = pending.then(async () => {
    if (!supportsPush || access.signal?.aborted) return false;
    const notifications = await import('expo-notifications');
    const installation = await installationId();
    const remove = async () => {
      if (!access.signal?.aborted) await unregisterPushDevice(access, installation);
      return false;
    };
    if (!enabled) return remove();
    await notifications.setNotificationChannelAsync('forest-guard-alerts', {
      name: 'Van Saathi alerts', importance: notifications.AndroidImportance.HIGH,
    });
    let permission = await notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && prompt && !access.signal?.aborted) {
      permission = await notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return remove();
    if (access.signal?.aborted) return false;
    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error('This Android build needs an EAS project ID to receive notifications.');
    const token = await notifications.getExpoPushTokenAsync({ projectId, devicePushToken: nativeToken });
    if (access.signal?.aborted) return false;
    await registerPushDevice(access, installation, token.data);
    return true;
  });
  pending = operation.catch(() => undefined);
  return operation;
}

export async function clearDeviceNotifications() {
  if (!supportsPush) return;
  const notifications = await import('expo-notifications');
  notifications.clearLastNotificationResponse();
  await notifications.dismissAllNotificationsAsync();
}
