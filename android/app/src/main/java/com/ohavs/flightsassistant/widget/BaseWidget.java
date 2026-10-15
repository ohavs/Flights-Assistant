package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.Log;
import android.util.SizeF;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;
import java.util.Map;

/**
 * A home screen widget: it draws the snapshot (WidgetKit) at its own
 * moment and at every size the launcher shows it at. On Android 12 and up
 * the launcher gets one drawing per size and picks as the widget is
 * resized; before, the widget draws for the size it has. Signed out,
 * nothing ahead, or a snapshot it cannot read: a message instead.
 */
public abstract class BaseWidget extends AppWidgetProvider {

    /** The content for a widget of w×h dp; m has a trip. */
    abstract RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h);

    /** The same, for a widget that keeps something of its own by id (ExpenseWidget). */
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h, int id) {
        return content(ctx, m, w, h);
    }

    /** Its size (dp) until the launcher reports one: the target cells. */
    abstract float[] defaultSize();

    int[] ids(Context ctx) {
        return AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, getClass()));
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) redraw(ctx, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        redraw(ctx, m, id);
    }

    void redraw(Context ctx, AppWidgetManager m, int id) {
        Bundle o = m.getAppWidgetOptions(id);
        String json;
        long now;
        if (o != null && o.containsKey(WidgetKit.OPT_NOW)) {
            json = o.getString(WidgetKit.OPT_PREVIEW, "");
            if (json.isEmpty()) json = null;
            now = o.getLong(WidgetKit.OPT_NOW);
        } else {
            json = WidgetKit.snapshot(ctx);
            now = System.currentTimeMillis();
        }
        m.updateAppWidget(id, views(ctx, json, now, o, id));
    }

    RemoteViews views(Context ctx, String json, long now, Bundle o, int id) {
        WidgetKit.Moment mo;
        try {
            mo = WidgetKit.moment(json == null ? null : new JSONObject(json), now);
        } catch (Exception e) {
            Log.w("TripWidget", "bad snapshot", e);
            return WidgetKit.message(ctx, null, "פתחו את האפליקציה", "כדי לעדכן את הווידג׳ט", null, null);
        }
        if (mo.snapshot == null) {
            return WidgetKit.message(ctx, mo, "התחברו באפליקציה", "והטיול הבא יופיע כאן", null, null);
        }
        if (mo.trip == null) {
            return WidgetKit.message(ctx, mo, "אין טיול קרוב", "לחצו כדי לתכנן את הבא", null, null);
        }
        List<SizeF> sizes = WidgetKit.sizes(o);
        float[] d = defaultSize();
        if (sizes.isEmpty()) return safe(ctx, mo, d[0], d[1], id);
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> bySize = new ArrayMap<>();
            for (SizeF s : sizes) {
                // A little under the reported size, so it still fits if the
                // host measures a dp or two less.
                bySize.put(new SizeF(Math.max(1f, s.getWidth() - 2f), Math.max(1f, s.getHeight() - 2f)),
                    safe(ctx, mo, s.getWidth(), s.getHeight(), id));
            }
            return new RemoteViews(bySize);
        }
        // Portrait: the narrowest width and the tallest height.
        return safe(ctx, mo, sizes.get(0).getWidth(), sizes.get(0).getHeight(), id);
    }

    private RemoteViews safe(Context ctx, WidgetKit.Moment mo, float w, float h, int id) {
        try {
            return content(ctx, mo, w, h, id);
        } catch (RuntimeException e) {
            // Something it did not expect: say so quietly rather than show nothing.
            Log.w("TripWidget", "cannot draw " + getClass().getSimpleName(), e);
            return WidgetKit.message(ctx, mo, "פתחו את האפליקציה", "כדי לעדכן את הווידג׳ט", mo.tripId, null);
        }
    }
}
