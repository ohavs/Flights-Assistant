package com.ohavs.flightsassistant;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * In-app updates from GitHub Releases: download the release APK, verify its
 * SHA-256, then hand it to Android's package installer. Android always asks
 * the user to confirm, and the first time it also asks to allow installs from
 * this app ("unknown sources").
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String expectedSha = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://github.com/ohavs/Flights-Assistant/releases/download/")) {
            call.reject("Refusing to download from an unexpected URL");
            return;
        }
        getBridge().execute(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            File apk = new File(dir, "update.apk");
            try {
                dir.mkdirs();
                if (apk.exists()) apk.delete();
                download(url, apk);
                if (!expectedSha.isEmpty() && !expectedSha.equalsIgnoreCase(sha256(apk))) {
                    apk.delete();
                    call.reject("Checksum mismatch");
                    return;
                }
                Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Update failed: " + e.getMessage(), e);
            }
        });
    }

    private void download(String url, File out) throws Exception {
        HttpURLConnection conn = null;
        // GitHub redirects release downloads to its CDN; follow up to 5 hops.
        for (int hop = 0; hop < 5; hop++) {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                url = conn.getHeaderField("Location");
                conn.disconnect();
                continue;
            }
            if (code != 200) throw new Exception("HTTP " + code);
            break;
        }
        long total = conn.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        byte[] buf = new byte[64 * 1024];
        try (InputStream in = conn.getInputStream(); FileOutputStream fos = new FileOutputStream(out)) {
            int n;
            while ((n = in.read(buf)) != -1) {
                fos.write(buf, 0, n);
                done += n;
                int percent = total > 0 ? (int) (done * 100 / total) : -1;
                if (percent != lastPercent) {
                    lastPercent = percent;
                    JSObject ev = new JSObject();
                    ev.put("percent", percent);
                    notifyListeners("progress", ev);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[64 * 1024];
        try (InputStream in = new java.io.FileInputStream(f)) {
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
