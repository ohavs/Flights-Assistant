package com.ohavs.flightsassistant;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

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
 * comes as base64.
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
}
