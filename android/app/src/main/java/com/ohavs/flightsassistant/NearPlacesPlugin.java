package com.ohavs.flightsassistant;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The app's side of the alerts near places (NearPlaces; src/lib/native/nearPlaces.js):
 *   status() → { location: 'granted'|'approximate'|'denied'|'prompt',
 *                background: 'granted'|'denied'|'prompt' }
 *   askLocation(), askBackground() → the same, after Android asked.
 *     Android asks for "all the time" apart, after the location itself;
 *     from Android 11 that request opens the app's location settings.
 *   openSettings(): the app's page in the phone's settings.
 *   setFences({ fences }) → status + { registered, error? }
 */
@CapacitorPlugin(name = "NearPlaces", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
})
public class NearPlacesPlugin extends Plugin {

    private static String word(PermissionState s) {
        if (s == PermissionState.GRANTED) return "granted";
        if (s == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private JSObject state() {
        JSObject r = new JSObject();
        boolean fine = NearPlaces.granted(getContext(), Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = NearPlaces.granted(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION);
        String location = fine ? "granted" : coarse ? "approximate" : word(getPermissionState("location"));
        r.put("location", location);
        r.put("background", Build.VERSION.SDK_INT < 29 ? (fine ? "granted" : "prompt")
            : NearPlaces.granted(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) ? "granted"
            : word(getPermissionState("background")));
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void askLocation(PluginCall call) {
        if (NearPlaces.granted(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)) { call.resolve(state()); return; }
        requestPermissionForAlias("location", call, "asked");
    }

    @PluginMethod
    public void askBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29
            || NearPlaces.granted(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            || !NearPlaces.granted(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)) {
            call.resolve(state());
            return;
        }
        requestPermissionForAlias("background", call, "asked");
    }

    @PermissionCallback
    private void asked(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void setFences(PluginCall call) {
        JSArray fences = call.getArray("fences", new JSArray());
        NearPlaces.save(getContext(), fences);
        NearPlaces.register(getContext(), (n, err) -> {
            JSObject r = state();
            r.put("registered", n);
            if (err != null) r.put("error", err);
            call.resolve(r);
        });
    }
}
