import { Capacitor } from '@capacitor/core';

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  data?: any;
}

export async function initCapacitorPush(
  onNotification?: (notification: PushNotificationPayload) => void,
  onToken?: (token: string) => void
): Promise<boolean> {
  // In-app notifications only - no external push or browser permission popups
  return true;
}


