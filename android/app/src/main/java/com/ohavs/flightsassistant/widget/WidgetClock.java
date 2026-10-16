package com.ohavs.flightsassistant.widget;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Wakes the widgets when what they show changes by the clock, not by the
 * app: at midnight (the plan moves to the next day), and around each
 * flight (a day before, takeoff, landing), so they move on with the app
 * closed. The system's half-hourly update is the floor. The alarm is
 * inexact (no permission needed); Android may hold it a few minutes.
 */
public class WidgetClock extends BroadcastReceiver {
    private static final String ACTION = "com.ohavs.flightsassistant.WIDGET_CLOCK";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        WidgetKit.refreshAll(ctx);   // and sets the next one
    }

    /** The next alarm after now, for the snapshot the widgets draw; none without widgets. */
    static void schedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, new Intent(ctx, WidgetClock.class).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (WidgetKit.count(ctx) == 0) {
            am.cancel(pi);
            return;
        }
        String json = WidgetKit.snapshot(ctx);
        JSONObject s = null;
        try {
            s = json == null ? null : new JSONObject(json);
        } catch (Exception ignored) {
            // the widgets say so; midnight still comes
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC, next(s, System.currentTimeMillis()), pi);
    }

    /** The first moment after now when a widget shows something else. */
    static long next(JSONObject s, long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_MONTH, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 30);
        c.set(Calendar.MILLISECOND, 0);
        long best = c.getTimeInMillis();
        JSONArray trips = s == null ? null : s.optJSONArray("trips");
        for (int i = 0; trips != null && i < trips.length(); i++) {
            JSONArray flights = trips.optJSONObject(i) == null ? null : trips.optJSONObject(i).optJSONArray("flights");
            for (int j = 0; flights != null && j < flights.length(); j++) {
                JSONObject f = flights.optJSONObject(j);
                if (f == null) continue;
                for (long t : new long[] { f.optLong("at") - 24 * WidgetKit.HOUR, f.optLong("at"), f.optLong("arriveAt") }) {
                    if (t > now && t < best) best = t + 30_000L;
                }
            }
        }
        return best;
    }
}
