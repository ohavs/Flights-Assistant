package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The rows of the plan and reminders lists (ListWidgetService), and the
 * ticks made on them. A tick shows at once: it is kept here until a
 * snapshot saved after it says the same (the app saves one when Firestore
 * has the change), while ExpenseStore sends it.
 */
final class WidgetLists {
    private WidgetLists() {}

    static final class Row {
        String title, sub = "", pill = "";
        boolean done;
        String path, field;   // what a tick changes; null: nothing to tick, a tap opens the app
    }

    /** The day the plan widget shows: today during the trip, else its first. */
    static String planDay(WidgetKit.Moment m) {
        return m.during ? m.today : m.start;
    }

    static List<Row> plan(Context ctx, WidgetKit.Moment m) {
        List<Row> out = new ArrayList<>();
        JSONObject day = m.day(planDay(m));
        JSONArray items = day == null ? null : day.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || it.optString("title").isEmpty()) continue;
            Row r = new Row();
            r.title = it.optString("title");
            r.pill = it.optString("time");
            String place = it.optString("placeId");
            if (!place.isEmpty()) {
                r.path = "trips/" + m.tripId + "/planning/" + place;
                r.field = "visited";
            }
            r.done = ticked(ctx, m, r, it.optBoolean("visited"));
            out.add(r);
        }
        return out;
    }

    static List<Row> reminders(Context ctx, WidgetKit.Moment m) {
        List<Row> out = new ArrayList<>();
        JSONObject rem = m.trip.optJSONObject("reminders");
        JSONArray items = rem == null ? null : rem.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || it.optString("text").isEmpty()) continue;
            Row r = new Row();
            r.title = it.optString("text");
            boolean timed = !it.isNull("at") && it.optLong("at") > 0;
            r.pill = timed ? WidgetKit.clock(it.optLong("at"), m.now) : "";
            if (!it.optString("id").isEmpty()) {
                r.path = "trips/" + m.tripId + "/reminders/" + it.optString("id");
                r.field = "completed";
            }
            r.done = ticked(ctx, m, r, false);
            out.add(r);
        }
        return out;
    }

    /** Open reminders, less those just ticked here. */
    static int openReminders(Context ctx, WidgetKit.Moment m) {
        int n = 0;
        for (Row r : reminders(ctx, m)) if (!r.done) n++;
        return n;
    }

    // ── Ticks not yet in a snapshot ──────────────────────────────────────

    private static final String PREFS = "widget_ticks";

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** A tick made on what a snapshot saved at savedAt showed: newer than it, whatever the clocks say. */
    static void tick(Context ctx, String path, String field, boolean value, long savedAt) {
        long at = Math.max(System.currentTimeMillis(), savedAt + 1);
        prefs(ctx).edit().putString(path + "#" + field, (value ? "1" : "0") + "|" + at).apply();
    }

    /** The row's state: a tick made after the snapshot was saved, else the snapshot's. */
    private static boolean ticked(Context ctx, WidgetKit.Moment m, Row r, boolean saved) {
        if (r.path == null) return saved;
        String key = r.path + "#" + r.field;
        String t = prefs(ctx).getString(key, null);
        if (t == null) return saved;
        int bar = t.indexOf('|');
        long at = bar < 0 ? 0 : Long.parseLong(t.substring(bar + 1));
        if (at <= m.snapshot.optLong("savedAt")) {
            prefs(ctx).edit().remove(key).apply();   // the snapshot has caught up
            return saved;
        }
        return t.startsWith("1");
    }
}
