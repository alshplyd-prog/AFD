package com.alkarrar.mobile;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

public class SyncWorker extends Worker {
    private static final String TAG = "SyncWorker";
    public static final String WORK_NAME = "AlkarrarOfflineSyncWorker";
    public static final String IMMEDIATE_WORK_NAME = "AlkarrarImmediateCloseSyncWorker";

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Log.i(TAG, "SyncWorker executing background work...");
            int synced = ForegroundSyncService.performNativeStorageSync(getApplicationContext());
            Log.i(TAG, "SyncWorker background sync completed. Synced count: " + synced);
            if (ForegroundSyncService.getInstance() != null) {
                ForegroundSyncService.getInstance().triggerImmediateSync("WorkManager doWork");
            }
            return Result.success();
        } catch (Throwable e) {
            Log.w(TAG, "SyncWorker doWork failed: " + e.getMessage());
            return Result.retry();
        }
    }

    public static void enqueueImmediateWork(Context context) {
        if (context == null) return;
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SyncWorker.class)
                .setConstraints(constraints)
                .build();

            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            );
            Log.i(TAG, "Immediate WorkManager sync enqueued on app close/pause.");
        } catch (Throwable e) {
            Log.w(TAG, "Failed to enqueue immediate work: " + e.getMessage());
        }
    }

    public static void enqueueWork(Context context) {
        if (context == null) return;
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                SyncWorker.class,
                15,
                TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            );
        } catch (Throwable ignored) {}
    }
}
