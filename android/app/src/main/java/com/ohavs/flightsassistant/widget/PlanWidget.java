package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Today's plan (4x3): the day's activities in time-of-day order, as many as
 * fit. Before the trip, its first day, with a countdown.
 */
public class PlanWidget extends BaseWidget {

    static final int[] ROWS = { R.id.plan_row_1, R.id.plan_row_2, R.id.plan_row_3, R.id.plan_row_4,
        R.id.plan_row_5, R.id.plan_row_6, R.id.plan_row_7, R.id.plan_row_8 };
    static final int[] TIMES = { R.id.plan_time_1, R.id.plan_time_2, R.id.plan_time_3, R.id.plan_time_4,
        R.id.plan_time_5, R.id.plan_time_6, R.id.plan_time_7, R.id.plan_time_8 };
    static final int[] RINGS = { R.id.plan_ring_1, R.id.plan_ring_2, R.id.plan_ring_3, R.id.plan_ring_4,
        R.id.plan_ring_5, R.id.plan_ring_6, R.id.plan_ring_7, R.id.plan_ring_8 };
    static final int[] TITLES = { R.id.plan_title_1, R.id.plan_title_2, R.id.plan_title_3, R.id.plan_title_4,
        R.id.plan_title_5, R.id.plan_title_6, R.id.plan_title_7, R.id.plan_title_8 };

    @Override
    float[] defaultSize() {
        return new float[] { 340f, 270f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_plan));
        String iso = m.during ? m.today : m.start;
        JSONObject day = m.day(iso);
        String name = day == null ? "" : day.optString("name");
        int n = WidgetKit.days(m.start, iso) + 1;
        String trip = m.trip.optString("name");
        if (m.during) {
            v.setTextViewText(R.id.title, "היום" + (name.isEmpty() ? "" : " · " + name));
            v.setTextViewText(R.id.subtitle, trip + " · יום " + n + " מתוך " + m.dayTotal);
            v.setTextViewText(R.id.chip, day == null ? "יום " + n : day.optString("when"));
        } else {
            v.setTextViewText(R.id.title, "יום 1" + (name.isEmpty() ? "" : " · " + name));
            v.setTextViewText(R.id.subtitle, trip + (day == null ? "" : " · " + day.optString("when")));
            int d = WidgetKit.days(m.today, m.start);
            v.setTextViewText(R.id.chip, d == 1 ? "מחר" : "בעוד " + d + " ימים");
        }
        WidgetKit.visible(v, R.id.chip, true);
        float list = h - 28f - 41f - 4f;
        rows(v, day, list, ROWS, TIMES, RINGS, TITLES, R.id.plan_more,
            m.during ? "אין פעילויות בתוכנית להיום" : "עוד אין תוכנית ליום הראשון");
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip).chip(TIMES));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "planning"));
        return v;
    }

    /**
     * A day's activities in rows: a time pill, or a ring when there is no
     * time, and the title; as many as fit in roomDp, then "ועוד N".
     */
    static void rows(RemoteViews v, JSONObject day, float roomDp, int[] rows, int[] times, int[] rings, int[] titles,
                     int more, String none) {
        JSONArray items = day == null ? null : day.optJSONArray("items");
        int count = items == null ? 0 : items.length();
        int total = count + (day == null ? 0 : day.optInt("more"));
        int shown = WidgetKit.shown(count, total, roomDp, rows.length);
        for (int i = 0; i < rows.length; i++) {
            JSONObject it = i < shown ? items.optJSONObject(i) : null;
            v.setViewVisibility(rows[i], it == null ? View.GONE : View.VISIBLE);
            if (it == null) continue;
            String time = it.optString("time");
            v.setTextViewText(times[i], time);
            WidgetKit.visible(v, times[i], !time.isEmpty());
            WidgetKit.visible(v, rings[i], time.isEmpty());
            v.setTextViewText(titles[i], it.optString("title"));
        }
        int rest = total - shown;
        v.setTextViewText(more, count == 0 ? none : rest == 1 ? "ועוד פעילות אחת" : "ועוד " + rest + " פעילויות");
        WidgetKit.visible(v, more, count == 0 || rest > 0);
    }
}
