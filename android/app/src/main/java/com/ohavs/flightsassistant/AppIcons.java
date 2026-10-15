package com.ohavs.flightsassistant;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.util.Log;

/**
 * The launcher icon: one <activity-alias> per design (AndroidManifest.xml),
 * exactly one of them enabled. Classic is ".MainActivity", on by default.
 *
 * Settings asks for an icon (kept as "pending") and the switch happens once
 * the user leaves the app (AppActivity.onStop), or at once from settings
 * (AppToolsPlugin.applyIconNow). Not under the user's eyes: Android closes
 * the screen that was opened through the alias that goes off.
 */
final class AppIcons {
    static final String[][] ICONS = {
        { "classic", ".MainActivity" },
        { "sunset", ".IconSunset" },
        { "night", ".IconNight" },
        { "map", ".IconMap" },
        { "sea", ".IconSea" },
    };
    private static final String PREFS = "app_icon";

    /** Set by "switch now": the next stop applies the icon and tells the launcher at once. */
    static volatile boolean switchNow;

    private AppIcons() {}

    static boolean known(String icon) {
        for (String[] i : ICONS) if (i[0].equals(icon)) return true;
        return false;
    }

    private static ComponentName component(Context c, String icon) {
        for (String[] i : ICONS) {
            if (i[0].equals(icon)) return new ComponentName(c.getPackageName(), AppIcons.class.getPackage().getName() + i[1]);
        }
        throw new IllegalArgumentException(icon);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The icon the launcher shows now. */
    static String current(Context c) {
        PackageManager pm = c.getPackageManager();
        for (String[] i : ICONS) {
            int state = pm.getComponentEnabledSetting(component(c, i[0]));
            boolean on = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && "classic".equals(i[0]));
            if (on) return i[0];
        }
        return "classic";
    }

    /** The icon asked for and not applied yet, or null. */
    static String pending(Context c) {
        String p = prefs(c).getString("pending", null);
        return known(p) ? p : null;
    }

    static void request(Context c, String icon) {
        if (icon.equals(current(c))) prefs(c).edit().remove("pending").apply();
        else prefs(c).edit().putString("pending", icon).apply();
    }

    /**
     * Switches to the pending icon, if any. The new alias goes on first, so
     * there is always one; the old one goes off last. With `now`, that last
     * change is made without DONT_KILL_APP: Android then tells the launcher
     * at once instead of up to 10 seconds later, and closes the app, which
     * is already in the background.
     */
    static void applyPending(Context c, boolean now) {
        String want = pending(c);
        if (want == null) return;
        prefs(c).edit().remove("pending").commit();
        String was = current(c);
        if (want.equals(was)) return;
        PackageManager pm = c.getPackageManager();
        int keep = PackageManager.DONT_KILL_APP;
        try {
            pm.setComponentEnabledSetting(component(c, want), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, keep);
            for (String[] i : ICONS) {
                if (i[0].equals(want) || i[0].equals(was)) continue;
                pm.setComponentEnabledSetting(component(c, i[0]), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, keep);
            }
            Log.i("AppIcons", "icon " + was + " -> " + want + (now ? " (now)" : ""));
            pm.setComponentEnabledSetting(component(c, was), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, now ? 0 : keep);
        } catch (RuntimeException e) {
            // A phone that refuses: the icon stays as it was.
            Log.w("AppIcons", "icon switch failed", e);
        }
    }
}
