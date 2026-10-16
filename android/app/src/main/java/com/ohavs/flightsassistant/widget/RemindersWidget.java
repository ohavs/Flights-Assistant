package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

/**
 * Open reminders (4x2 and up), the soonest first, in a list that scrolls
 * (ListWidgetService), each with a box to tick it done.
 */
public class RemindersWidget extends BaseWidget {

    @Override
    float[] defaultSize() {
        return new float[] { 340f, 180f };
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
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_reminders));
        int open = WidgetLists.openReminders(ctx, m);
        v.setTextViewText(R.id.title, "תזכורות");
        v.setTextViewText(R.id.subtitle, m.trip.optString("name"));
        v.setTextViewText(R.id.chip, open == 1 ? "פתוחה אחת" : open + " פתוחות");
        WidgetKit.visible(v, R.id.chip, open > 0);
        v.setRemoteAdapter(R.id.list, ListWidgetService.intent(ctx, id, ListWidgetService.REMINDERS));
        v.setPendingIntentTemplate(R.id.list, WidgetActionActivity.template(ctx, id));
        v.setEmptyView(R.id.list, R.id.empty);
        v.setTextViewText(R.id.empty, "אין תזכורות פתוחות");
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "checklist"));
        return v;
    }
}
