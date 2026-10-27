package com.alkarrar.mobile;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class ForegroundSyncService extends Service {
    private static final String TAG = "ForegroundSyncService";
    private static final String CHANNEL_ID = "alkarrar_sync_channel";
    private static final int NOTIFICATION_ID = 9981;

    private static final String[] CANDIDATE_SYNC_URLS = {
        "http://72.62.158.128:3000/api/sync/batch",
        "https://ais-dev-asc5xuvnur4hlmpl5rfxpz-655986077616.europe-west2.run.app/api/sync/batch",
        "https://ais-pre-asc5xuvnur4hlmpl5rfxpz-655986077616.europe-west2.run.app/api/sync/batch"
    };

    private static WeakReference<WebView> activeActivityWebView = null;
    private static ForegroundSyncService instance = null;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private PowerManager.WakeLock wakeLock;
    private android.net.wifi.WifiManager.WifiLock wifiLock;
    private WebView backgroundWebView;
    private Handler mainHandler;
    private Handler periodicHandler;
    private Runnable periodicRunnable;
    private ExecutorService executorService;
    private boolean isSyncing = false;

    public static ForegroundSyncService getInstance() {
        return instance;
    }

    public static void setActiveWebView(WebView webView) {
        if (webView != null) {
            activeActivityWebView = new WeakReference<>(webView);
            Log.i(TAG, "Active Activity WebView registered.");
        }
    }

    public static void startSyncService(Context context) {
        try {
            Intent serviceIntent = new Intent(context, ForegroundSyncService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Throwable e) {
            Log.e(TAG, "Failed to start ForegroundSyncService: " + e.getMessage());
        }
    }

    public static void triggerSyncNow(final Context context) {
        if (instance != null) {
            instance.triggerImmediateSync("Direct triggerSyncNow");
        } else if (context != null) {
            // Also execute native storage sync directly on background thread
            // so sync starts immediately even before service startup completes
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        performNativeStorageSync(context);
                    } catch (Throwable ignored) {}
                }
            }).start();
            startSyncService(context);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());
        periodicHandler = new Handler(Looper.getMainLooper());
        executorService = Executors.newSingleThreadExecutor();

        createNotificationChannel();
        startInForeground("يراقب الاتصال للمزامنة الفورية عند توفر الإنترنت");
        initBackgroundWebView();
        registerNetworkListener();
        acquirePartialWakeLock();
        acquireWifiLock();
        startPeriodicSyncLoop();
        scheduleRepeatingAlarmHeartbeat(10000);

        Log.i(TAG, "ForegroundSyncService created and initialized successfully.");
    }

    private void scheduleRepeatingAlarmHeartbeat(long delayMs) {
        try {
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(this, ForegroundSyncService.class);
            intent.setAction("ACTION_HEARTBEAT_SYNC");
            PendingIntent pendingIntent = PendingIntent.getService(
                this,
                9982,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            long triggerAt = SystemClock.elapsedRealtime() + delayMs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                alarmManager.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pendingIntent);
            }
        } catch (Throwable e) {
            Log.w(TAG, "scheduleRepeatingAlarmHeartbeat error: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "المزامنة الميدانية التلقائية",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("الحفاظ على اتصال النظام ومزامنة الفواتير والحسابات تلقائياً عند عودة الإنترنت");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.enableLights(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startInForeground(String statusText) {
        try {
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launchIntent == null) {
                launchIntent = new Intent(this, MainActivity.class);
            }
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("نظام الكرار - المزامنة الميدانية نشطة")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .setAutoCancel(false)
                .build();

            if (Build.VERSION.SDK_INT >= 34) { // Android 14+ (UPSIDE_DOWN_CAKE)
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Throwable e) {
            Log.e(TAG, "Error starting foreground notification: " + e.getMessage());
        }
    }

    public void updateNotification(String statusText) {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launchIntent == null) {
                launchIntent = new Intent(this, MainActivity.class);
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("نظام الكرار - المزامنة الميدانية نشطة")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .setAutoCancel(false)
                .build();

            manager.notify(NOTIFICATION_ID, notification);
        } catch (Throwable e) {
            Log.w(TAG, "Failed to update notification: " + e.getMessage());
        }
    }

    private void initBackgroundWebView() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (backgroundWebView == null) {
                        backgroundWebView = new WebView(getApplicationContext());
                        WebSettings settings = backgroundWebView.getSettings();
                        settings.setJavaScriptEnabled(true);
                        settings.setDomStorageEnabled(true);
                        settings.setDatabaseEnabled(true);
                        settings.setAllowFileAccess(true);
                        settings.setAllowContentAccess(true);
                        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

                        backgroundWebView.setWebViewClient(new WebViewClient() {
                            @Override
                            public void onPageFinished(WebView view, String url) {
                                super.onPageFinished(view, url);
                                Log.i(TAG, "Background WebView loaded successfully: " + url);
                                triggerImmediateSync("Background WebView Page Finished");
                            }
                        });

                        // Load Capacitor local app instance
                        backgroundWebView.loadUrl("https://localhost");
                        Log.i(TAG, "Background headless WebView initiated.");
                    }
                } catch (Throwable e) {
                    Log.e(TAG, "Error initiating background WebView: " + e.getMessage());
                }
            }
        });
    }

    private void registerNetworkListener() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;

            NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    super.onAvailable(network);
                    Log.i(TAG, "⚡ Network connected! Executing instant auto-sync...");
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            updateNotification("تم الاتصال بالإنترنت - جاري المزامنة...");
                            triggerImmediateSync("Network OnAvailable");
                        }
                    });
                }

                @Override
                public void onLost(Network network) {
                    super.onLost(network);
                    Log.i(TAG, "Network disconnected. Standing by for reconnection...");
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            updateNotification("يراقب الاتصال للمزامنة الفورية عند توفر الإنترنت");
                        }
                    });
                }
            };

            connectivityManager.registerNetworkCallback(request, networkCallback);
        } catch (Throwable e) {
            Log.w(TAG, "Could not register network callback: " + e.getMessage());
        }
    }

    private void startPeriodicSyncLoop() {
        periodicRunnable = new Runnable() {
            @Override
            public void run() {
                try {
                    acquirePartialWakeLock();
                    acquireWifiLock();
                    if (isInternetAvailable()) {
                        triggerImmediateSync("Periodic Loop (15s)");
                    }
                    scheduleRepeatingAlarmHeartbeat(20000);
                } catch (Throwable ignored) {}
                periodicHandler.postDelayed(this, 15000); // Check every 15 seconds
            }
        };
        periodicHandler.postDelayed(periodicRunnable, 15000);
    }

    private boolean isInternetAvailable() {
        try {
            if (connectivityManager == null) {
                connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            }
            if (connectivityManager != null) {
                Network activeNet = connectivityManager.getActiveNetwork();
                if (activeNet != null) {
                    NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(activeNet);
                    return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                }
            }
        } catch (Throwable ignored) {}
        return false;
    }

    public synchronized void triggerImmediateSync(final String reason) {
        if (isSyncing) {
            Log.d(TAG, "Sync already in progress, skipping duplicate trigger (" + reason + ")");
            return;
        }
        isSyncing = true;
        Log.i(TAG, "🚀 Starting Sync triggered by: " + reason);

        acquirePartialWakeLock();

        // 1. Trigger in UI WebView (if active)
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (activeActivityWebView != null && activeActivityWebView.get() != null) {
                        WebView uiView = activeActivityWebView.get();
                        uiView.evaluateJavascript(
                            "if (typeof window !== 'undefined' && typeof window.alkarrarFlushQueue === 'function') { window.alkarrarFlushQueue(); }",
                            null
                        );
                    }
                } catch (Throwable ignored) {}

                // 2. Trigger in Background Headless WebView
                try {
                    if (backgroundWebView != null) {
                        backgroundWebView.evaluateJavascript(
                            "(function() {" +
                            "  try {" +
                            "    if (typeof window !== 'undefined' && typeof window.alkarrarFlushQueue === 'function') {" +
                            "      return window.alkarrarFlushQueue();" +
                            "    }" +
                            "  } catch (e) { return 'ERR: ' + e.message; }" +
                            "  return 'NOT_FOUND';" +
                            "})();",
                            new ValueCallback<String>() {
                                @Override
                                public void onReceiveValue(String value) {
                                    Log.d(TAG, "Background WebView sync eval result: " + value);
                                }
                            }
                        );
                    }
                } catch (Throwable ignored) {}

                // 3. Send Broadcast to any listeners
                try {
                    Intent syncIntent = new Intent("com.alkarrar.mobile.INTERNET_RESTORED");
                    syncIntent.setPackage(getPackageName());
                    sendBroadcast(syncIntent);
                } catch (Throwable ignored) {}
            }
        });

        // 4. Native Direct HTTP Fallback Sync in Background Thread
        executorService.execute(new Runnable() {
            @Override
            public void run() {
                int syncedCount = 0;
                try {
                    syncedCount = performNativeStorageSync(ForegroundSyncService.this);
                } catch (Throwable e) {
                    Log.w(TAG, "Native storage sync error: " + e.getMessage());
                } finally {
                    final int count = syncedCount;
                    isSyncing = false;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (count > 0) {
                                updateNotification("تمت مزامنة " + count + " عملية بنجاح ✓");
                                mainHandler.postDelayed(new Runnable() {
                                    @Override
                                    public void run() {
                                        updateNotification("يراقب الاتصال للمزامنة الفورية عند توفر الإنترنت");
                                    }
                                }, 4000);
                            } else {
                                updateNotification("يراقب الاتصال للمزامنة الفورية عند توفر الإنترنت");
                            }
                        }
                    });
                }
            }
        });
    }

    private static final String FILE_NAME_QUEUE = "alkarrar_offline_queue.json";
    private static final String PREFS_ALKARRAR = "AlkarrarSync";
    private static final String PREFS_CAPACITOR_STORAGE = "CapacitorStorage";
    private static final String PREFS_CAPACITOR_PREFERENCES = "CapacitorPreferences";
    private static final String KEY_PENDING_QUEUE = "alkarrar_offline_pending_queue";
    private static final String KEY_SERVER_URL = "alkarrar_backend_server_url";

    public static synchronized void persistPendingQueueFromWeb(Context context, String queueJson, String serverUrl) {
        if (context == null || queueJson == null) return;
        try {
            // 1. Write atomically to internal files directory
            File file = new File(context.getFilesDir(), FILE_NAME_QUEUE);
            File tempFile = new File(context.getFilesDir(), FILE_NAME_QUEUE + ".tmp");
            try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                fos.write(queueJson.getBytes("UTF-8"));
                fos.flush();
            }
            if (tempFile.exists()) {
                tempFile.renameTo(file);
            }

            // 2. Mirror across all SharedPreferences and key variations
            String[] prefNames = { PREFS_ALKARRAR, PREFS_CAPACITOR_STORAGE, PREFS_CAPACITOR_PREFERENCES };
            String[] keyNames = {
                KEY_PENDING_QUEUE,
                "CapacitorStorage." + KEY_PENDING_QUEUE,
                "CapacitorPreferences." + KEY_PENDING_QUEUE,
                "_cap_" + KEY_PENDING_QUEUE
            };

            for (String pName : prefNames) {
                try {
                    SharedPreferences prefs = context.getSharedPreferences(pName, Context.MODE_PRIVATE);
                    SharedPreferences.Editor editor = prefs.edit();
                    for (String k : keyNames) {
                        editor.putString(k, queueJson);
                    }
                    if (serverUrl != null && !serverUrl.trim().isEmpty()) {
                        editor.putString(KEY_SERVER_URL, serverUrl.trim());
                        editor.putString("CapacitorStorage." + KEY_SERVER_URL, serverUrl.trim());
                        editor.putString("CapacitorPreferences." + KEY_SERVER_URL, serverUrl.trim());
                    }
                    editor.apply();
                } catch (Throwable ignored) {}
            }

            // 3. Trigger immediate sync if network is available
            triggerSyncNow(context);
        } catch (Throwable e) {
            Log.w(TAG, "persistPendingQueueFromWeb error: " + e.getMessage());
        }
    }

    public static synchronized String readNativePendingQueue(Context context) {
        if (context == null) return "[]";
        try {
            // 1. First check atomic JSON file
            File file = new File(context.getFilesDir(), FILE_NAME_QUEUE);
            if (file.exists() && file.length() > 2) {
                try (FileInputStream fis = new FileInputStream(file);
                     ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[2048];
                    int len;
                    while ((len = fis.read(buf)) != -1) {
                        baos.write(buf, 0, len);
                    }
                    String content = baos.toString("UTF-8").trim();
                    if (content.startsWith("[") && content.endsWith("]")) {
                        return content;
                    }
                } catch (Throwable ignored) {}
            }

            // 2. Check SharedPreferences with multiple prefixes
            String[] prefNames = { PREFS_ALKARRAR, PREFS_CAPACITOR_STORAGE, PREFS_CAPACITOR_PREFERENCES };
            String[] keyNames = {
                KEY_PENDING_QUEUE,
                "CapacitorStorage." + KEY_PENDING_QUEUE,
                "CapacitorPreferences." + KEY_PENDING_QUEUE,
                "_cap_" + KEY_PENDING_QUEUE
            };

            for (String pName : prefNames) {
                try {
                    SharedPreferences prefs = context.getSharedPreferences(pName, Context.MODE_PRIVATE);
                    for (String k : keyNames) {
                        String val = prefs.getString(k, null);
                        if (val != null && val.trim().startsWith("[") && val.trim().endsWith("]")) {
                            return val.trim();
                        }
                    }
                } catch (Throwable ignored) {}
            }
        } catch (Throwable e) {
            Log.w(TAG, "readNativePendingQueue error: " + e.getMessage());
        }
        return "[]";
    }

    public static synchronized void writeNativePendingQueue(Context context, String queueJson) {
        if (context == null || queueJson == null) return;
        persistPendingQueueFromWeb(context, queueJson, null);
    }

    /**
     * Reads pending actions from atomic file or SharedPreferences and uploads them directly via Native HTTP
     */
    public static int performNativeStorageSync(Context context) {
        int uploadedCount = 0;
        if (context == null) {
            context = instance;
        }
        if (context == null) return 0;
        try {
            String queueJson = readNativePendingQueue(context);
            if (queueJson == null || queueJson.trim().isEmpty() || queueJson.equals("[]")) {
                return 0;
            }

            JSONArray queue = new JSONArray(queueJson);
            if (queue.length() == 0) return 0;

            JSONArray pendingItems = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null) {
                    String status = item.optString("status", "pending");
                    String id = item.optString("id", "");
                    if (!"synced".equals(status) && !id.startsWith("__meta_")) {
                        pendingItems.put(item);
                    }
                }
            }

            if (pendingItems.length() == 0) return 0;

            Log.i(TAG, "Native sync found " + pendingItems.length() + " total pending actions. Uploading in chunks...");

            // Read custom server URL if configured
            SharedPreferences prefs = context.getSharedPreferences(PREFS_ALKARRAR, Context.MODE_PRIVATE);
            String customServerUrl = prefs.getString(KEY_SERVER_URL, null);
            if (customServerUrl == null) {
                SharedPreferences capPrefs = context.getSharedPreferences(PREFS_CAPACITOR_STORAGE, Context.MODE_PRIVATE);
                customServerUrl = capPrefs.getString(KEY_SERVER_URL, null);
            }

            java.util.List<String> targetUrls = new java.util.ArrayList<>();
            if (customServerUrl != null && (customServerUrl.startsWith("http://") || customServerUrl.startsWith("https://"))) {
                targetUrls.add(customServerUrl.replaceAll("/+$", "") + "/api/sync/batch");
            }
            for (String u : CANDIDATE_SYNC_URLS) {
                if (!targetUrls.contains(u)) {
                    targetUrls.add(u);
                }
            }

            java.util.Set<String> totalSyncedIds = new java.util.HashSet<>();
            int CHUNK_SIZE = 30;

            for (int b = 0; b < pendingItems.length(); b += CHUNK_SIZE) {
                JSONArray chunk = new JSONArray();
                for (int k = b; k < Math.min(b + CHUNK_SIZE, pendingItems.length()); k++) {
                    chunk.put(pendingItems.get(k));
                }

                java.util.Set<String> chunkVerifiedIds = new java.util.HashSet<>();
                JSONObject batchPayload = new JSONObject();
                batchPayload.put("actions", chunk);
                batchPayload.put("timestamp", System.currentTimeMillis());
                byte[] out = batchPayload.toString().getBytes("UTF-8");

                // Try Batch POST to candidate URLs
                for (String targetUrl : targetUrls) {
                    try {
                        URL url = new URL(targetUrl);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        conn.setRequestProperty("Accept", "application/json");
                        conn.setConnectTimeout(12000);
                        conn.setReadTimeout(20000);
                        conn.setDoOutput(true);

                        OutputStream os = conn.getOutputStream();
                        os.write(out);
                        os.flush();
                        os.close();

                        int code = conn.getResponseCode();
                        String contentType = conn.getContentType();
                        if (code >= 200 && code < 300 && contentType != null && contentType.contains("application/json")) {
                            java.io.InputStream is = conn.getInputStream();
                            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                            byte[] buf = new byte[1024];
                            int l;
                            while ((l = is.read(buf)) != -1) {
                                baos.write(buf, 0, l);
                            }
                            is.close();
                            String respText = baos.toString("UTF-8");
                            JSONObject respJson = new JSONObject(respText);
                            if (respJson.has("processedIds")) {
                                JSONArray arr = respJson.optJSONArray("processedIds");
                                if (arr != null) {
                                    for (int p = 0; p < arr.length(); p++) {
                                        chunkVerifiedIds.add(arr.optString(p));
                                    }
                                }
                            } else if (respJson.optBoolean("success", false)) {
                                for (int p = 0; p < chunk.length(); p++) {
                                    JSONObject itm = chunk.optJSONObject(p);
                                    if (itm != null && itm.has("id")) {
                                        chunkVerifiedIds.add(itm.optString("id"));
                                    }
                                }
                            }

                            if (chunkVerifiedIds.size() > 0) {
                                Log.i(TAG, "Chunk sync verified via " + targetUrl + " (" + code + "), count: " + chunkVerifiedIds.size());
                                conn.disconnect();
                                break;
                            }
                        }
                        conn.disconnect();
                    } catch (Throwable e) {
                        Log.w(TAG, "Chunk Batch POST exception for " + targetUrl + ": " + e.getMessage());
                    }
                }

                // Fallback for unverified items in this chunk
                JSONArray unverifiedInChunk = new JSONArray();
                for (int i = 0; i < chunk.length(); i++) {
                    JSONObject item = chunk.optJSONObject(i);
                    if (item != null) {
                        String aId = item.optString("id", "");
                        if (!chunkVerifiedIds.contains(aId)) {
                            unverifiedInChunk.put(item);
                        }
                    }
                }

                if (unverifiedInChunk.length() > 0) {
                    String primaryBaseUrl = targetUrls.size() > 0 ? targetUrls.get(0).replaceAll("/api/sync/batch.*", "") : "http://72.62.158.128:3000";
                    for (int i = 0; i < unverifiedInChunk.length(); i++) {
                        JSONObject item = unverifiedInChunk.optJSONObject(i);
                        if (item == null) continue;
                        String actionId = item.optString("id", null);
                        String actionType = item.optString("type", "");
                        JSONObject payload = item.optJSONObject("payload");
                        if (payload == null) continue;

                        String docId = payload.optString("id", actionId);
                        String table = null;
                        boolean isDelete = actionType.startsWith("DELETE_");

                        if (actionType.contains("CONTRACT")) {
                            table = "contracts";
                        } else if (actionType.contains("PAYMENT")) {
                            table = "payments";
                        } else if (actionType.contains("INVENTORY")) {
                            table = "inventory";
                        } else if (actionType.contains("REP")) {
                            table = "reps";
                        } else if (actionType.contains("FUND")) {
                            table = "funds";
                        }

                        if (table != null) {
                            try {
                                String ep = primaryBaseUrl + "/api/" + table;
                                if (isDelete && docId != null) {
                                    ep += "/" + docId;
                                }
                                URL sUrl = new URL(ep);
                                HttpURLConnection sConn = (HttpURLConnection) sUrl.openConnection();
                                sConn.setRequestMethod(isDelete ? "DELETE" : "POST");
                                sConn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                                sConn.setRequestProperty("Accept", "application/json");
                                sConn.setConnectTimeout(6000);
                                sConn.setReadTimeout(10000);

                                if (!isDelete) {
                                    sConn.setDoOutput(true);
                                    byte[] rowBytes = payload.toString().getBytes("UTF-8");
                                    OutputStream sOs = sConn.getOutputStream();
                                    sOs.write(rowBytes);
                                    sOs.flush();
                                    sOs.close();
                                }

                                int sCode = sConn.getResponseCode();
                                if (sCode >= 200 && sCode < 300) {
                                    if (actionId != null) {
                                        chunkVerifiedIds.add(actionId);
                                    }
                                }
                                sConn.disconnect();
                            } catch (Throwable sErr) {
                                Log.w(TAG, "Chunk fallback error for " + table + ": " + sErr.getMessage());
                            }
                        }
                    }
                }

                // Persist incremental progress immediately
                if (chunkVerifiedIds.size() > 0) {
                    totalSyncedIds.addAll(chunkVerifiedIds);
                    uploadedCount += chunkVerifiedIds.size();

                    JSONArray updatedQueue = new JSONArray();
                    for (int i = 0; i < queue.length(); i++) {
                        JSONObject item = queue.optJSONObject(i);
                        if (item != null) {
                            String id = item.optString("id", "");
                            if (totalSyncedIds.contains(id)) {
                                item.put("status", "synced");
                                item.put("syncedAt", System.currentTimeMillis());
                            }
                            updatedQueue.put(item);
                        }
                    }
                    writeNativePendingQueue(context, updatedQueue.toString());
                    if (instance != null) {
                        instance.updateNotification("تمت مزامنة " + totalSyncedIds.size() + " من " + pendingItems.length() + " عملية في الخلفية ✓");
                    }
                }
            }
        } catch (Throwable e) {
            Log.e(TAG, "Error in performNativeStorageSync: " + e.getMessage());
        }
        return uploadedCount;
    }

    private void acquirePartialWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                if (wakeLock == null) {
                    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Alkarrar:SyncWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
                if (!wakeLock.isHeld()) {
                    wakeLock.acquire(10 * 60 * 1000L); // 10 minutes hold
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "WakeLock acquisition warning: " + e.getMessage());
        }
    }

    private void acquireWifiLock() {
        try {
            android.net.wifi.WifiManager wifiManager = (android.net.wifi.WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null) {
                if (wifiLock == null) {
                    int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB_MR1
                        ? android.net.wifi.WifiManager.WIFI_MODE_FULL_HIGH_PERF
                        : android.net.wifi.WifiManager.WIFI_MODE_FULL;
                    wifiLock = wifiManager.createWifiLock(mode, "Alkarrar:WifiSyncLock");
                    wifiLock.setReferenceCounted(false);
                }
                if (!wifiLock.isHeld()) {
                    wifiLock.acquire();
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "WifiLock acquisition warning: " + e.getMessage());
        }
    }

    private void releaseWifiLock() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startInForeground("يراقب الاتصال للمزامنة الفورية عند توفر الإنترنت");
        acquirePartialWakeLock();
        acquireWifiLock();
        String triggerSource = (intent != null && intent.getAction() != null) ? intent.getAction() : "onStartCommand";
        triggerImmediateSync(triggerSource);
        scheduleRepeatingAlarmHeartbeat(20000);
        return START_STICKY; // Restart service automatically if memory pressured
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "Application task removed / closed by user. Triggering immediate background sync & persistence...");
        try {
            acquirePartialWakeLock();
            acquireWifiLock();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        performNativeStorageSync(getApplicationContext());
                    } catch (Throwable e) {
                        Log.w(TAG, "onTaskRemoved sync error: " + e.getMessage());
                    }
                }
            }).start();
        } catch (Throwable ignored) {}

        // Schedule immediate WorkManager sync to guarantee background completion
        try {
            SyncWorker.enqueueImmediateWork(getApplicationContext());
            SyncWorker.enqueueWork(getApplicationContext());
        } catch (Throwable ignored) {}

        // Keep service active / restart with AlarmManager
        try {
            Intent restartIntent = new Intent(getApplicationContext(), ForegroundSyncService.class);
            restartIntent.setPackage(getPackageName());
            PendingIntent pendingIntent = PendingIntent.getService(
                getApplicationContext(),
                1001,
                restartIntent,
                PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                alarmManager.set(
                    AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + 1500,
                    pendingIntent
                );
            }
        } catch (Throwable ignored) {}

        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            if (periodicHandler != null && periodicRunnable != null) {
                periodicHandler.removeCallbacks(periodicRunnable);
            }
            if (connectivityManager != null && networkCallback != null) {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            }
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            releaseWifiLock();
        } catch (Throwable ignored) {}

        // Enqueue WorkManager so sync never stops
        try {
            SyncWorker.enqueueImmediateWork(getApplicationContext());
            SyncWorker.enqueueWork(getApplicationContext());
        } catch (Throwable ignored) {}

        // Auto restart foreground service if killed
        try {
            Intent restartIntent = new Intent(getApplicationContext(), ForegroundSyncService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restartIntent);
            } else {
                getApplicationContext().startService(restartIntent);
            }
        } catch (Throwable ignored) {}
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
