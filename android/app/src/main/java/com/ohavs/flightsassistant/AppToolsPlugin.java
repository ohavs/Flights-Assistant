package com.ohavs.flightsassistant;

import android.app.AlarmManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Small native helpers the WebView cannot do on its own. shareFile: a
 * WebView cannot download a blob, so a file the app makes (a PDF, a trip
 * backup) is written to the cache and handed to Android's share sheet,
 * where the user saves it to Files or Drive or sends it on. The content
 * comes as base64. permissions / openSettings: what the app may do, and
 * Android's own page for each permission, for the list in settings.
 */
@CapacitorPlugin(name = "AppTools")
public class AppToolsPlugin extends Plugin {

    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("fileName");
        String base64 = call.getString("base64");
        String mime = call.getString("mimeType", "application/octet-stream");
        String title = call.getString("title", "");
        if (name == null || name.isEmpty() || name.contains("/") || name.contains("\\") || base64 == null) {
            call.reject("Bad file");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            dir.mkdirs();
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, name);
            // The read grant has to travel through the chooser to the app picked.
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, title));
            call.resolve();
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage(), e);
        }
    }

    /** What the app is allowed to do now, for the permissions list in settings. */
    @PluginMethod
    public void permissions(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            exact = am != null && am.canScheduleExactAlarms();
        }
        ret.put("exactAlarms", exact);
        ret.put("installs", Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || ctx.getPackageManager().canRequestPackageInstalls());
        call.resolve(ret);
    }

    /** Opens Android's own page for one permission of this app. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        String pkg = ctx.getPackageName();
        String target = call.getString("target", "app");
        Intent intent;
        if ("notifications".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else if ("exactAlarms".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
        } else if ("installs".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + pkg));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
        }
        try {
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // A phone without that page: the app's own settings page has them all.
            getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
        }
        call.resolve();
    }
}
