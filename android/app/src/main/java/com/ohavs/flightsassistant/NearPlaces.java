package com.ohavs.flightsassistant;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Alerts near places (8.100.0, the owner's ask). The app hands over the
 * places to watch (src/lib/nearPlaces.js, nearFences): each a geofence,
 * a circle of the radius the user chose around the place's saved spot.
 * Android watches them itself, with the app closed, and wakes NearReceiver
 * on the way in; the notification is made here, on the phone. Nothing is
 * sent to the internet: the spots are saved, and the position is the
 * phone's own (GPS, and Wi-Fi or cell when there is any).
 *
 * Kept in SharedPreferences, so a reboot (when Android forgets every
 * geofence) can register them again without the app.
 *
 * A fence: { id, tripId, placeId, lat, lng, radius, until, title, body,
 * hours: [7 lines, 0 = Sunday] | null }.
 */
final class NearPlaces {
    private NearPlaces() {}

    static final String PREFS = "near_places";
    static final String KEY_FENCES = "fences";
    static final String CHANNEL = "near_places";
    /** Not again for the same place within this long (walking along its edge). */
    static final long QUIET_MS = 6 * 3600_000L;
    /** Android's limit for one app. */
    static final int MAX = 100;
    /** The app's day ends at 05:00 (as in the schedule): a bar at 1am is "today". */
    static final long DAY_STARTS_MS = 5 * 3600_000L;

    interface Done { void done(int registered, String error); }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray read(Context ctx) {
        try { return new JSONArray(prefs(ctx).getString(KEY_FENCES, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static void save(Context ctx, JSONArray fences) {
        SharedPreferences.Editor ed = prefs(ctx).edit().putString(KEY_FENCES, fences.toString());
        // Forget when places no longer watched last notified.
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (int i = 0; i < fences.length(); i++) {
            JSONObject f = fences.optJSONObject(i);
            if (f != null) ids.add("fired:" + f.optString("id"));
        }
        for (String k : prefs(ctx).getAll().keySet()) {
            if (k.startsWith("fired:") && !ids.contains(k)) ed.remove(k);
        }
        ed.apply();
    }

    static JSONObject find(Context ctx, String id) {
        JSONArray a = read(ctx);
        for (int i = 0; i < a.length(); i++) {
            JSONObject f = a.optJSONObject(i);
            if (f != null && id.equals(f.optString("id"))) return f;
        }
        return null;
    }

    static boolean granted(Context ctx, String perm) {
        return ContextCompat.checkSelfPermission(ctx, perm) == PackageManager.PERMISSION_GRANTED;
    }

    /** Precise location, and (Android 10+) all the time: what geofences need. */
    static boolean canWatch(Context ctx) {
        return granted(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
            && (Build.VERSION.SDK_INT < 29 || granted(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION));
    }

    static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, NearReceiver.class).setAction(NearReceiver.ACTION);
        // Mutable: Play services adds the event to it.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 0, i, flags);
    }

    /** Replaces what Android watches with the saved fences. Never throws. */
    @SuppressLint("MissingPermission")
    static void register(Context ctx, Done done) {
        final Context app = ctx.getApplicationContext();
        final Done cb = done != null ? done : (n, e) -> {};
        try {
            final List<Geofence> list = new ArrayList<>();
            JSONArray fences = read(app);
            long now = System.currentTimeMillis();
            for (int i = 0; i < fences.length() && list.size() < MAX; i++) {
                JSONObject f = fences.optJSONObject(i);
                if (f == null || f.optString("id").isEmpty()) continue;
                long until = f.optLong("until", 0);
                if (until > 0 && until <= now) continue;
                double lat = f.optDouble("lat", Double.NaN), lng = f.optDouble("lng", Double.NaN);
                float radius = (float) f.optDouble("radius", 300);
                if (Double.isNaN(lat) || Double.isNaN(lng) || radius <= 0) continue;
                list.add(new Geofence.Builder()
                    .setRequestId(f.optString("id"))
                    .setCircularRegion(lat, lng, radius)
                    .setExpirationDuration(until > 0 ? until - now : Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build());
            }
            final GeofencingClient client = LocationServices.getGeofencingClient(app);
            final PendingIntent pi = pending(app);
            client.removeGeofences(pi).addOnCompleteListener(r -> {
                if (list.isEmpty()) { cb.done(0, null); return; }
                if (!canWatch(app)) { cb.done(0, "permission"); return; }
                // No alert for being inside already: only on the way in.
                GeofencingRequest req = new GeofencingRequest.Builder()
                    .setInitialTrigger(0)
                    .addGeofences(list)
                    .build();
                try {
                    client.addGeofences(req, pi)
                        .addOnSuccessListener(v -> cb.done(list.size(), null))
                        .addOnFailureListener(e -> cb.done(0, e instanceof ApiException
                            ? "code " + ((ApiException) e).getStatusCode() : String.valueOf(e.getMessage())));
                } catch (SecurityException e) {
                    cb.done(0, "permission");
                }
            });
        } catch (Exception e) {
            // No Play services, or anything else: nothing is watched.
            cb.done(0, String.valueOf(e.getMessage()));
        }
    }

    /** On the way into a place's circle: its notification, unless it came lately. */
    static void entered(Context ctx, String id) {
        JSONObject f = find(ctx, id);
        if (f == null) return;
        long now = System.currentTimeMillis();
        SharedPreferences p = prefs(ctx);
        if (now - p.getLong("fired:" + id, 0) < QUIET_MS) return;
        if (show(ctx, f)) p.edit().putLong("fired:" + id, now).apply();
    }

    static String todayHours(JSONObject f) {
        JSONArray h = f.optJSONArray("hours");
        if (h == null || h.length() != 7) return "";
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(System.currentTimeMillis() - DAY_STARTS_MS);
        return h.optString(c.get(Calendar.DAY_OF_WEEK) - 1, "");
    }

    @SuppressLint("MissingPermission")   // notifications off: areNotificationsEnabled, and the catch
    static boolean show(Context ctx, JSONObject f) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "קרבה למקומות", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("כשמתקרבים למקום שהדלקתם לו התראה בקרבת מקום");
            nm.createNotificationChannel(ch);
        }
        NotificationManagerCompat nmc = NotificationManagerCompat.from(ctx);
        if (!nmc.areNotificationsEnabled()) return false;

        String id = f.optString("id");
        // A tap opens the place (the same way in as the widget: TripWidgetPlugin).
        Intent open = new Intent(ctx, AppActivity.class)
            .setAction("com.ohavs.flightsassistant.OPEN_TRIP")
            .setData(Uri.parse("nearplace://open/" + Uri.encode(id)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra("tripId", f.optString("tripId"))
            .putExtra("tab", "planning")
            .putExtra("placeId", f.optString("placeId"));
        PendingIntent tap = PendingIntent.getActivity(ctx, id.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String body = f.optString("body");
        String hours = todayHours(f);
        if (!hours.isEmpty()) body = body.isEmpty() ? hours : body + " · " + hours;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(0xFF22A45D)
            .setContentTitle(f.optString("title"))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(tap);
        try {
            nmc.notify("near", id.hashCode(), b.build());
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }
}
