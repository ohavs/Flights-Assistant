package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The launcher placed a widget the app asked for (TripWidgetPlugin.pin): it is that trip's. */
public class WidgetPinReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        WidgetTrips.set(ctx, id, intent.getStringExtra("tripId"));
        WidgetTrips.pendingPin(ctx);   // used: a configure screen after this asks nothing
        WidgetKit.refreshAll(ctx);
    }
}
