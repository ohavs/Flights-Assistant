package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.view.Gravity;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONObject;

/**
 * The trip widget (4x2): before the trip, or within a day of a flight,
 * that flight with its airports big and a countdown; during the trip,
 * today's plan; always two tiles, packing and reminders. Narrow (2 cells)
 * it is the big countdown (CountdownWidget). It grows with its size: the
 * airports fill the room, the plan shows as many rows as fit.
 */
public class TripWidget extends BaseWidget {

    static final int[] ROWS = { R.id.plan_row_1, R.id.plan_row_2, R.id.plan_row_3, R.id.plan_row_4, R.id.plan_row_5, R.id.plan_row_6 };
    static final int[] TIMES = { R.id.plan_time_1, R.id.plan_time_2, R.id.plan_time_3, R.id.plan_time_4, R.id.plan_time_5, R.id.plan_time_6 };
    static final int[] RINGS = { R.id.plan_ring_1, R.id.plan_ring_2, R.id.plan_ring_3, R.id.plan_ring_4, R.id.plan_ring_5, R.id.plan_ring_6 };
    static final int[] TITLES = { R.id.plan_title_1, R.id.plan_title_2, R.id.plan_title_3, R.id.plan_title_4, R.id.plan_title_5, R.id.plan_title_6 };

    @Override
    float[] defaultSize() {
        return new float[] { 340f, 180f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        if (w < 220f) return CountdownWidget.draw(ctx, m);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_trip));

        // Three heights: roomy (Samsung's 4x2 and up) has the icon, and in
        // each tile a second line (the bar, the next reminder) unless the
        // plan needs the room; short drops those; very short also the line
        // under the title and the flight's day.
        boolean roomy = h >= 180f, short_ = h < 140f;
        boolean full = roomy && (m.flightFirst() || h >= 250f);
        float padTop = roomy ? 14f : short_ ? 10f : 12f;
        WidgetKit.pad(ctx, v, R.id.root, 16f, padTop);
        WidgetKit.visible(v, R.id.icon_tile, roomy);
        WidgetKit.visible(v, R.id.subtitle, !short_);
        WidgetKit.visible(v, R.id.packed_bar, full);
        WidgetKit.visible(v, R.id.rem_next, full);
        float tilePad = full ? 10f : 7f;
        WidgetKit.pad(ctx, v, R.id.packed, 12f, tilePad);
        WidgetKit.pad(ctx, v, R.id.rem, 12f, tilePad);
        // The room left for the flight or the plan (dp).
        float header = short_ ? 22f : 41f;
        float tiles = 10f + 2 * tilePad + 20f + (full ? 18f : 0f);
        float body = h - 2 * padTop - header - 4f - tiles;

        v.setTextViewText(R.id.title, m.trip.optString("name"));
        String tab;
        if (m.flightFirst()) {
            tab = "flight";
            flight(v, m, short_);
        } else {
            tab = "planning";
            plan(v, m, body);
        }
        bottom(v, m.trip);

        WidgetKit.Paint p = new WidgetKit.Paint().card(R.id.root).tile(R.id.packed, R.id.rem)
            .soft(R.id.icon_tile).chip(R.id.chip).chip(TIMES).bar(R.id.packed_bar);
        WidgetKit.theme(ctx, v, m, p);
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, tab));
        v.setOnClickPendingIntent(R.id.packed, WidgetKit.open(ctx, m.tripId, "checklist"));
        v.setOnClickPendingIntent(R.id.rem, WidgetKit.open(ctx, m.tripId, "checklist"));
        return v;
    }

    private static void flight(RemoteViews v, WidgetKit.Moment m, boolean short_) {
        JSONObject f = m.next;
        WidgetKit.visible(v, R.id.flight_block, true);
        WidgetKit.visible(v, R.id.plan_block, false);
        v.setImageViewResource(R.id.icon, m.drawable(R.drawable.ic_ws_plane));
        v.setTextViewText(R.id.subtitle, f.optString("title"));
        v.setTextViewText(R.id.chip, WidgetKit.countdown(f, m.today, m.now));
        String from = f.optString("from"), to = f.optString("to");
        boolean codes = !from.isEmpty() || !to.isEmpty();
        // No airports yet: the leg's name in their place.
        v.setTextViewText(R.id.from, codes ? (from.isEmpty() ? "—" : from) : WidgetKit.legName(f));
        v.setTextViewText(R.id.to, to.isEmpty() ? "—" : to);
        v.setInt(R.id.from, "setGravity", (codes ? Gravity.LEFT : Gravity.RIGHT) | Gravity.CENTER_VERTICAL);
        WidgetKit.visible(v, R.id.route_line, codes);
        WidgetKit.visible(v, R.id.to, codes);
        v.setTextViewText(R.id.when, f.optString("when"));
        WidgetKit.visible(v, R.id.when, !short_ && !f.optString("when").isEmpty());
    }

    private static void plan(RemoteViews v, WidgetKit.Moment m, float body) {
        WidgetKit.visible(v, R.id.flight_block, false);
        WidgetKit.visible(v, R.id.plan_block, true);
        v.setImageViewResource(R.id.icon, m.drawable(R.drawable.ic_ws_map));
        JSONObject day = m.day(m.today);
        String name = day == null ? "" : day.optString("name");
        v.setTextViewText(R.id.subtitle, "היום" + (name.isEmpty() ? "" : " · " + name));
        v.setTextViewText(R.id.chip, "יום " + m.dayN + " מתוך " + m.dayTotal);
        PlanWidget.rows(v, day, body, ROWS, TIMES, RINGS, TITLES, R.id.plan_more, "אין פעילויות בתוכנית להיום");
    }

    private static void bottom(RemoteViews v, JSONObject trip) {
        JSONObject packed = trip.optJSONObject("packed");
        int done = packed == null ? 0 : packed.optInt("done"), all = packed == null ? 0 : packed.optInt("total");
        v.setTextViewText(R.id.packed_value, done + "/" + all);
        WidgetKit.visible(v, R.id.packed_value, all > 0);
        v.setTextViewText(R.id.packed_label, all == 0 ? "הרשימה ריקה" : "נארזו");
        v.setProgressBar(R.id.packed_bar, 100, all == 0 ? 0 : Math.round(100f * done / all), false);

        JSONObject rem = trip.optJSONObject("reminders");
        int open = rem == null ? 0 : rem.optInt("open");
        v.setTextViewText(R.id.rem_value, String.valueOf(open));
        WidgetKit.visible(v, R.id.rem_value, open > 0);
        v.setTextViewText(R.id.rem_label, open == 0 ? "אין תזכורות" : open == 1 ? "תזכורת" : "תזכורות");
        String next = rem == null ? "" : rem.optString("next");
        v.setTextViewText(R.id.rem_next, open == 0 ? "הכל בוצע" : next);
    }
}
