import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  checksum?: string;
}

export class AppUpdaterService {
  private static isInitialized = false;

  /**
   * Initializes Capgo Capacitor Updater listeners and notifies app ready.
   * Capgo requires `notifyAppReady()` on app startup to confirm the new build works safely.
   * If `notifyAppReady()` is not called, Capgo automatically rolls back to the previous version on next launch.
   */
  static async init() {
    if (!Capacitor.isNativePlatform() || this.isInitialized) {
      return;
    }

    try {
      this.isInitialized = true;
      // Confirm that the current bundle loaded successfully (prevents automatic rollback)
      await CapacitorUpdater.notifyAppReady();
      console.log('Capgo Updater initialized: notifyAppReady sent.');

      // Setup listeners safely
      (CapacitorUpdater as any).addListener?.('downloadProgress', (progress: any) => {
        console.log(`Update downloading: ${progress?.percent}%`);
      });

      (CapacitorUpdater as any).addListener?.('updateAvailable', (info: any) => {
        console.log('Update available event:', info);
      });
    } catch (error) {
      console.error('Error initializing Capgo Capacitor Updater:', error);
    }
  }

  /**
   * Check for a new release bundle (e.g., from GitHub Releases or custom API server)
   */
  static async checkForUpdates(customUpdateUrl?: string): Promise<{ available: boolean; version?: string }> {
    if (!Capacitor.isNativePlatform()) {
      return { available: false };
    }

    try {
      const current = await CapacitorUpdater.current();
      console.log('Current bundle version:', current.bundle.version);

      if (customUpdateUrl) {
        const response = await fetch(customUpdateUrl);
        if (response.ok) {
          const data: UpdateInfo = await response.json();
          if (data.version && data.version !== current.bundle.version && data.downloadUrl) {
            return { available: true, version: data.version };
          }
        }
      }

      return { available: false };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { available: false };
    }
  }

  /**
   * Downloads and applies the update package (.zip of web assets dist) in the background.
   */
  static async downloadAndApplyUpdate(updateInfo: UpdateInfo): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      console.log(`Downloading update version ${updateInfo.version} from ${updateInfo.downloadUrl}...`);
      
      const version = await CapacitorUpdater.download({
        url: updateInfo.downloadUrl,
        version: updateInfo.version,
      });

      if (version) {
        console.log('Update downloaded successfully, setting active bundle...');
        await CapacitorUpdater.set({ id: version.id });
        console.log('Update set as active bundle. Will take effect on app restart.');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to download and apply update:', error);
      return false;
    }
  }

  /**
   * Immediately reloads the app to display the newly downloaded update.
   */
  static async reloadApp() {
    if (Capacitor.isNativePlatform()) {
      try {
        await CapacitorUpdater.reload();
      } catch (e) {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  }
}
