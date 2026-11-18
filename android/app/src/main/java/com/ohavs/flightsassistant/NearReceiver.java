package com.ohavs.flightsassistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import java.util.List;

/**
 * Wakes on the way into a place's circle (NearPlaces), and after a reboot
 * or an update of the app, when Android has forgotten the geofences and
 * they are registered again from what was saved.
 */
public class NearReceiver extends BroadcastReceiver {
    static final String ACTION = "com.ohavs.flightsassistant.NEAR_PLACE";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            final PendingResult pr = goAsync();
            NearPlaces.register(ctx, (n, err) -> pr.finish());
            return;
        }
        if (!ACTION.equals(action)) return;
        GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
        if (ev == null || ev.hasError() || ev.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;
        List<Geofence> hit = ev.getTriggeringGeofences();
        if (hit == null) return;
        for (Geofence g : hit) NearPlaces.entered(ctx, g.getRequestId());
    }
}
