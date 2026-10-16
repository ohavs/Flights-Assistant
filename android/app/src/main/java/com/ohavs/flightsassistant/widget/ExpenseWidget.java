package com.ohavs.flightsassistant.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * An expense from the home screen (4x3): the amount on a keypad and the
 * currency (a tap moves to the next of the trip's: shekels, euros or
 * dollars, the destination's own), then "המשך" opens
 * ExpenseSheetActivity over the home screen for the category and the
 * place, and saves (ExpenseStore). A tap anywhere else opens the trip's
 * expenses. What was typed is kept per widget, so
 * two of them do not share it; the line under the icon says how the last
 * save went.
 */
public class ExpenseWidget extends BaseWidget {
    static final String ACTION_KEY = "com.ohavs.flightsassistant.EXPENSE_KEY";
    private static final String PREFS = "expense_widget";
    private static final int[][] KEYS = {
        { R.id.key_0, '0' }, { R.id.key_1, '1' }, { R.id.key_2, '2' }, { R.id.key_3, '3' }, { R.id.key_4, '4' },
        { R.id.key_5, '5' }, { R.id.key_6, '6' }, { R.id.key_7, '7' }, { R.id.key_8, '8' }, { R.id.key_9, '9' },
        { R.id.key_dot, '.' }, { R.id.key_back, '<' }, { R.id.key_cur, '$' }, { R.id.key_save, '=' },
    };

    @Override
    float[] defaultSize() {
        return new float[] { 300f, 280f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        return content(ctx, m, w, h, AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_expense));
        SharedPreferences p = prefs(ctx);
        String amount = p.getString("amount_" + id, "");
        String status = p.getString("status_" + id, "");
        JSONObject cur = currency(m.trip, p.getString("cur_" + id, null));

        v.setTextViewText(R.id.title, status.isEmpty() ? "הוצאה · " + m.trip.optString("name") : status);
        v.setTextViewText(R.id.amount, WidgetKit.big("", amount.isEmpty() ? "0" : amount, cur.optString("symbol")));
        v.setTextViewText(R.id.key_cur, cur.optString("code"));
        // Short: no icon line, the keypad keeps its room.
        WidgetKit.visible(v, R.id.header, h >= 240);

        for (int[] k : KEYS) {
            char c = (char) k[1];
            PendingIntent tap = c == '=' && !amount.isEmpty() && value(amount) > 0
                ? ExpenseSheetActivity.open(ctx, id)
                : key(ctx, id, c);
            v.setOnClickPendingIntent(k[0], tap);
        }
        // Anywhere but a key: the trip's expenses in the app.
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "expenses"));
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile)
            .chip(R.id.key_cur).fill(R.id.key_save)
            .tile(R.id.key_0, R.id.key_1, R.id.key_2, R.id.key_3, R.id.key_4, R.id.key_5, R.id.key_6,
                R.id.key_7, R.id.key_8, R.id.key_9, R.id.key_dot, R.id.key_back));
        return v;
    }

    // ── Keys ─────────────────────────────────────────────────────────────

    private static PendingIntent key(Context ctx, int id, char c) {
        Intent i = new Intent(ctx, ExpenseWidget.class)
            .setAction(ACTION_KEY)
            // A distinct address per key and widget, or Android hands every key the same intent.
            .setData(Uri.parse("expensewidget://key/" + id + "/" + (int) c))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .putExtra("key", String.valueOf(c));
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent i) {
        if (ACTION_KEY.equals(i.getAction())) {
            int id = i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            String k = i.getStringExtra("key");
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID && k != null && !k.isEmpty()) press(ctx, id, k.charAt(0));
            return;
        }
        super.onReceive(ctx, i);
    }

    /** A key: the amount (two decimals at most), the currency, or "המשך" with nothing typed. */
    void press(Context ctx, int id, char c) {
        SharedPreferences p = prefs(ctx);
        String a = p.getString("amount_" + id, "");
        SharedPreferences.Editor e = p.edit().remove("status_" + id);
        if (c == '<') {
            a = a.isEmpty() ? "" : a.substring(0, a.length() - 1);
        } else if (c == '.') {
            if (!a.contains(".")) a = a.isEmpty() ? "0." : a + ".";
        } else if (c == '$') {
            JSONObject trip = trip(ctx, id);
            if (trip != null) e.putString("cur_" + id, next(trip, currency(trip, p.getString("cur_" + id, null)).optString("code")));
        } else if (c == '=') {
            e.putString("status_" + id, "הקלידו סכום ואז המשך");
        } else if (c >= '0' && c <= '9') {
            int dot = a.indexOf('.');
            boolean full = dot >= 0 ? a.length() - dot > 2 : a.length() >= 7;
            if (!full) a = a.equals("0") ? String.valueOf(c) : a + c;
        }
        e.putString("amount_" + id, a).apply();
        redraw(ctx, AppWidgetManager.getInstance(ctx), id);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (int id : ids) e.remove("amount_" + id).remove("cur_" + id).remove("status_" + id);
        e.apply();
    }

    // ── What the sheet shares with it ────────────────────────────────────

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static double value(String amount) {
        try {
            return Double.parseDouble(amount);
        } catch (NumberFormatException x) {
            return 0;
        }
    }

    /** After a save: the keypad clears, and the line says how it went. */
    static void saved(Context ctx, int id, String status) {
        prefs(ctx).edit().putString("amount_" + id, "").putString("status_" + id, status).apply();
        new ExpenseWidget().redraw(ctx, AppWidgetManager.getInstance(ctx), id);
    }

    /** The trip this widget adds to, from the snapshot it draws (null: none). */
    static JSONObject trip(Context ctx, int id) {
        WidgetKit.Moment m = WidgetKit.momentOf(ctx, AppWidgetManager.getInstance(ctx).getAppWidgetOptions(id));
        return m == null ? null : m.trip;
    }

    /** { code, symbol }: the one picked on this widget, else the trip's last used, else shekels. */
    static JSONObject currency(JSONObject trip, String picked) {
        JSONArray all = currencies(trip);
        String want = picked != null ? picked : spend(trip).optString("currency", "ILS");
        for (int i = 0; i < all.length(); i++) {
            JSONObject c = all.optJSONObject(i);
            if (c != null && want.equals(c.optString("code"))) return c;
        }
        JSONObject first = all.optJSONObject(0);
        return first != null ? first : WidgetKit.obj("code", "ILS", "symbol", "₪");
    }

    private static String next(JSONObject trip, String code) {
        JSONArray all = currencies(trip);
        for (int i = 0; i < all.length(); i++) {
            JSONObject c = all.optJSONObject(i);
            if (c != null && code.equals(c.optString("code"))) {
                JSONObject n = all.optJSONObject((i + 1) % all.length());
                return n == null ? code : n.optString("code");
            }
        }
        return code;
    }

    private static JSONArray currencies(JSONObject trip) {
        JSONArray a = spend(trip).optJSONArray("currencies");
        return a == null ? new JSONArray() : a;
    }

    static JSONObject spend(JSONObject trip) {
        JSONObject s = trip == null ? null : trip.optJSONObject("spend");
        return s == null ? new JSONObject() : s;
    }
}
