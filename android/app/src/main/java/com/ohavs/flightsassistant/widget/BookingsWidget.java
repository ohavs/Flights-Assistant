package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

/**
 * The trip's bookings ahead (4x2 and up), the soonest first and those with
 * no date last, in a list that scrolls (ListWidgetService): each with its
 * date as a leaf, the time and the confirmation code. A tap opens the
 * trip's bookings.
 */
public class BookingsWidget extends BaseWidget {

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
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_bookings));
        int n = WidgetLists.bookings(m).size();
        v.setTextViewText(R.id.title, "הזמנות");
        v.setTextViewText(R.id.subtitle, m.trip.optString("name"));
        v.setTextViewText(R.id.chip, n == 1 ? "אחת קרובה" : n + " קרובות");
        WidgetKit.visible(v, R.id.chip, n > 0);
        v.setRemoteAdapter(R.id.list, ListWidgetService.intent(ctx, id, ListWidgetService.BOOKINGS));
        v.setPendingIntentTemplate(R.id.list, WidgetActionActivity.template(ctx, id));
        v.setEmptyView(R.id.list, R.id.empty);
        v.setTextViewText(R.id.empty, "אין הזמנות קרובות");
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "bookings"));
        return v;
    }
}
