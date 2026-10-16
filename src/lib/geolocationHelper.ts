/**
 * Geolocation Helper with multi-tier fallback:
 * 1. Native Capacitor Geolocation (when running inside Android APK)
 * 2. Hardware GPS + Network / Wi-Fi Triangulation
 * 3. Offline GPS fix without requiring internet connection
 * 4. Graceful user-friendly Arabic error handling
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface GpsLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: 'gps_high' | 'gps_standard' | 'cached' | 'saved_customer';
}

export interface GpsErrorResult {
  code: number;
  message: string;
  messageAr: string;
  isPermissionDenied?: boolean;
}

export async function checkGeolocationPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await Geolocation.checkPermissions();
      if (status.location === 'granted') return 'granted';
      if (status.location === 'denied') return 'denied';
      return 'prompt';
    } catch (e) {
      return 'prompt';
    }
  }

  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.geolocation) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch (e) {
    return 'prompt';
  }
}

export async function captureDeviceLocation(
  onProgress?: (stage: string) => void
): Promise<{ location?: GpsLocationResult; error?: GpsErrorResult }> {
  // 1. If running as Native Android APK via Capacitor
  if (Capacitor.isNativePlatform()) {
    try {
      onProgress?.('جاري طلب إذن وتحديد موقع GPS في التطبيق...');
      const permStatus = await Geolocation.checkPermissions().catch(() => ({ location: 'prompt' }));
      if (permStatus.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          return {
            error: {
              code: 1,
              message: 'Location permission was denied',
              messageAr: 'يرجى تفعيل صلاحية الموقع لتطبيق الكرار من إعدادات الهاتف',
              isPermissionDenied: true,
            },
          };
        }
      }

      onProgress?.('جاري التقاط إحداثيات GPS...');
      const nativePos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });

      return {
        location: {
          latitude: nativePos.coords.latitude,
          longitude: nativePos.coords.longitude,
          accuracy: nativePos.coords.accuracy ? Math.round(nativePos.coords.accuracy) : undefined,
          source: 'gps_high',
        },
      };
    } catch (nativeErr: any) {
      console.warn('Native Capacitor Geolocation notice, falling back to Web API:', nativeErr);
      // Fall through to browser navigator.geolocation
    }
  }

  // 2. Standard Web / WebView Fallback with multi-tier acquisition
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      error: {
        code: 0,
        message: 'Geolocation is not supported on this device/browser',
        messageAr: 'خدمة تحديد الموقع الجغرافي GPS غير مدعومة',
        isPermissionDenied: false,
      },
    };
  }

  const tryGetPosition = (
    options: PositionOptions
  ): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  };

  try {
    // Attempt 1: High accuracy GPS (Works offline with hardware satellite lock)
    onProgress?.('جاري التقاط إشارة GPS...');
    try {
      const pos = await tryGetPosition({
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      });

      return {
        location: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          source: 'gps_high',
        },
      };
    } catch (highAccErr: any) {
      if (highAccErr?.code === 1) {
        return {
          error: {
            code: 1,
            message: 'Location access permission was denied',
            messageAr: 'يرجى تفعيل صلاحية الموقع من المتصفح أو إعدادات الهاتف 🔒',
            isPermissionDenied: true,
          },
        };
      }

      // Attempt 2: Standard accuracy / Cached position (Instant offline or network)
      onProgress?.('جاري محاولة الالتقاط البديل...');
      try {
        const fallbackPos = await tryGetPosition({
          enableHighAccuracy: false,
          timeout: 9000,
          maximumAge: 300000, // up to 5 minutes cached
        });

        return {
          location: {
            latitude: fallbackPos.coords.latitude,
            longitude: fallbackPos.coords.longitude,
            accuracy: Math.round(fallbackPos.coords.accuracy),
            source: 'gps_standard',
          },
        };
      } catch (fallbackErr: any) {
        const errCode = fallbackErr?.code || highAccErr?.code || 2;
        let messageAr = 'تعذر التقاط GPS، اضغط محاولة';
        let messageEn = 'Unable to capture GPS location';

        if (errCode === 1) {
          messageAr = 'يرجى تفعيل صلاحية الموقع في الهاتف/المتصفح 🔒';
          messageEn = 'Please allow location permission';
        } else if (errCode === 2) {
          messageAr = 'خدمة GPS غير مفعلة بالجهاز، يرجى تشغيل الموقع';
          messageEn = 'GPS service is disabled, please turn it on';
        } else if (errCode === 3) {
          messageAr = 'انتهت مهلة البحث عن الموقع، اضغط للمحاولة';
          messageEn = 'GPS timed out. Tap retry to fetch location';
        }

        return {
          error: {
            code: errCode,
            message: messageEn,
            messageAr: messageAr,
            isPermissionDenied: errCode === 1,
          },
        };
      }
    }
  } catch (err: any) {
    return {
      error: {
        code: 99,
        message: err?.message || 'Unknown GPS error',
        messageAr: 'حدث خطأ أثناء تحديد الموقع',
        isPermissionDenied: false,
      },
    };
  }
}
