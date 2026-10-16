package com.ohavs.flightsassistant.widget;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;

import org.json.JSONObject;

/**
 * A tap on a widget list's row (ListWidgetService), with nothing on screen:
 * a tick on its box, or the app opened where the row points. Every row of
 * a list shares one PendingIntent, and only an activity may open the app
 * from the home screen on every Android, so both go through here.
 */
public class WidgetActionActivity extends Activity {

    /** The list's shared PendingIntent; each row adds its own extras. */
    @android.annotation.SuppressLint("InlinedApi")
    static PendingIntent template(Context ctx, int id) {
        Intent i = new Intent(ctx, WidgetActionActivity.class)
            .setData(Uri.parse("widgetaction://" + id))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        // Mutable: each row fills in its own extras (ignored before Android 12).
        return PendingIntent.getActivity(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Intent i = getIntent();
        if ("tick".equals(i.getStringExtra("action"))) {
            tick(i);
        } else {
            startActivity(WidgetKit.openIntent(this, i.getStringExtra("tripId"), i.getStringExtra("tab")));
        }
        finish();
    }

    private void tick(Intent i) {
        int id = i.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        String path = i.getStringExtra("path"), field = i.getStringExtra("field");
        if (path == null || field == null) return;
        boolean value = i.getBooleanExtra("value", true);
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        WidgetKit.Moment mo = WidgetKit.momentOf(this, m.getAppWidgetOptions(id));
        long savedAt = mo == null || mo.snapshot == null ? 0 : mo.snapshot.optLong("savedAt");
        WidgetLists.tick(this, path, field, value, savedAt);
        try {
            String uid = ExpenseStore.uid(this);
            JSONObject e = ExpenseStore.patch(uid == null ? "" : uid, path, field, value, System.currentTimeMillis());
            ExpenseStore.queue(getApplicationContext(), e);
            Log.i("ExpenseWidget", "tick queued: " + path + " " + field + "=" + value);
        } catch (Exception x) {
            Log.w("ExpenseWidget", "cannot queue a tick", x);
        }
        // The list and its header (the count of open reminders) at once.
        BaseWidget w = ListWidgetService.REMINDERS.equals(i.getStringExtra("kind")) ? new RemindersWidget() : new PlanWidget();
        w.redraw(this, m, id);
    }
}
