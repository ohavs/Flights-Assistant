package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The app's side of the widget (src/lib/native/widget.js).
 *   save({ json }): the snapshot (src/lib/widgetData.js), or null when
 *     signed out; every widget redraws at once.
 *   status(): { count, pinSupported }. pin(): asks the launcher to add one.
 *   "open" event: a tap on the widget, { tripId, tab }. A tap that started
 *     the app is kept until the app listens.
 */
@CapacitorPlugin(name = "TripWidget")
public class TripWidgetPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String json = call.getString("json");
        TripWidget.save(getContext(), json);
        TripWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("count", TripWidget.ids(getContext()).length);
        ret.put("pinSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported());
        call.resolve(ret);
    }

    @PluginMethod
    public void pin(PluginCall call) {
        boolean asked = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager m = AppWidgetManager.getInstance(getContext());
            if (m.isRequestPinAppWidgetSupported()) {
                asked = m.requestPinAppWidget(new ComponentName(getContext(), TripWidget.class), null, null);
            }
        }
        JSObject ret = new JSObject();
        ret.put("asked", asked);
        call.resolve(ret);
    }

    // BridgeActivity passes the launch intent here too, so a cold start from
    // the widget arrives the same way as a tap while the app is open.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !TripWidget.ACTION_OPEN.equals(intent.getAction())) return;
        JSObject data = new JSObject();
        data.put("tripId", intent.getStringExtra("tripId"));
        data.put("tab", intent.getStringExtra("tab"));
        // Handled once: the activity keeps its intent, and a recreated
        // activity must not open the trip again.
        intent.setAction(Intent.ACTION_MAIN);
        notifyListeners("open", data, true);
    }
}
