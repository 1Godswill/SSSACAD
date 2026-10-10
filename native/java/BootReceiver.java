package com.ststephens.sssacad;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts the background listener after the phone reboots or the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String url = AlertService.prefs(context).getString("url", "");
            if (url != null && !url.isEmpty()) AlertService.start(context);
        } catch (Exception ignored) { }
    }
}
