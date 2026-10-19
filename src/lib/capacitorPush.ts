import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  data?: any;
}

const CHANNEL_ID = 'alkarrar_main_channel';
let isChannelCreated = false;
const notifiedTagsCache = new Map<string, number>();

/**
 * Initializes native notification channels and permissions
 */
export async function initCapacitorPush(
  onNotification?: (notification: PushNotificationPayload) => void,
  onToken?: (token: string) => void
): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      // 1. Create Android Notification Channel with high importance for lock screen & banner alerts
      if (!isChannelCreated) {
        try {
          await LocalNotifications.createChannel({
            id: CHANNEL_ID,
            name: 'تنبيهات الكرار للتقسيط',
            description: 'إشعارات وتنبيهات المبيعات والمواعيد والتعارضات المالية والتسديدات',
            importance: 5, // High importance (heads-up banner and sound on lockscreen)
            visibility: 1, // Public visibility (shows on lockscreen)
            sound: 'beep.wav',
            vibration: true,
            lights: true,
            lightColor: '#0d9488',
          });
          isChannelCreated = true;
        } catch (chanErr) {
          console.warn('[Push] Channel creation notice:', chanErr);
        }
      }

      // 2. Request local notification permissions if not already granted
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (permErr) {
        console.warn('[Push] Permission check notice:', permErr);
      }

      // 3. Register click listener to bring app to front or navigate
      try {
        await LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
          if (onNotification) {
            onNotification({
              title: notification.notification.title,
              body: notification.notification.body,
              data: notification.notification.extra,
            });
          }
        });
      } catch (listenerErr) {
        // Listener might already be active
      }

      return true;
    } else {
      // In Web / PWA browser: ensure service worker is active for web notifications
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          if (!navigator.serviceWorker.controller) {
            await navigator.serviceWorker.register('/sw.js').catch(() => null);
          }
        } catch (swErr) {
          console.warn('[Push] Web SW init notice:', swErr);
        }
      }
      return true;
    }
  } catch (err) {
    console.warn('[Push] initCapacitorPush error:', err);
    return false;
  }
}

/**
 * Checks if external device notifications are currently granted
 */
export async function isExternalNotificationEnabled(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === 'granted';
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
  } catch (e) {
    console.warn('[Push] isExternalNotificationEnabled check error:', e);
  }
  return false;
}

/**
 * Requests external device notification permission from the operating system
 */
export async function requestExternalNotificationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await LocalNotifications.requestPermissions();
      if (res.display === 'granted') {
        // Ensure channel exists
        await initCapacitorPush();
        return true;
      }
      return false;
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission().catch(() => 'denied');
      return perm === 'granted';
    }
  } catch (e) {
    console.warn('[Push] requestExternalNotificationPermission error:', e);
  }
  return false;
}

/**
 * Sends a single, deduplicated external notification to the device (APK Lockscreen/Notification bar or Web/PWA)
 */
export async function sendExternalNotification(
  title: string,
  body: string,
  options?: {
    id?: number;
    tag?: string;
    data?: any;
    vibrate?: number[];
    icon?: string;
    badge?: string;
  }
): Promise<boolean> {
  try {
    // Deduplication check: prevent firing identical notifications within 3 seconds
    const notifTag = options?.tag || `${title}_${body}`;
    const now = Date.now();
    const lastSent = notifiedTagsCache.get(notifTag);
    if (lastSent && now - lastSent < 3000) {
      return false; // Throttled burst duplicate
    }
    notifiedTagsCache.set(notifTag, now);
    if (notifiedTagsCache.size > 250) {
      for (const [k, t] of notifiedTagsCache.entries()) {
        if (now - t > 60000) notifiedTagsCache.delete(k);
      }
    }

    // 1. Native Capacitor Android / iOS (APK)
    if (Capacitor.isNativePlatform()) {
      try {
        const notifId = options?.id ?? Math.floor(Math.random() * 2147483640) + 1;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: notifId,
              title: title || 'الكرار للتقسيط',
              body: body || '',
              channelId: CHANNEL_ID,
              schedule: { at: new Date(Date.now() + 50) }, // Schedule immediately
              sound: 'beep.wav',
              extra: options?.data || {},
              smallIcon: 'ic_stat_icon_config_sample',
              iconColor: '#0d9488',
            },
          ],
        });
        return true;
      } catch (nativeErr) {
        console.warn('[Push] Native LocalNotifications.schedule error:', nativeErr);
      }
    }

    // 2. Web / PWA Browser on Mobile or Desktop
    const iconUrl = options?.icon || '/pwa-192x192.png';
    const badgeUrl = options?.badge || '/favicon.png';
    const webTag = options?.tag || `alkarrar-${Date.now()}`;
    const vibratePattern = options?.vibrate || [200, 100, 200];

    // Priority A: Try ServiceWorker showNotification (Works reliably in Chrome on Android & PWA)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        let reg = await navigator.serviceWorker.ready.catch(() => null);
        if (!reg) {
          const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
          reg = regs[0] || null;
        }

        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body: body || '',
            icon: iconUrl,
            badge: badgeUrl,
            tag: webTag,
            vibrate: vibratePattern,
            data: options?.data || {},
            renotify: true,
          });
          return true;
        }

        // Priority B: Post to active controller
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: {
              title,
              body,
              icon: iconUrl,
              badge: badgeUrl,
              tag: webTag,
              vibrate: vibratePattern,
              data: options?.data || {},
            },
          });
          return true;
        }
      } catch (swErr) {
        console.warn('[Push] ServiceWorker showNotification error:', swErr);
      }
    }

    // Priority C: Direct new Notification (Desktop Safari / Firefox / Chrome Desktop fallback)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: body || '',
          icon: iconUrl,
          badge: badgeUrl,
          tag: webTag,
          data: options?.data || {},
        });
        return true;
      } catch (directErr) {
        console.warn('[Push] Direct window.Notification error:', directErr);
      }
    }
  } catch (err) {
    console.warn('[Push] sendExternalNotification unexpected error:', err);
  }
  return false;
}
