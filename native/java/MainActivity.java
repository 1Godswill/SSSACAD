package com.ststephens.sssacad;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlertsPlugin.class);
        super.onCreate(savedInstanceState);
        try { getBridge().getWebView().getSettings().setTextZoom(100); } catch (Exception ignored) { }
    }
}
