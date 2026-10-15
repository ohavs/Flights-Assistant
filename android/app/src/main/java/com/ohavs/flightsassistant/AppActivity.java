package com.ohavs.flightsassistant;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The app's one activity. The launcher reaches it through an
 * <activity-alias> per icon design (AndroidManifest.xml); ".MainActivity",
 * its old name, is the classic icon's alias, so a home screen shortcut made
 * before the icons existed keeps working.
 */
public class AppActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(AppToolsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
