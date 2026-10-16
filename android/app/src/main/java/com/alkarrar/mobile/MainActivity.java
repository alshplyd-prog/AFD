package com.alkarrar.mobile;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "AlkarrarNativeBT";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int PERMISSION_REQUEST_CODE = 404;

    private BluetoothAdapter bluetoothAdapter;
    private BroadcastReceiver syncReceiver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        } catch (Throwable e) {
            Log.w(TAG, "BluetoothAdapter init error: " + e.getMessage());
        }

        // Register receiver for sync events
        try {
            syncReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.i(TAG, "Sync broadcast received in MainActivity");
                    triggerWebSync();
                }
            };
            IntentFilter filter = new IntentFilter("com.alkarrar.mobile.INTERNET_RESTORED");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(syncReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(syncReceiver, filter);
            }
        } catch (Throwable e) {
            Log.w(TAG, "Failed to register syncReceiver: " + e.getMessage());
        }

        // Register Native Bluetooth & Printer Javascript Interface safely
        setupWebViewInterface();

        // Start Foreground Service for continuous background sync & network listening
        try {
            ForegroundSyncService.startSyncService(this);
        } catch (Throwable e) {
            Log.w(TAG, "ForegroundSyncService init error: " + e.getMessage());
        }

        // Enqueue background sync worker for periodic execution
        try {
            SyncWorker.enqueueWork(this);
        } catch (Throwable e) {
            Log.w(TAG, "SyncWorker init error: " + e.getMessage());
        }

        // Request all necessary permissions (Bluetooth, Location, Notifications) on startup
        checkAndRequestPermissions();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupWebViewInterface();
        triggerWebSync();
        checkAndRequestPermissions();
        try {
            ForegroundSyncService.startSyncService(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        triggerWebSync();
        try {
            ForegroundSyncService.triggerSyncNow(this);
            SyncWorker.enqueueImmediateWork(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        triggerWebSync();
        try {
            ForegroundSyncService.triggerSyncNow(this);
            SyncWorker.enqueueImmediateWork(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        triggerWebSync();
        try {
            ForegroundSyncService.triggerSyncNow(this);
            SyncWorker.enqueueImmediateWork(this);
        } catch (Throwable ignored) {}
        try {
            if (syncReceiver != null) {
                unregisterReceiver(syncReceiver);
            }
        } catch (Throwable ignored) {}
        super.onDestroy();
    }

    private void triggerWebSync() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            WebView webView = getBridge().getWebView();
                            if (webView != null) {
                                webView.evaluateJavascript(
                                    "if (typeof window !== 'undefined') {" +
                                    "  try { if (typeof window.alkarrarSendBeacon === 'function') { window.alkarrarSendBeacon(); } } catch (e) {}" +
                                    "  try { if (typeof window.alkarrarFlushQueue === 'function') { window.alkarrarFlushQueue(); } } catch (e) {}" +
                                    "}", null);
                            }
                        } catch (Throwable ignored) {}
                    }
                });
            }
        } catch (Throwable ignored) {}
    }

    private void setupWebViewInterface() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                ForegroundSyncService.setActiveWebView(webView);
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);
                settings.setMediaPlaybackRequiresUserGesture(false);

                PrinterJavascriptInterface nativeInterface = new PrinterJavascriptInterface();
                webView.addJavascriptInterface(nativeInterface, "AndroidPrinter");
                webView.addJavascriptInterface(nativeInterface, "AndroidInterface");
            }
        } catch (Throwable e) {
            Log.w(TAG, "Failed to attach AndroidPrinter JavascriptInterface: " + e.getMessage());
        }
    }

    @Override
    public void onBackPressed() {
        super.onBackPressed();
    }

    private void checkAndRequestPermissions() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                List<String> permissions = new ArrayList<>();

                // 1. Notification Permission (Android 13+ / API 33+)
                if (Build.VERSION.SDK_INT >= 33) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.POST_NOTIFICATIONS);
                    }
                }

                // 2. Bluetooth Permissions (Android 12+ vs Legacy)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
                    }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.BLUETOOTH_SCAN);
                    }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.BLUETOOTH_ADVERTISE);
                    }
                } else {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.BLUETOOTH);
                    }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_ADMIN) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.BLUETOOTH_ADMIN);
                    }
                }

                // 3. Location Permissions (Needed for Bluetooth scanning and network binding)
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
                }
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                }

                // 4. Storage Permissions (Android 12 and below)
                if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                    }
                    if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                    }
                }

                if (!permissions.isEmpty()) {
                    ActivityCompat.requestPermissions(MainActivity.this, permissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
                }

                // 5. Check and prompt to ignore battery optimizations for persistent background sync
                checkAndPromptBatteryOptimization();
            }
        });
    }

    private void checkAndPromptBatteryOptimization() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            }
            // Check exact alarms permission for Android 12+ (API 31+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "checkAndPromptBatteryOptimization note: " + e.getMessage());
        }
    }

    public class PrinterJavascriptInterface {
        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public boolean isBluetoothEnabled() {
            if (bluetoothAdapter == null) return false;
            return bluetoothAdapter.isEnabled();
        }

        @JavascriptInterface
        public boolean enableBluetooth() {
            if (bluetoothAdapter == null) return false;
            if (!bluetoothAdapter.isEnabled()) {
                try {
                    return bluetoothAdapter.enable();
                } catch (SecurityException se) {
                    Log.w(TAG, "SecurityException on enable(): " + se.getMessage());
                }
            }
            return true;
        }

        @JavascriptInterface
        public void requestPermissions() {
            checkAndRequestPermissions();
        }

        @JavascriptInterface
        public void requestAllAndroidPermissions() {
            checkAndRequestPermissions();
        }

        @JavascriptInterface
        public void requestExactAlarmPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(Context.ALARM_SERVICE);
                    if (am != null && !am.canScheduleExactAlarms()) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                        intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    }
                }
            } catch (Throwable e) {
                Log.w(TAG, "requestExactAlarmPermission error: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public boolean hasOverlayPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    return Settings.canDrawOverlays(MainActivity.this);
                }
                return true;
            } catch (Throwable e) {
                Log.w(TAG, "hasOverlayPermission check error: " + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public void requestOverlayPermission() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:" + getPackageName())
                    );
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return;
                }
            } catch (Throwable e) {
                Log.w(TAG, "requestOverlayPermission with package URI failed, attempting OEM & general fallback: " + e.getMessage());
            }

            // OEM-specific fallback for Xiaomi / MIUI / HyperOS
            String manufacturer = Build.MANUFACTURER.toLowerCase();
            if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                try {
                    Intent miuiIntent = new Intent("miui.intent.action.APP_PERM_EDITOR");
                    miuiIntent.setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity");
                    miuiIntent.putExtra("extra_pkgname", getPackageName());
                    miuiIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(miuiIntent);
                    return;
                } catch (Throwable ignored) {}
            }

            // General list fallback
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent fallbackIntent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                    fallbackIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallbackIntent);
                    return;
                }
            } catch (Throwable ignored) {}

            // Final fallback: Application Details Settings
            openAppSettings();
        }

        @JavascriptInterface
        public void openAppSettings() {
            try {
                Intent appSettings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                appSettings.setData(android.net.Uri.parse("package:" + getPackageName()));
                appSettings.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(appSettings);
            } catch (Throwable e) {
                Log.e(TAG, "openAppSettings error: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openOverlaySettings() {
            requestOverlayPermission();
        }

        @JavascriptInterface
        public void requestSystemAlertWindow() {
            requestOverlayPermission();
        }

        @JavascriptInterface
        public boolean isIgnoringBatteryOptimizations() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    android.os.PowerManager pm = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
                    return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
                }
                return true;
            } catch (Throwable e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestIgnoreBatteryOptimizations() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    String packageName = getPackageName();
                    android.os.PowerManager pm = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
                    if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                        try {
                            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                            intent.setData(android.net.Uri.parse("package:" + packageName));
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return;
                        } catch (Throwable ignored) {}

                        // Fallback to IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                        Intent generalIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        generalIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(generalIntent);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "requestIgnoreBatteryOptimizations error: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openBatterySettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Throwable e) {
                requestIgnoreBatteryOptimizations();
            }
        }

        @JavascriptInterface
        public void openAutoStartSettings() {
            try {
                String manufacturer = Build.MANUFACTURER.toLowerCase();
                Intent intent = new Intent();
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
                    intent.setComponent(new android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
                    intent.setComponent(new android.content.ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                } else if (manufacturer.contains("oppo") || manufacturer.contains("realme")) {
                    intent.setComponent(new android.content.ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
                } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo")) {
                    intent.setComponent(new android.content.ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
                } else if (manufacturer.contains("samsung")) {
                    intent.setComponent(new android.content.ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"));
                } else {
                    intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(android.net.Uri.parse("package:" + getPackageName()));
                }
                startActivity(intent);
            } catch (Throwable e) {
                Log.w(TAG, "Specific auto-start intent failed, opening general app settings: " + e.getMessage());
                try {
                    Intent appSettings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    appSettings.setData(android.net.Uri.parse("package:" + getPackageName()));
                    appSettings.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(appSettings);
                } catch (Throwable ignored) {}
            }
        }

        @JavascriptInterface
        public void setKeepScreenOn(final boolean keepOn) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (keepOn) {
                            getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        } else {
                            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        }
                    } catch (Throwable ignored) {}
                }
            });
        }

        @JavascriptInterface
        public boolean isKeepScreenOn() {
            try {
                int flags = getWindow().getAttributes().flags;
                return (flags & android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0;
            } catch (Throwable e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestBackgroundExecution() {
            requestIgnoreBatteryOptimizations();
        }

        @JavascriptInterface
        public void enableBackgroundSync() {
            requestIgnoreBatteryOptimizations();
        }

        @JavascriptInterface
        public void syncPendingQueueToNative(String queueJson, String serverUrl) {
            try {
                ForegroundSyncService.persistPendingQueueFromWeb(MainActivity.this, queueJson, serverUrl);
            } catch (Throwable e) {
                Log.w(TAG, "Error in syncPendingQueueToNative: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public String getPendingQueueFromNative() {
            try {
                return ForegroundSyncService.readNativePendingQueue(MainActivity.this);
            } catch (Throwable e) {
                Log.w(TAG, "Error in getPendingQueueFromNative: " + e.getMessage());
                return "[]";
            }
        }

        @JavascriptInterface
        public void triggerBackgroundSyncNow() {
            try {
                ForegroundSyncService.triggerSyncNow(MainActivity.this);
                SyncWorker.enqueueImmediateWork(MainActivity.this);
            } catch (Throwable e) {
                Log.w(TAG, "Error in triggerBackgroundSyncNow: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void triggerImmediateCloseSync(final String queueJson, final String serverUrl) {
            try {
                if (queueJson != null && !queueJson.trim().isEmpty()) {
                    ForegroundSyncService.persistPendingQueueFromWeb(MainActivity.this, queueJson, serverUrl);
                }
                ForegroundSyncService.triggerSyncNow(MainActivity.this);
                SyncWorker.enqueueImmediateWork(MainActivity.this);
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            ForegroundSyncService.performNativeStorageSync(MainActivity.this);
                        } catch (Throwable ignored) {}
                    }
                }).start();
            } catch (Throwable e) {
                Log.w(TAG, "Error in triggerImmediateCloseSync: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openBluetoothSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "openBluetoothSettings error: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public String getBondedDevices() {
            JSONArray array = new JSONArray();
            if (bluetoothAdapter == null) {
                return array.toString();
            }

            // Auto enable if disabled
            if (!bluetoothAdapter.isEnabled()) {
                try {
                    bluetoothAdapter.enable();
                } catch (Exception ignored) {}
            }

            try {
                Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
                if (pairedDevices != null) {
                    for (BluetoothDevice device : pairedDevices) {
                        JSONObject obj = new JSONObject();
                        String name = device.getName();
                        String addr = device.getAddress();
                        obj.put("name", name != null && !name.trim().isEmpty() ? name : "طابعة بلوتوث (" + addr + ")");
                        obj.put("address", addr != null ? addr : "");
                        obj.put("id", addr != null ? addr : "");
                        array.put(obj);
                    }
                }
            } catch (SecurityException se) {
                Log.w(TAG, "SecurityException in getBondedDevices: " + se.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "Error in getBondedDevices: " + e.getMessage());
            }
            return array.toString();
        }

        @JavascriptInterface
        public String printBase64Bytes(String targetAddressOrName, String base64Data) {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                return "{\"success\": false, \"message\": \"البلوتوث غير مفعّل على الهاتف. يرجى تشغيله\"}";
            }

            BluetoothDevice targetDevice = findDevice(targetAddressOrName);
            if (targetDevice == null) {
                return "{\"success\": false, \"message\": \"لم يتم العثور على الطابعة المقترنة. يرجى الاقتران بالطابعة في إعدادات بلوتوث الهاتف أولاً\"}";
            }

            BluetoothSocket socket = null;
            OutputStream outStream = null;

            try {
                byte[] rawBytes = Base64.decode(base64Data, Base64.DEFAULT);

                // Cancel discovery before connecting to speed up connection
                try {
                    bluetoothAdapter.cancelDiscovery();
                } catch (Exception ignored) {}

                // Method 1: Standard SPP RFCOMM socket
                try {
                    socket = targetDevice.createRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (Exception connErr) {
                    Log.w(TAG, "Standard SPP socket failed, trying fallback port 1: " + connErr.getMessage());
                    // Method 2: Reflection fallback for generic POS thermal printers
                    try {
                        if (socket != null) {
                            try { socket.close(); } catch (Exception ignored) {}
                        }
                        java.lang.reflect.Method m = targetDevice.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                        socket = (BluetoothSocket) m.invoke(targetDevice, 1);
                        if (socket != null) {
                            socket.connect();
                        }
                    } catch (Exception reflectionErr) {
                        Log.e(TAG, "Reflection fallback connection failed: " + reflectionErr.getMessage());
                        throw connErr;
                    }
                }

                if (socket != null && socket.isConnected()) {
                    outStream = socket.getOutputStream();
                    outStream.write(rawBytes);
                    outStream.flush();

                    // Short sleep to allow hardware buffer to print cleanly
                    Thread.sleep(200);

                    return "{\"success\": true, \"message\": \"تمت الطباعة المباشرة بنجاح\"}";
                } else {
                    return "{\"success\": false, \"message\": \"تعذر فتح قناة الاتصال مع الطابعة\"}";
                }
            } catch (Exception e) {
                Log.e(TAG, "Print error: " + e.getMessage());
                return "{\"success\": false, \"message\": \"فشل الاتصال بالطابعة: " + (e.getMessage() != null ? e.getMessage() : "خطأ غير معروف") + "\"}";
            } finally {
                if (outStream != null) {
                    try { outStream.close(); } catch (Exception ignored) {}
                }
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface
        public String printReceiptText(String targetAddressOrName, String text) {
            byte[] textBytes = text.getBytes(StandardCharsets.UTF_8);
            String base64 = Base64.encodeToString(textBytes, Base64.NO_WRAP);
            return printBase64Bytes(targetAddressOrName, base64);
        }

        @JavascriptInterface
        public boolean printRawBT(String text) {
            try {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setPackage("ru.a404m.rawbt");
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e1) {
                try {
                    Intent intent2 = new Intent(Intent.ACTION_VIEW);
                    intent2.setData(android.net.Uri.parse("rawbt:text;base64," + Base64.encodeToString(text.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP)));
                    intent2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent2);
                    return true;
                } catch (Exception e2) {
                    Log.e(TAG, "printRawBT failed: " + e2.getMessage());
                    return false;
                }
            }
        }

        @JavascriptInterface
        public void printEscPos(String text) {
            printReceiptText("", text);
        }

        @JavascriptInterface
        public void printReceipt(String text) {
            printReceiptText("", text);
        }

        @JavascriptInterface
        public void printBluetooth(String text) {
            printReceiptText("", text);
        }

        private BluetoothDevice findDevice(String addressOrName) {
            if (bluetoothAdapter == null) return null;
            try {
                Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
                if (pairedDevices == null || pairedDevices.isEmpty()) return null;

                if (addressOrName != null && !addressOrName.trim().isEmpty() && !addressOrName.contains("طابعة")) {
                    String query = addressOrName.trim().toLowerCase();
                    // 1. Match by exact address MAC
                    for (BluetoothDevice device : pairedDevices) {
                        if (device.getAddress() != null && device.getAddress().equalsIgnoreCase(query)) {
                            return device;
                        }
                    }
                    // 2. Match by partial or exact name
                    for (BluetoothDevice device : pairedDevices) {
                        if (device.getName() != null && device.getName().toLowerCase().contains(query)) {
                            return device;
                        }
                    }
                }

                // 3. Match devices with typical thermal printer names
                for (BluetoothDevice device : pairedDevices) {
                    String name = (device.getName() != null ? device.getName() : "").toLowerCase();
                    if (name.contains("print") || name.contains("pos") || name.contains("thermal") ||
                        name.contains("mpt") || name.contains("rpp") || name.contains("rp") ||
                        name.contains("58") || name.contains("80") || name.contains("bt") ||
                        name.contains("6ba1") || name.contains("xprinter") || name.contains("rongta") ||
                        name.contains("sunmi") || name.contains("ble")) {
                        return device;
                    }
                }

                // Default to first paired device if only one or none specified
                return pairedDevices.iterator().next();
            } catch (SecurityException se) {
                Log.w(TAG, "findDevice SecurityException: " + se.getMessage());
                return null;
            } catch (Exception e) {
                Log.e(TAG, "findDevice error: " + e.getMessage());
                return null;
            }
        }
    }
}
