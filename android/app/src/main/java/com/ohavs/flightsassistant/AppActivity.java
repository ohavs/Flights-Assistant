package com.ohavs.flightsassistant;

import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The app's one activity. The launcher reaches it through an
 * <activity-alias> per icon design (AndroidManifest.xml); ".MainActivity",
 * its old name, is the classic icon's alias, so a home screen shortcut made
 * before the icons existed keeps working.
 */
public class AppActivity extends BridgeActivity {
    // This screen opened another one (Google sign-in, the share sheet, the
    // installer, a settings page) and the user is coming back to it.
    private boolean openedOther;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        registerPlugin(AppToolsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        openedOther = false;
    }

    // Every startActivity goes through here too.
    @Override
    @SuppressWarnings("deprecation")
    public void startActivityForResult(Intent intent, int requestCode, Bundle options) {
        openedOther = true;
        super.startActivityForResult(intent, requestCode, options);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void startIntentSenderForResult(IntentSender intent, int requestCode, Intent fillInIntent,
            int flagsMask, int flagsValues, int extraFlags, Bundle options) throws IntentSender.SendIntentException {
        openedOther = true;
        super.startIntentSenderForResult(intent, requestCode, fillInIntent, flagsMask, flagsValues, extraFlags, options);
    }

    // A new launcher icon is applied once the app is out of sight (home,
    // recents, a swipe away, back), since the switch closes this screen.
    // Not while the user is in a screen the app opened: they come back here.
    @Override
    public void onStop() {
        super.onStop();
        boolean now = AppIcons.switchNow;
        AppIcons.switchNow = false;
        if (AppIcons.pending(this) != null) {
            android.util.Log.i("AppIcons", "stop: now=" + now + " finishing=" + isFinishing() + " openedOther=" + openedOther);
        }
        if (now || isFinishing() || (!openedOther && !isChangingConfigurations())) {
            AppIcons.applyPending(this, now);
        }
    }
}
