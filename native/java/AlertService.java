package com.ststephens.sssacad;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Keeps listening to the school's sync server (the same Sync URL the app uses) every ~15 seconds,
 * even when the app is closed, and rings the phone for:
 *   - a new or changed SCHOOL announcement,
 *   - a new or changed announcement for the class this phone has open,
 *   - the Admin "Ring All Devices" buzz (3 seconds of bell + vibration).
 * While the app is on screen the web page does the ringing itself, so this service stays quiet.
 */
public class AlertService extends Service {
    static volatile boolean appForeground = false;
    static volatile boolean running = false;

    static final String CH_SERVICE = "listener";
    static final String CH_ANN = "announcements";
    static final String CH_BUZZ = "buzz";
    private static final long POLL_MS = 15000;
    private static final long BUZZ_FRESH_MS = 10 * 60 * 1000;
    private static final long BUZZ_MS = 3000;

    private HandlerThread thread;
    private Handler handler;
    private String etag = null;
    private String etagUrl = null;
    private final Runnable loop = new Runnable() {
        @Override public void run() {
            try { poll(); } catch (Throwable ignored) { }
            if (running && handler != null) handler.postDelayed(this, POLL_MS);
        }
    };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("alerts", Context.MODE_PRIVATE); }

    static void start(Context c) {
        try {
            ContextCompat.startForegroundService(c, new Intent(c, AlertService.class));
        } catch (Throwable ignored) { /* Android refused a start from the background; it starts next time the app opens */ }
    }

    static void stop(Context c) { c.stopService(new Intent(c, AlertService.class)); }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannels();
        Notification n = new NotificationCompat.Builder(this, CH_SERVICE)
                .setSmallIcon(R.drawable.ic_stat_bell)
                .setContentTitle("St. Stephen's alerts are on")
                .setContentText("Listening for announcements and reminders")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .setContentIntent(openAppIntent())
                .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(7001, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(7001, n);
        } catch (Throwable t) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            thread = new HandlerThread("alert-poll");
            thread.start();
            handler = new Handler(thread.getLooper());
            handler.post(loop);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }

    /* ---------- polling ---------- */

    private void poll() throws Exception {
        SharedPreferences p = prefs(this);
        String url = p.getString("url", "");
        if (url == null || url.isEmpty()) { stopSelf(); return; }
        if (!url.equals(etagUrl)) { etag = null; etagUrl = url; }

        HttpURLConnection c = (HttpURLConnection) new URL(url.replaceAll("/+$", "") + "/").openConnection();
        try {
            c.setConnectTimeout(10000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Cache-Control", "no-cache");
            if (etag != null) c.setRequestProperty("If-None-Match", etag);
            int code = c.getResponseCode();
            if (code == 304 || code != 200) return;
            String newEtag = c.getHeaderField("ETag");
            String body;
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16384];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                body = out.toString("UTF-8");
            }
            JSONObject sections = new JSONObject(body).optJSONObject("sections");
            if (sections == null) return;
            handle(p, sections);
            etag = newEtag; // only remember it once the body was handled successfully
        } finally {
            c.disconnect();
        }
    }

    private static JSONObject dataObj(JSONObject sections, String key) {
        JSONObject s = sections.optJSONObject(key);
        return s == null ? null : s.optJSONObject("data");
    }

    private void handle(SharedPreferences p, JSONObject sections) {
        String deviceId = p.getString("device", "");

        /* --- Admin buzz --- */
        JSONObject bd = dataObj(sections, "buzz");
        JSONArray sig = bd == null ? null : bd.optJSONArray("sig");
        if (sig != null && sig.length() > 0 && !sig.isNull(0)) {
            String id = sig.optString(0);
            long at = sig.optLong(1);
            String by = sig.optString(2);
            String text = sig.optString(3);
            String seen = p.getString("buzz_seen", null);
            if (!id.isEmpty() && !id.equals(seen)) {
                p.edit().putString("buzz_seen", id).apply();
                boolean fresh = Math.abs(System.currentTimeMillis() - at) <= BUZZ_FRESH_MS;
                if (seen != null && fresh && !by.equals(deviceId) && !appForeground) ringBuzz(text);
            }
        }

        /* --- Announcements --- */
        boolean init = p.getBoolean("ann_init", false);
        SharedPreferences.Editor e = p.edit();
        String title = null, body = null;

        JSONObject gateSec = sections.optJSONObject("gateAnnouncement");
        String gate = "";
        if (gateSec != null && !gateSec.isNull("data")) gate = gateSec.optString("data", "").trim();
        if (init && !gate.isEmpty() && !gate.equals(p.getString("ann_gate", ""))) {
            title = "School Announcement";
            body = gate;
        }
        e.putString("ann_gate", gate);

        String classId = p.getString("classId", "");
        if (classId != null && !classId.isEmpty()) {
            JSONObject all = dataObj(sections, "announcements");
            JSONObject mine = all == null ? null : all.optJSONObject(classId);
            String text = mine == null ? "" : mine.optString("text", "").trim();
            String key = "ann_cls_" + classId;
            if (init && !text.isEmpty() && !text.equals(p.getString(key, ""))) {
                title = "Class Announcement";
                body = text;
            }
            e.putString(key, text);
        }
        e.putBoolean("ann_init", true);
        e.apply();

        if (title != null && !appForeground) notifyAnnouncement(title, body);
    }

    /* ---------- ringing ---------- */

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        Uri bell = Uri.parse("android.resource://" + getPackageName() + "/raw/bell");

        NotificationChannel svc = new NotificationChannel(CH_SERVICE, "Background listener", NotificationManager.IMPORTANCE_MIN);
        svc.setShowBadge(false);
        nm.createNotificationChannel(svc);

        NotificationChannel ann = new NotificationChannel(CH_ANN, "Announcements", NotificationManager.IMPORTANCE_HIGH);
        ann.setDescription("School and class announcements");
        ann.setSound(bell, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ann.enableVibration(true);
        ann.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        ann.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ann);

        // The buzz plays its own 3-second sound and vibration, so the channel itself is silent.
        NotificationChannel buzz = new NotificationChannel(CH_BUZZ, "Admin reminders", NotificationManager.IMPORTANCE_HIGH);
        buzz.setDescription("Ring-all-devices reminder from the Admin");
        buzz.setSound(null, null);
        buzz.enableVibration(false);
        buzz.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(buzz);
    }

    private PendingIntent openAppIntent() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void postNotification(String channel, int id, String title, String text) {
        try {
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, channel)
                    .setSmallIcon(R.drawable.ic_stat_bell)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setContentIntent(openAppIntent());
            if (Build.VERSION.SDK_INT < 26 && CH_ANN.equals(channel)) {
                b.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/bell"));
                b.setVibrate(new long[]{0, 500, 200, 500, 200, 500});
            }
            getSystemService(NotificationManager.class).notify(id, b.build());
        } catch (Throwable ignored) { /* notification permission not granted */ }
    }

    private void wakeScreen() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "sssacad:alert");
            wl.acquire(6000);
        } catch (Throwable ignored) { }
    }

    private void notifyAnnouncement(String title, String text) {
        wakeScreen();
        postNotification(CH_ANN, (int) (System.currentTimeMillis() % 100000) + 100, title, text);
    }

    private void ringBuzz(String text) {
        wakeScreen();
        postNotification(CH_BUZZ, 7002, "Reminder from Admin", (text == null || text.isEmpty()) ? "Please check the app." : text);
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(BUZZ_MS, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(BUZZ_MS);
            }
        } catch (Throwable ignored) { }
        try {
            AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            final MediaPlayer mp = MediaPlayer.create(this, R.raw.bell, aa, AudioManager.AUDIO_SESSION_ID_GENERATE);
            if (mp != null) {
                mp.setVolume(1f, 1f);
                mp.start();
                handler.postDelayed(() -> {
                    try { mp.stop(); } catch (Throwable ignored) { }
                    try { mp.release(); } catch (Throwable ignored) { }
                }, BUZZ_MS);
            }
        } catch (Throwable ignored) { }
    }
}
