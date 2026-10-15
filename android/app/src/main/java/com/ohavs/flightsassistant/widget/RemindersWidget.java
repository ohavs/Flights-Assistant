package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

/** Open reminders (4x2): the trip's, the soonest first, each with its time when it has one. */
public class RemindersWidget extends BaseWidget {

    static final int[] ROWS = { R.id.rem_row_1, R.id.rem_row_2, R.id.rem_row_3, R.id.rem_row_4, R.id.rem_row_5 };
    static final int[] TIMES = { R.id.rem_time_1, R.id.rem_time_2, R.id.rem_time_3, R.id.rem_time_4, R.id.rem_time_5 };
    static final int[] TITLES = { R.id.rem_title_1, R.id.rem_title_2, R.id.rem_title_3, R.id.rem_title_4, R.id.rem_title_5 };

    @Override
    float[] defaultSize() {
        return new float[] { 340f, 180f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_reminders));
        JSONObject rem = m.trip.optJSONObject("reminders");
        int open = rem == null ? 0 : rem.optInt("open");
        JSONArray items = rem == null ? null : rem.optJSONArray("items");
        int count = items == null ? 0 : items.length();

        v.setTextViewText(R.id.title, "תזכורות");
        v.setTextViewText(R.id.subtitle, m.trip.optString("name"));
        v.setTextViewText(R.id.chip, open == 1 ? "פתוחה אחת" : open + " פתוחות");
        WidgetKit.visible(v, R.id.chip, open > 0);

        int shown = WidgetKit.shown(count, Math.max(open, count), h - 28f - 41f - 4f, ROWS.length);
        for (int i = 0; i < ROWS.length; i++) {
            JSONObject it = i < shown ? items.optJSONObject(i) : null;
            v.setViewVisibility(ROWS[i], it == null ? View.GONE : View.VISIBLE);
            if (it == null) continue;
            v.setTextViewText(TITLES[i], it.optString("text"));
            boolean timed = !it.isNull("at") && it.optLong("at") > 0;
            v.setTextViewText(TIMES[i], timed ? WidgetKit.clock(it.optLong("at"), m.now) : "");
            WidgetKit.visible(v, TIMES[i], timed);
        }
        int rest = Math.max(open, count) - shown;
        v.setTextViewText(R.id.rem_more, count == 0 ? "אין תזכורות פתוחות" : rest == 1 ? "ועוד תזכורת אחת" : "ועוד " + rest + " תזכורות");
        WidgetKit.visible(v, R.id.rem_more, count == 0 || rest > 0);

        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip).chip(TIMES));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "checklist"));
        return v;
    }
}
