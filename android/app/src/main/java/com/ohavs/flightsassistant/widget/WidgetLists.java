package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The rows of the plan and reminders lists (ListWidgetService), and the
 * ticks made on them. A tick shows at once: it is kept here until a
 * snapshot saved after it says the same (the app saves one when Firestore
 * has the change), while ExpenseStore sends it. So does a reminder added
 * on the widget (ReminderSheetActivity), first in the list.
 */
final class WidgetLists {
    private WidgetLists() {}

    static final class Row {
        String title, sub = "", pill = "";
        String day = "", month = "";   // a booking's date leaf; "" when it has no date
        boolean done;
        String path, field;   // what a tick changes; null: nothing to tick, a tap opens the app
    }

    private static final String[] MONTHS = { "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳" };

    /**
     * The bookings ahead (BookingsWidget), as the snapshot lists them: the
     * date as a leaf, the time and the confirmation code under the title,
     * and "היום" / "מחר" in a pill. Nothing to tick: a tap opens them.
     */
    static List<Row> bookings(WidgetKit.Moment m) {
        List<Row> out = new ArrayList<>();
        JSONArray items = m.trip.optJSONArray("bookings");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject b = items.optJSONObject(i);
            if (b == null || b.optString("title").isEmpty()) continue;
            Row r = new Row();
            r.title = b.optString("title");
            List<String> sub = new ArrayList<>();
            if (!b.optString("time").isEmpty()) sub.add(b.optString("time"));
            if (!b.optString("code").isEmpty()) sub.add("אישור " + b.optString("code"));
            if (b.optBoolean("pending")) sub.add("ממתינה לאישור");
            r.sub = android.text.TextUtils.join(" · ", sub);
            String date = b.optString("date");
            if (date.length() == 10) {
                r.day = String.valueOf(Integer.parseInt(date.substring(8, 10)));
                r.month = MONTHS[Integer.parseInt(date.substring(5, 7)) - 1];
                int d = WidgetKit.days(m.today, date);
                r.pill = d == 0 ? "היום" : d == 1 ? "מחר" : "";
            } else {
                r.pill = "בלי תאריך";
            }
            out.add(r);
        }
        return out;
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
        Set<String> inSnapshot = new HashSet<>();
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null) inSnapshot.add(it.optString("id"));
        }
        for (JSONObject a : added(ctx, m, inSnapshot)) {
            Row r = new Row();
            r.title = a.optString("text");
            r.path = "trips/" + m.tripId + "/reminders/" + a.optString("id");
            r.field = "completed";
            r.done = ticked(ctx, m, r, false);
            out.add(r);
        }
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

    // ── Reminders added here, not yet in a snapshot ─────────────────────

    private static final String ADDED = "widget_added";

    /** A reminder added on the widget of a snapshot saved at savedAt: shown at once. */
    static void added(Context ctx, String tripId, String id, String text, long savedAt) {
        SharedPreferences p = ctx.getSharedPreferences(ADDED, Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(p.getString("reminders", "[]"));
            a.put(new JSONObject().put("id", id).put("tripId", tripId).put("text", text)
                .put("at", Math.max(System.currentTimeMillis(), savedAt + 1)));
            p.edit().putString("reminders", a.toString()).apply();
        } catch (JSONException ignored) {
            // the ids and texts are plain strings
        }
    }

    /**
     * The trip's reminders added here that its snapshot does not have yet:
     * still waiting to be sent, or newer than the snapshot. The rest (the
     * snapshot has them, or has caught up) are let go.
     */
    private static List<JSONObject> added(Context ctx, WidgetKit.Moment m, Set<String> inSnapshot) {
        SharedPreferences p = ctx.getSharedPreferences(ADDED, Context.MODE_PRIVATE);
        List<JSONObject> out = new ArrayList<>();
        JSONArray all;
        try {
            all = new JSONArray(p.getString("reminders", "[]"));
        } catch (JSONException x) {
            return out;
        }
        Set<String> waiting = new HashSet<>();
        JSONArray q = ExpenseStore.pending(ctx);
        for (int i = 0; i < q.length(); i++) {
            JSONObject e = q.optJSONObject(i);
            if (e != null) waiting.add(e.optString("id"));
        }
        JSONArray keep = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject a = all.optJSONObject(i);
            if (a == null) continue;
            String id = a.optString("id");
            boolean current = !inSnapshot.contains(id)
                && (waiting.contains(id) || a.optLong("at") > m.snapshot.optLong("savedAt"));
            if (!current) continue;
            keep.put(a);
            if (m.tripId.equals(a.optString("tripId"))) out.add(0, a);   // the newest first
        }
        if (keep.length() != all.length()) p.edit().putString("reminders", keep.toString()).apply();
        return out;
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
