package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONObject;

/**
 * Today's plan (4x3): the day's activities in time-of-day order, in a list
 * that scrolls (ListWidgetService), each with a box to tick its place as
 * visited. Before the trip, its first day, with a countdown. A new day
 * comes in at midnight (WidgetClock).
 */
public class PlanWidget extends BaseWidget {

    @Override
    float[] defaultSize() {
        return new float[] { 340f, 270f };
    }

    @Override
    boolean hasList() {
        return true;
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        return content(ctx, m, w, h, AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_plan));
        String iso = WidgetLists.planDay(m);
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
        v.setRemoteAdapter(R.id.list, ListWidgetService.intent(ctx, id, ListWidgetService.PLAN));
        v.setPendingIntentTemplate(R.id.list, WidgetActionActivity.template(ctx, id));
        v.setEmptyView(R.id.list, R.id.empty);
        v.setTextViewText(R.id.empty, m.during ? "אין פעילויות בתוכנית להיום" : "עוד אין תוכנית ליום הראשון");
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "planning"));
        return v;
    }
}
