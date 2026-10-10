package com.ststephens.sssacad;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Iterator;

import org.json.JSONObject;

/** Bridge between the web app (reminder.js / native-bridge.js) and Android. */
@CapacitorPlugin(name = "Alerts")
public class AlertsPlugin extends Plugin {

    @Override
    protected void handleOnResume() { AlertService.appForeground = true; }

    @Override
    protected void handleOnPause() { AlertService.appForeground = false; }

    /** Tells the background listener where to look (Sync URL), which class is open and who this device is. */
    @PluginMethod
    public void configure(PluginCall call) {
        Context ctx = getContext();
        String url = call.getString("url", "");
        String classId = call.getString("classId", "");
        String deviceId = call.getString("deviceId", "");
        AlertService.prefs(ctx).edit()
                .putString("url", url == null ? "" : url.trim())
                .putString("classId", classId == null ? "" : classId)
                .putString("device", deviceId == null ? "" : deviceId)
                .apply();
        if (url != null && !url.trim().isEmpty()) AlertService.start(ctx);
        else AlertService.stop(ctx);
        call.resolve();
    }

    /** The web app has just shown (or the admin has just typed) these announcements, so don't ring for them again. */
    @PluginMethod
    public void setSeen(PluginCall call) {
        android.content.SharedPreferences.Editor e = AlertService.prefs(getContext()).edit();
        String gate = call.getString("gate", "");
        e.putString("ann_gate", gate == null ? "" : gate);
        JSObject cls = call.getObject("cls");
        if (cls != null) {
            Iterator<String> it = cls.keys();
            while (it.hasNext()) {
                String id = it.next();
                e.putString("ann_cls_" + id, cls.optString(id, ""));
            }
        }
        e.putBoolean("ann_init", true);
        e.apply();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject o = new JSObject();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean ignoring = Build.VERSION.SDK_INT < 23 || (pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        o.put("batteryUnrestricted", ignoring);
        o.put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        o.put("listening", AlertService.running);
        call.resolve(o);
    }

    /** Asks Android not to put the app to sleep, so alerts arrive while it is closed. */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        try {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            }
        } catch (Exception ignored) { }
        call.resolve();
    }

    /** Opens the phone's own notification settings for this app. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception ignored) { }
        call.resolve();
    }

    /** Saves a file (backup, Excel...) into the phone's Downloads folder. */
    @PluginMethod
    public void saveFile(final PluginCall call) {
        final String name = safeName(call.getString("name", "file"));
        final String mime = call.getString("mime", "application/octet-stream");
        final String b64 = call.getString("data", "");
        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                Context ctx = getContext();
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, mime);
                    v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("Could not create the file");
                    try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) { os.write(bytes); }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                    try (OutputStream os = new FileOutputStream(new File(dir, name))) { os.write(bytes); }
                }
                JSObject o = new JSObject();
                o.put("name", name);
                call.resolve(o);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Save failed" : e.getMessage());
            }
        }).start();
    }

    private static String safeName(String n) {
        String s = n == null ? "file" : n.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return s.isEmpty() ? "file" : s;
    }

    /** window.print() does nothing inside an Android WebView, so open Android's print dialog (also "Save as PDF"). */
    @PluginMethod
    public void print(final PluginCall call) {
        final String jobName = call.getString("name", "St Stephens School");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = getBridge().getWebView().createPrintDocumentAdapter(jobName);
                pm.print(jobName, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Print failed" : e.getMessage());
            }
        });
    }
}
