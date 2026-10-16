package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Which trip each widget shows. A widget added from the app's settings
 * inside a trip is that trip's (TripWidgetPlugin.pin, WidgetPinReceiver);
 * one added from the home screen asks (WidgetTripActivity). A widget with
 * no trip of its own, or whose trip is over, shows the next trip.
 */
final class WidgetTrips {
    private WidgetTrips() {}

    private static final String PREFS = "widget_trips";
    private static final long PIN_WINDOW = 2 * 60_000L;

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The trip widget id shows, or null for the next trip. */
    static String get(Context ctx, int id) {
        return prefs(ctx).getString("w" + id, null);
    }

    static void set(Context ctx, int id, String tripId) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (tripId == null || tripId.isEmpty()) e.remove("w" + id); else e.putString("w" + id, tripId);
        e.apply();
    }

    static void forget(Context ctx, int[] ids) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (int id : ids) e.remove("w" + id);
        e.apply();
    }

    /** The app asked the launcher for a widget of this trip ("" for the next trip). */
    static void pinning(Context ctx, String tripId) {
        prefs(ctx).edit().putString("pinTrip", tripId == null ? "" : tripId)
            .putLong("pinAt", System.currentTimeMillis()).apply();
    }

    /**
     * The trip of a widget the app asked for a moment ago ("" for the next
     * trip), or null: then it was added from the home screen. Once only.
     */
    static String pendingPin(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String trip = p.getString("pinTrip", null);
        long at = p.getLong("pinAt", 0);
        if (trip == null) return null;
        p.edit().remove("pinTrip").remove("pinAt").apply();
        return System.currentTimeMillis() - at < PIN_WINDOW ? trip : null;
    }
}
