package com.ohavs.flightsassistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The app's one activity, and its launcher entry (AndroidManifest.xml).
 * ".MainActivity", its old name, is an alias kept for intents made before.
 */
public class AppActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(AppToolsPlugin.class);
        registerPlugin(com.ohavs.flightsassistant.widget.TripWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
