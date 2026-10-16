package com.ohavs.flightsassistant.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.AppActivity;
import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * What every home screen widget shares: the snapshot the app saves
 * (src/lib/widgetData.js, through TripWidgetPlugin), what it means at a
 * given moment, the palette, and taps that open the app. Each widget
 * (BaseWidget) draws from it by its own clock, so it stays right with the
 * app closed.
 */
final class WidgetKit {
    private WidgetKit() {}

    static final String PREFS = "trip_widget";
    static final String KEY = "snapshot";
    static final String ACTION_OPEN = "com.ohavs.flightsassistant.OPEN_TRIP";
    static final long HOUR = 3600_000L;

    // The CI host (WidgetPreviewActivity) puts a snapshot and a clock in its
    // widget's own options, so every redraw of that one widget, the
    // system's too, shows the moment under test. Nothing else sets them.
    static final String OPT_PREVIEW = "previewSnapshot", OPT_NOW = "previewNow";

    /** Every kind of widget; a new snapshot redraws them all. */
    static BaseWidget[] all() {
        return new BaseWidget[] { new TripWidget(), new CountdownWidget(), new PlanWidget(), new PackWidget(), new RemindersWidget(), new ExpenseWidget() };
    }

    static BaseWidget byName(String name) {
        for (BaseWidget w : all()) if (w.getClass().getSimpleName().equals(name)) return w;
        return new TripWidget();
    }

    // ── The snapshot ─────────────────────────────────────────────────────

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

