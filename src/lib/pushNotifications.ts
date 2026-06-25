import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { SurpriseStop } from '../types/trip';

export type PushDevice = {
  deviceId: string;
  enabled: boolean;
  token: string;
  updatedAt: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForSurprisePushNotifications(
  deviceId: string,
): Promise<PushDevice> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      importance: Notifications.AndroidImportance.MAX,
      name: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Notification permission not granted');
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Expo project id missing');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  return {
    deviceId,
    enabled: true,
    token,
    updatedAt: new Date().toISOString(),
  };
}

export async function sendSurpriseRevealPushNotifications({
  devices,
  senderDeviceId,
  surprise,
}: {
  devices: PushDevice[];
  senderDeviceId: string;
  surprise: SurpriseStop;
}) {
  const messages = devices
    .filter((device) => device.enabled && device.deviceId !== senderDeviceId)
    .map((device) => ({
      to: device.token,
      sound: 'default',
      title: 'A surprise was revealed',
      body: surprise.title,
      data: {
        screen: 'surprise',
        surpriseId: surprise.id,
      },
    }));

  if (messages.length === 0) {
    return;
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(messages),
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}
