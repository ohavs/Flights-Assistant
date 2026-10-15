package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The countdown (2x2): one big number. Before the trip, or within a day of
 * a flight, how long until that flight; during the trip, which day it is.
 * The trip widget draws this too when it is narrow.
 */
public class CountdownWidget extends BaseWidget {

    @Override
    float[] defaultSize() {
        return new float[] { 170f, 180f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        return draw(ctx, m);
    }

    static RemoteViews draw(Context ctx, WidgetKit.Moment m) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_big));
        String tab;
        if (m.flightFirst()) {
            tab = "flight";
            JSONObject f = m.next;
            v.setImageViewResource(R.id.icon, m.drawable(R.drawable.ic_ws_plane));
            v.setTextViewText(R.id.chip, WidgetKit.legName(f));
            String[] n = WidgetKit.countdownBig(f, m.today, m.now);
            v.setTextViewText(R.id.big, WidgetKit.big("", n[0], n[1]));
            String route = f.optString("route"), when = f.optString("when");
            v.setTextViewText(R.id.caption, route.isEmpty() ? when : route + "\n" + when);
        } else if (m.during) {
            tab = "planning";
            v.setImageViewResource(R.id.icon, m.drawable(R.drawable.ic_ws_map));
            v.setTextViewText(R.id.chip, m.dayN == m.dayTotal ? "יום אחרון" : "בטיול");
            v.setTextViewText(R.id.big, WidgetKit.big("יום", String.valueOf(m.dayN), "מתוך " + m.dayTotal));
            JSONObject day = m.day(m.today);
            JSONArray items = day == null ? null : day.optJSONArray("items");
            JSONObject first = items == null ? null : items.optJSONObject(0);
            String line = first == null ? "" : first.optString("title");
            if (first != null && !first.optString("time").isEmpty()) line = first.optString("time") + " · " + line;
            v.setTextViewText(R.id.caption, line.isEmpty() ? m.trip.optString("name") : line);
        } else {
            // A trip ahead with no flight on it: until its first day.
            tab = "planning";
            v.setImageViewResource(R.id.icon, m.drawable(R.drawable.ic_ws_map));
            v.setTextViewText(R.id.chip, "עד הטיול");
            int d = WidgetKit.days(m.today, m.start);
            v.setTextViewText(R.id.big, d == 1 ? WidgetKit.big("", "מחר", "") : WidgetKit.big("", String.valueOf(d), "ימים"));
            v.setTextViewText(R.id.caption, m.trip.optString("name"));
        }
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, tab));
        return v;
    }
}