    /** Redraws every widget on the home screen, now. */
    static void refreshAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        for (BaseWidget w : all()) for (int id : w.ids(ctx)) w.redraw(ctx, m, id);
        WidgetClock.schedule(ctx);
    }

    static int count(Context ctx) {
        int n = 0;
        for (BaseWidget w : all()) n += w.ids(ctx).length;
        return n;
    }

    // ── What it means now ────────────────────────────────────────────────

    /**
     * The moment a widget draws: the first trip that has not ended; before
     * it, or within a day of a flight, that flight; during it, today.
     */
    static final class Moment {
        JSONObject snapshot;     // null: signed out
        String palette = "green";
        String mode = "system";  // the app's theme: light, dark, or the phone's
        long now;
        String today;
        JSONObject trip;         // null: nothing ahead
        String tripId, start, end;
        boolean during;
        JSONObject next;         // the next flight still ahead, or null
        boolean flightSoon;      // that flight is within a day, or in the air
        boolean inAir;           // it has taken off and not yet landed
        int dayN, dayTotal;      // during the trip: day n of total

        /** The planner day of an iso date, or null. */
        JSONObject day(String iso) {
            JSONObject days = trip == null ? null : trip.optJSONObject("days");
            return days == null ? null : days.optJSONObject(iso);
        }

        /** The app is set to light or dark, whatever the phone is. */
        boolean forced() {
            return "light".equals(mode) || "dark".equals(mode);
        }

        /** Dark: by the app's setting, else by the phone's. */
        boolean dark(Context ctx) {
            if (forced()) return "dark".equals(mode);
            return (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        }

        /** The layout as the app's theme has it (WidgetThemes), or as is when it follows the phone. */
        int layout(int base) {
            return forced() ? WidgetThemes.layout(base, "dark".equals(mode)) : base;
        }

        int drawable(int base) {
            return forced() ? WidgetThemes.drawable(base, "dark".equals(mode)) : base;
        }

        /** Before the trip, or within a day of a flight: the flight leads. */
        boolean flightFirst() {
            return next != null && (!during || flightSoon);
        }
    }

    /**
     * The moment a widget with these options draws: under test (CI) the
     * snapshot and clock in its own options, else the app's snapshot now.
     * Null when the snapshot cannot be read.
     */
    static Moment momentOf(Context ctx, Bundle o) {
        String json;
        long now;
        if (o != null && o.containsKey(OPT_NOW)) {
            json = o.getString(OPT_PREVIEW, "");
            now = o.getLong(OPT_NOW);
        } else {
            json = snapshot(ctx);
            now = System.currentTimeMillis();
        }
        try {
            return moment(json == null || json.isEmpty() ? null : new JSONObject(json), now);
        } catch (Exception e) {
            return null;
        }
    }

    static JSONObject obj(String... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put(kv[i], kv[i + 1]);
        } catch (org.json.JSONException ignored) {
            // keys are never null
        }
        return o;
    }

    static Moment moment(JSONObject s, long now) {
        Moment m = new Moment();
        m.snapshot = s;
        m.now = now;
        m.today = iso(now);
        if (s == null) return m;
        m.palette = s.optString("palette", "green");
        m.mode = s.optString("theme", "system");
        JSONArray trips = s.optJSONArray("trips");
        for (int i = 0; trips != null && i < trips.length(); i++) {
            JSONObject t = trips.optJSONObject(i);
            if (t != null && t.optString("end").compareTo(m.today) >= 0) { m.trip = t; break; }
        }
        if (m.trip == null) return m;
        m.tripId = m.trip.optString("id");
        m.start = m.trip.optString("start");
        m.end = m.trip.optString("end");
        m.during = m.start.compareTo(m.today) <= 0 && m.end.compareTo(m.today) >= 0;
        m.dayN = days(m.start, m.today) + 1;
        m.dayTotal = days(m.start, m.end) + 1;
        // The next flight still ahead: by its instant, or by its day when
        // the time is not known yet.
        JSONArray flights = m.trip.optJSONArray("flights");
        for (int i = 0; flights != null && i < flights.length(); i++) {
            JSONObject f = flights.optJSONObject(i);
            if (f == null) continue;
            // Until it lands when the landing is known, else until it takes off.
            long at = f.isNull("at") ? 0 : f.optLong("at"), lands = f.isNull("arriveAt") ? 0 : f.optLong("arriveAt");
            boolean ahead = at == 0 ? f.optString("date").compareTo(m.today) >= 0 : (lands > 0 ? lands : at) > now;
            if (ahead) { m.next = f; break; }
        }
        m.inAir = m.next != null && !m.next.isNull("at") && m.next.optLong("at") <= now;
        m.flightSoon = m.next != null && (m.inAir || (m.next.isNull("at")
            ? m.next.optString("date").equals(m.today) : m.next.optLong("at") - now < 24 * HOUR));
        return m;
    }

    // ── Words ────────────────────────────────────────────────────────────

    /** "בעוד 5 ימים", "מחר", "בעוד 3 שעות", "בעוד 40 דק׳", "היום". */
    static String countdown(JSONObject f, String today, long now) {
        if (!f.isNull("at") && f.optLong("at") <= now) return "בטיסה";
        int d = days(today, f.optString("date"));
        if (d >= 2) return "בעוד " + d + " ימים";
        if (d == 1) return "מחר";
        if (f.isNull("at")) return "היום";
        long min = Math.max(0, (f.optLong("at") - now) / 60_000L);
        if (min < 60) return "בעוד " + Math.max(1, min) + " דק׳";
        long h = Math.round(min / 60.0);
        return h == 1 ? "בעוד שעה" : h == 2 ? "בעוד שעתיים" : "בעוד " + h + " שעות";
    }

    /** The same countdown as a big number and its word: { "5", "ימים" }. */
    static String[] countdownBig(JSONObject f, String today, long now) {
        if (!f.isNull("at") && f.optLong("at") <= now) return new String[] { "בטיסה", "" };
        int d = days(today, f.optString("date"));
        if (d >= 2) return new String[] { String.valueOf(d), "ימים" };
        if (d == 1) return new String[] { "מחר", "" };
        if (f.isNull("at")) return new String[] { "היום", "" };
        long min = Math.max(0, (f.optLong("at") - now) / 60_000L);
        if (min < 60) return new String[] { String.valueOf(Math.max(1, min)), "דק׳" };
        long h = Math.round(min / 60.0);
        return new String[] { String.valueOf(h), h == 1 ? "שעה" : "שעות" };
    }

    /** "שעה ו־20 דק׳", "40 דק׳": the time until an instant, for a flight in the air. */
    static String duration(long ms) {
        long min = Math.max(1, Math.round(ms / 60_000.0));
        long h = min / 60, rest = min % 60;
        String hours = h == 1 ? "שעה" : h == 2 ? "שעתיים" : h + " שעות";
        if (h == 0) return rest + " דק׳";
        return rest == 0 ? hours : hours + " ו־" + rest + " דק׳";
    }

    /** The flight's day and its clocks: "יום ג׳ 3.11 · המראה 22:30 · נחיתה 02:50". */
    static String flightTimes(JSONObject f) {
        String when = f.optString("when"), dep = f.optString("dep"), arr = f.optString("arr");
        if (dep.isEmpty()) return when;
        int i = when.indexOf(" · ");
        String day = i < 0 ? when : when.substring(0, i);
        return (day.isEmpty() ? "" : day + " · ") + "המראה " + dep + (arr.isEmpty() ? "" : " · נחיתה " + arr);
    }

    /** What the flight tab knows besides the times: "שער B12 · בזמן", or "". */
    static String flightInfo(JSONObject f) {
        String gate = f.optString("gate"), status = f.optString("status");
        StringBuilder s = new StringBuilder();
        if (!gate.isEmpty()) s.append("שער ").append(gate);
        if (!status.isEmpty()) s.append(s.length() > 0 ? " · " : "").append(status);
        return s.toString();
    }

    /** In the air: "נוחתת ב־02:50 שעון בודפשט", and how long until then. */
    static String[] landing(JSONObject f, long now) {
        String arr = f.optString("arr"), city = f.optString("toCity");
        String when = arr.isEmpty() ? "בדרך ל" + (city.isEmpty() ? f.optString("to") : city)
            : "נוחתת ב־" + arr + (city.isEmpty() ? "" : " שעון " + city);
        long lands = f.isNull("arriveAt") ? 0 : f.optLong("arriveAt");
        return new String[] { when, lands > now ? "עוד " + duration(lands - now) : "" };
    }

    /** "טיסת הלוך · LY 323" → "טיסת הלוך". */
    static String legName(JSONObject f) {
        String t = f.optString("title");
        int i = t.indexOf(" · ");
        return i < 0 ? t : t.substring(0, i);
    }

    /** "היום 18:00", "מחר 09:00", "5.11 09:00". */
    static String clock(long at, long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(at);
        String hm = String.format(Locale.US, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        int d = days(iso(now), iso(at));
        if (d == 0) return "היום " + hm;
        if (d == 1) return "מחר " + hm;
        return c.get(Calendar.DAY_OF_MONTH) + "." + (c.get(Calendar.MONTH) + 1) + " " + hm;
    }

    /** A big word with smaller ones around it, one text that autosizes as a whole. */
    static CharSequence big(String before, String number, String after) {
        String b = before.isEmpty() ? "" : before + " ";
        String a = after.isEmpty() ? "" : " " + after;
        SpannableString s = new SpannableString(b + number + a);
        if (!b.isEmpty()) s.setSpan(new RelativeSizeSpan(0.42f), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (!a.isEmpty()) s.setSpan(new RelativeSizeSpan(0.42f), b.length() + number.length(), s.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
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
            Calendar a = Calendar.getInstance(TimeZone.getTimeZone("UTC")), b = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            a.clear(); b.clear();
            a.set(Integer.parseInt(from.substring(0, 4)), Integer.parseInt(from.substring(5, 7)) - 1, Integer.parseInt(from.substring(8, 10)));
            b.set(Integer.parseInt(to.substring(0, 4)), Integer.parseInt(to.substring(5, 7)) - 1, Integer.parseInt(to.substring(8, 10)));
            return (int) Math.round((b.getTimeInMillis() - a.getTimeInMillis()) / 86_400_000.0);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    // ── Sizes ────────────────────────────────────────────────────────────

    /** The sizes the launcher shows a widget at (dp), at most 12; empty before it reports any. */
    @SuppressWarnings("deprecation")
    static List<SizeF> sizes(Bundle o) {
        List<SizeF> out = new ArrayList<>();
        if (o == null) return out;
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<SizeF> sizes = o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null) {
                for (SizeF s : sizes) {
                    if (s != null && s.getWidth() > 0 && s.getHeight() > 0 && out.size() < 12) out.add(s);
                }
            }
        }
        if (out.isEmpty()) {
            int minW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH), maxW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH);
            int minH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT), maxH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT);
            // Portrait (narrow and tall), then landscape.
            if (minW > 0 && maxH > 0) out.add(new SizeF(minW, maxH));
            if (maxW > 0 && minH > 0 && (maxW != minW || maxH != minH)) out.add(new SizeF(maxW, minH));
        }
        return out;
    }

    // ── Rows ─────────────────────────────────────────────────────────────

    // A list row (a pill and a line, and the gap above it) and the "ועוד"
    // line under the rows, in dp: XML in scripts/widget-layouts.py.
    static final float ROW = 24f, MORE = 23f;

    /** How many rows of about rowDp fit in roomDp (at least one). */
    static int fit(float roomDp, float rowDp) {
        return Math.max(1, (int) Math.floor(roomDp / rowDp));
    }

    /**
     * How many of count items to show as rows in roomDp (at most max), when
     * there are total in all: all of them if they fit, else as many as fit
     * with the "ועוד" line under them.
     */
    static int shown(int count, int total, float roomDp, int max) {
        int fit = Math.min(max, fit(roomDp, ROW));
        if (total <= fit) return Math.min(count, fit);
        return Math.min(count, Math.min(max, fit(roomDp - MORE, ROW)));
    }

    static float px(Context ctx, float dp) {
        return dp * ctx.getResources().getDisplayMetrics().density;
    }

    /** Padding in dp (RemoteViews takes pixels). */
    static void pad(Context ctx, RemoteViews v, int id, float side, float top) {
        int s = Math.round(px(ctx, side)), t = Math.round(px(ctx, top));
        v.setViewPadding(id, s, t, s, t);
    }

    static void visible(RemoteViews v, int id, boolean on) {
        v.setViewVisibility(id, on ? View.VISIBLE : View.GONE);
    }

    // ── Opening the app where the tap points ─────────────────────────────

    static PendingIntent open(Context ctx, String tripId, String tab) {
        return PendingIntent.getActivity(ctx, 0, openIntent(ctx, tripId, tab), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The app at a trip's tab (TripWidgetPlugin "open"). */
    static Intent openIntent(Context ctx, String tripId, String tab) {
        Intent i = new Intent(ctx, AppActivity.class)
            .setAction(ACTION_OPEN)
            // A distinct address per target, or Android hands every tap the same intent.
            .setData(Uri.parse("tripwidget://open/" + (tab == null ? "home" : tab) + "/" + (tripId == null ? "" : tripId)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (tripId != null) i.putExtra("tripId", tripId);
        if (tab != null) i.putExtra("tab", tab);
        return i;
    }

    // ── A message in place of the content ────────────────────────────────

    /** mo: the moment, for its palette and theme; null when the snapshot cannot be read. */
    static RemoteViews message(Context ctx, Moment mo, String title, String hint, String tripId, String tab) {
        if (mo == null) mo = new Moment();
        RemoteViews v = new RemoteViews(ctx.getPackageName(), mo.layout(R.layout.widget_message));
        v.setTextViewText(R.id.title, title);
        v.setTextViewText(R.id.subtitle, hint);
        theme(ctx, v, mo, new Paint().card(R.id.root).soft(R.id.icon_tile));
        v.setOnClickPendingIntent(R.id.root, open(ctx, tripId, tab));
        return v;
    }

    // ── The palette, light and dark ──────────────────────────────────────

    // { accent (text), brand (bars), card, tile (surface-2), soft (brand-soft) }
    // for light, then dark: index.css. The dark soft is the brand at 18% on the card.
    static int[][] colors(String palette) {
        switch (palette) {
            case "ocean": return new int[][] { { 0xFF0A6A9E, 0xFF2B9AD6, 0xFFFFFFFF, 0xFFE8EFF3, 0xFFE3F1F9 }, { 0xFF5CB8EA, 0xFF5CB8EA, 0xFF25303B, 0xFF2F3B47, 0xFF2F485A } };
            case "violet": return new int[][] { { 0xFF6A45D6, 0xFF9B82F6, 0xFFFFFFFF, 0xFFEEEAF6, 0xFFEFEAFE }, { 0xFFAD98FF, 0xFFAD98FF, 0xFF2D2938, 0xFF3A3548, 0xFF443D5C } };
            case "sand": return new int[][] { { 0xFFA4561A, 0xFFE99B4C, 0xFFFFFFFF, 0xFFF0E8DA, 0xFFFBEBD9 }, { 0xFFF2AC63, 0xFFF2AC63, 0xFF312C25, 0xFF3E372E, 0xFF544330 } };
            case "coral": return new int[][] { { 0xFFB23F2E, 0xFFF47C6A, 0xFFFFFFFF, 0xFFF5E8E5, 0xFFFDE7E3 }, { 0xFFFF9A8A, 0xFFFF9A8A, 0xFF362A2C, 0xFF433537, 0xFF5A3E3D } };
            default: return new int[][] { { 0xFF16874A, 0xFF22A45D, 0xFFFFFFFF, 0xFFF0F0EC, 0xFFE6F4EC }, { 0xFF2DBE6C, 0xFF2DBE6C, 0xFF2C2E35, 0xFF373941, 0xFF2C483F } };
        }
    }

    /** Which views take which of the palette's colours. */
    static final class Paint {
        final List<Integer> cards = new ArrayList<>(), tiles = new ArrayList<>(), softs = new ArrayList<>(),
            accents = new ArrayList<>(), bars = new ArrayList<>(), fills = new ArrayList<>();
        Paint card(int... ids) { for (int i : ids) cards.add(i); return this; }
        Paint tile(int... ids) { for (int i : ids) tiles.add(i); return this; }
        Paint soft(int... ids) { for (int i : ids) softs.add(i); return this; }
        /** Accent text on a soft chip or pill: both. */
        Paint chip(int... ids) { for (int i : ids) { softs.add(i); accents.add(i); } return this; }
        Paint bar(int... ids) { for (int i : ids) bars.add(i); return this; }
        /** A primary key: the brand behind it. */
        Paint fill(int... ids) { for (int i : ids) fills.add(i); return this; }
    }

    static void theme(Context ctx, RemoteViews v, Moment m, Paint p) {
        int[][] c = colors(m.palette);
        int[] day = c[0], night = c[1];
        // Set to light or dark in the app: that one, whatever the phone is.
        if (m.forced()) day = night = m.dark(ctx) ? c[1] : c[0];
        if (Build.VERSION.SDK_INT >= 31) {
            // Both, and the launcher picks with the phone's light or dark mode.
            for (int id : p.accents) v.setColorInt(id, "setTextColor", day[0], night[0]);
            for (int id : p.bars) v.setColorStateList(id, "setProgressTintList", ColorStateList.valueOf(day[1]), ColorStateList.valueOf(night[1]));
            for (int id : p.cards) v.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(day[2]), ColorStateList.valueOf(night[2]));
            for (int id : p.tiles) v.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(day[3]), ColorStateList.valueOf(night[3]));
            for (int id : p.softs) v.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(day[4]), ColorStateList.valueOf(night[4]));
            for (int id : p.fills) v.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(day[1]), ColorStateList.valueOf(night[1]));
        } else {
            // Older phones keep the green surfaces; the accent follows the palette.
            int[] k = m.dark(ctx) ? night : day;
            for (int id : p.accents) v.setTextColor(id, k[0]);
        }
    }
}
