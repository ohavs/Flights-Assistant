package com.ohavs.flightsassistant.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.AppActivity;
import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * The home screen widget (4x2). It draws from the snapshot the app saves
 * (src/lib/widgetData.js, through TripWidgetPlugin) and decides by its own
 * clock, so it stays right with the app closed:
 *   - the first trip that has not ended;
 *   - before it, or within a day of a flight: that flight and a countdown;
 *   - during it: today's plan;
 *   - always: how much is packed and how many reminders are open.
 * The system redraws it every half hour (res/xml/trip_widget.xml).
 */
public class TripWidget extends AppWidgetProvider {
    static final String PREFS = "trip_widget";
    static final String KEY = "snapshot";
    static final String ACTION_OPEN = "com.ohavs.flightsassistant.OPEN_TRIP";
    private static final long HOUR = 3600_000L;

    // The CI host (WidgetPreviewActivity) puts a snapshot and a clock in its
    // widget's own options, so every redraw of that one widget, the
    // system's too, shows the moment under test. Nothing else sets them.
    static final String OPT_PREVIEW = "previewSnapshot", OPT_NOW = "previewNow";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) redraw(ctx, m, id);
    }

    private static void redraw(Context ctx, AppWidgetManager m, int id) {
        android.os.Bundle o = m.getAppWidgetOptions(id);
        if (o != null && o.containsKey(OPT_NOW)) {
            String json = o.getString(OPT_PREVIEW, "");
            render(ctx, m, id, json.isEmpty() ? null : json, o.getLong(OPT_NOW));
        } else {
            render(ctx, m, id, snapshot(ctx), System.currentTimeMillis());
        }
    }

    static String snapshot(Context ctx) {
        return prefs(ctx).getString(KEY, null);
    }

    static void save(Context ctx, String json) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        if (json == null) e.remove(KEY); else e.putString(KEY, json);
        e.apply();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int[] ids(Context ctx) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, TripWidget.class));
    }

    /** Redraws every widget on the home screen, now. */
    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (int id : ids(ctx)) redraw(ctx, m, id);
    }

    static void render(Context ctx, AppWidgetManager m, int id, String json, long now) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_trip);
        try {
            fill(ctx, v, json == null ? null : new JSONObject(json), now);
        } catch (Exception e) {
            // A snapshot it cannot read: say so quietly rather than show nothing.
            Log.w("TripWidget", "bad snapshot", e);
            empty(ctx, v, "פתחו את האפליקציה", "כדי לעדכן את הווידג׳ט", null);
        }
        m.updateAppWidget(id, v);
    }

    // ── What to show ─────────────────────────────────────────────────────

    private static void fill(Context ctx, RemoteViews v, JSONObject s, long now) {
        String palette = s == null ? "green" : s.optString("palette", "green");
        theme(ctx, v, palette);
        if (s == null) {
            empty(ctx, v, "התחברו באפליקציה", "והטיול הבא יופיע כאן", null);
            return;
        }
        String today = iso(now);
        JSONObject trip = null;
        JSONArray trips = s.optJSONArray("trips");
        for (int i = 0; trips != null && i < trips.length(); i++) {
            JSONObject t = trips.optJSONObject(i);
            if (t != null && t.optString("end").compareTo(today) >= 0) { trip = t; break; }
        }
        if (trip == null) {
            empty(ctx, v, "אין טיול קרוב", "לחצו כדי לתכנן את הבא", null);
            return;
        }
        String tripId = trip.optString("id");
        String start = trip.optString("start"), end = trip.optString("end");
        boolean during = start.compareTo(today) <= 0 && end.compareTo(today) >= 0;

        // The next flight still ahead: by its instant, or by its day when
        // the time is not known yet.
        JSONObject next = null;
        JSONArray flights = trip.optJSONArray("flights");
        for (int i = 0; flights != null && i < flights.length(); i++) {
            JSONObject f = flights.optJSONObject(i);
            if (f == null) continue;
            boolean ahead = f.isNull("at") ? f.optString("date").compareTo(today) >= 0 : f.optLong("at") > now;
            if (ahead) { next = f; break; }
        }
        boolean flightSoon = next != null && (next.isNull("at")
            ? next.optString("date").equals(today) : next.optLong("at") - now < 24 * HOUR);

        v.setTextViewText(R.id.trip_name, trip.optString("name"));
        String tab;
        if (next != null && (!during || flightSoon)) {
            tab = "flight";
            show(v, R.id.flight_block);
            v.setTextViewText(R.id.chip, countdown(next, today, now));
            v.setTextViewText(R.id.flight_title, next.optString("title"));
            v.setTextViewText(R.id.flight_route, next.optString("route"));
            v.setTextViewText(R.id.flight_when, next.optString("when"));
            v.setViewVisibility(R.id.flight_route, next.optString("route").isEmpty() ? View.GONE : View.VISIBLE);
        } else {
            tab = "planning";
            show(v, R.id.plan_block);
            int n = days(start, today) + 1, total = days(start, end) + 1;
            v.setTextViewText(R.id.chip, "יום " + n + " מתוך " + total);
            JSONObject day = trip.optJSONObject("days") == null ? null : trip.optJSONObject("days").optJSONObject(today);
            v.setTextViewText(R.id.plan_title, "היום" + (day != null && !day.optString("title").isEmpty() ? " · " + day.optString("title") : ""));
            JSONArray lines = day == null ? null : day.optJSONArray("lines");
            int count = lines == null ? 0 : lines.length();
            int more = day == null ? 0 : day.optInt("more");
            // Three lines fit with the bottom row; with more to come, two
            // and "ועוד N" in the third line's place.
            int shown = more > 0 ? Math.min(count, 2) : count;
            more += count - shown;
            int[] ids = { R.id.plan_1, R.id.plan_2, R.id.plan_3 };
            for (int i = 0; i < ids.length; i++) {
                String line = i < shown ? "•  " + lines.optString(i) : null;
                if (i == 0 && count == 0) line = "אין פעילויות בתוכנית להיום";
                v.setTextViewText(ids[i], line == null ? "" : line);
                v.setViewVisibility(ids[i], line == null ? View.GONE : View.VISIBLE);
            }
            v.setTextViewText(R.id.plan_more, more == 1 ? "ועוד פעילות אחת" : "ועוד " + more + " פעילויות");
            v.setViewVisibility(R.id.plan_more, more > 0 ? View.VISIBLE : View.GONE);
        }

        JSONObject packed = trip.optJSONObject("packed");
        int done = packed == null ? 0 : packed.optInt("done"), all = packed == null ? 0 : packed.optInt("total");
        v.setTextViewText(R.id.packed_text, all == 0 ? "הרשימה ריקה" : done + "/" + all + " נארזו");
        v.setProgressBar(R.id.packed_bar, 100, all == 0 ? 0 : Math.round(100f * done / all), false);
        v.setViewVisibility(R.id.packed_bar, all == 0 ? View.GONE : View.VISIBLE);
        int open = trip.optJSONObject("reminders") == null ? 0 : trip.optJSONObject("reminders").optInt("open");
        v.setTextViewText(R.id.rem_text, open == 1 ? "תזכורת אחת" : open + " תזכורות");
        v.setViewVisibility(R.id.rem, open > 0 ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.bottom, View.VISIBLE);

        v.setOnClickPendingIntent(R.id.root, open(ctx, tripId, tab));
        v.setOnClickPendingIntent(R.id.packed, open(ctx, tripId, "checklist"));
        v.setOnClickPendingIntent(R.id.rem, open(ctx, tripId, "checklist"));
    }

    private static void show(RemoteViews v, int block) {
        v.setViewVisibility(R.id.flight_block, block == R.id.flight_block ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.plan_block, block == R.id.plan_block ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.empty_block, block == R.id.empty_block ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.chip, View.VISIBLE);
    }

    private static void empty(Context ctx, RemoteViews v, String title, String hint, String tripId) {
        show(v, R.id.empty_block);
        v.setViewVisibility(R.id.chip, View.GONE);
        v.setViewVisibility(R.id.bottom, View.GONE);
        v.setTextViewText(R.id.trip_name, ctx.getString(R.string.app_name));
        v.setTextViewText(R.id.empty_title, title);
        v.setTextViewText(R.id.empty_hint, hint);
        v.setOnClickPendingIntent(R.id.root, open(ctx, tripId, null));
    }

    // "בעוד 5 ימים", "מחר", "בעוד 3 שעות", "בעוד 40 דק׳", "היום".
    static String countdown(JSONObject f, String today, long now) {
        int d = days(today, f.optString("date"));
        if (d >= 2) return "בעוד " + d + " ימים";
        if (d == 1) return "מחר";
        if (f.isNull("at")) return "היום";
        long min = Math.max(0, (f.optLong("at") - now) / 60_000L);
        if (min < 60) return "בעוד " + Math.max(1, min) + " דק׳";
        long h = Math.round(min / 60.0);
        return h == 1 ? "בעוד שעה" : h == 2 ? "בעוד שעתיים" : "בעוד " + h + " שעות";
    }

    // ── Dates, in the phone's own time ───────────────────────────────────

    static String iso(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** Whole days from one 'YYYY-MM-DD' to another (0 when unreadable). */
    static int days(String from, String to) {
        try {
            Calendar a = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")), b = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
            a.clear(); b.clear();
            a.set(Integer.parseInt(from.substring(0, 4)), Integer.parseInt(from.substring(5, 7)) - 1, Integer.parseInt(from.substring(8, 10)));
            b.set(Integer.parseInt(to.substring(0, 4)), Integer.parseInt(to.substring(5, 7)) - 1, Integer.parseInt(to.substring(8, 10)));
            return (int) Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86_400_000.0);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    // ── Opening the app where the tap points ─────────────────────────────

    private static PendingIntent open(Context ctx, String tripId, String tab) {
        Intent i = new Intent(ctx, AppActivity.class)
            .setAction(ACTION_OPEN)
            // A distinct address per target, or Android hands every tap the same intent.
            .setData(Uri.parse("tripwidget://open/" + (tab == null ? "home" : tab) + "/" + (tripId == null ? "" : tripId)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (tripId != null) i.putExtra("tripId", tripId);
        if (tab != null) i.putExtra("tab", tab);
        return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ── The palette, light and dark ──────────────────────────────────────

    // { accent (text), brand (bar, icons), card } for light, then dark. index.css.
    private static int[][] colors(String palette) {
        switch (palette) {
            case "ocean": return new int[][] { { 0xFF0A6A9E, 0xFF2B9AD6, 0xFFFFFFFF }, { 0xFF5CB8EA, 0xFF5CB8EA, 0xFF25303B } };
            case "violet": return new int[][] { { 0xFF6A45D6, 0xFF9B82F6, 0xFFFFFFFF }, { 0xFFAD98FF, 0xFFAD98FF, 0xFF2D2938 } };
            case "sand": return new int[][] { { 0xFFA4561A, 0xFFE99B4C, 0xFFFFFFFF }, { 0xFFF2AC63, 0xFFF2AC63, 0xFF312C25 } };
            case "coral": return new int[][] { { 0xFFB23F2E, 0xFFF47C6A, 0xFFFFFFFF }, { 0xFFFF9A8A, 0xFFFF9A8A, 0xFF362A2C } };
            default: return new int[][] { { 0xFF16874A, 0xFF22A45D, 0xFFFFFFFF }, { 0xFF2DBE6C, 0xFF2DBE6C, 0xFF2C2E35 } };
        }
    }

    private static void theme(Context ctx, RemoteViews v, String palette) {
        int[][] c = colors(palette);
        int[] day = c[0], night = c[1];
        if (Build.VERSION.SDK_INT >= 31) {
            // Both, and the launcher picks with the phone's light or dark mode.
            v.setColorInt(R.id.chip, "setTextColor", day[0], night[0]);
            v.setColorInt(R.id.flight_icon, "setColorFilter", day[1], night[1]);
            v.setColorInt(R.id.plan_icon, "setColorFilter", day[1], night[1]);
            v.setColorStateList(R.id.packed_bar, "setProgressTintList", ColorStateList.valueOf(day[1]), ColorStateList.valueOf(night[1]));
            v.setColorStateList(R.id.root, "setBackgroundTintList", ColorStateList.valueOf(day[2]), ColorStateList.valueOf(night[2]));
        } else {
            boolean dark = (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            int[] k = dark ? night : day;
            v.setTextColor(R.id.chip, k[0]);
            v.setInt(R.id.flight_icon, "setColorFilter", k[1]);
            v.setInt(R.id.plan_icon, "setColorFilter", k[1]);
        }
    }
}
