package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The app's side of the widgets (src/lib/native/widget.js).
 *   save({ json }): the snapshot (src/lib/widgetData.js), or null when
 *     signed out; every widget redraws at once.
 *   status(): { count, pinSupported }, count of every kind.
 *   pin({ kind, tripId }): asks the launcher to add one (TripWidget unless
 *     kind names another, e.g. "PlanWidget"), of that trip (WidgetTrips),
 *     or of the next trip without one.
 *   "open" event: a tap on the widget, { tripId, tab }. A tap that started
 *     the app is kept until the app listens.
 *   auth({ uid, refreshToken, apiKey, projectId, name, photo } | {}): the
 *     sign-in the expense and reminders widgets save with (ExpenseStore);
 *     {} when signed out.
 *   pending(): { items: [{ id, tripId, uid, coll?, doc } | patch] }, what
 *     the widgets could not send; done({ ids }) once the app has written them.
 */
@CapacitorPlugin(name = "TripWidget")
public class TripWidgetPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String json = call.getString("json");
        WidgetKit.save(getContext(), json);
        WidgetKit.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("count", WidgetKit.count(getContext()));
        ret.put("pinSupported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && AppWidgetManager.getInstance(getContext()).isRequestPinAppWidgetSupported());
        call.resolve(ret);
    }

    @PluginMethod
    @android.annotation.SuppressLint("InlinedApi")
    public void pin(PluginCall call) {
        boolean asked = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager m = AppWidgetManager.getInstance(getContext());
            if (m.isRequestPinAppWidgetSupported()) {
                BaseWidget kind = WidgetKit.byName(call.getString("kind", "TripWidget"));
                // Asked from inside a trip: the widget is that trip's ("" or none: the next trip).
                String tripId = call.getString("tripId", "");
                WidgetTrips.pinning(getContext(), tripId);
                Intent placed = new Intent(getContext(), WidgetPinReceiver.class).putExtra("tripId", tripId);
                // Mutable: the launcher adds the new widget's id.
                PendingIntent cb = PendingIntent.getBroadcast(getContext(), 0, placed,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                asked = m.requestPinAppWidget(new ComponentName(getContext(), kind.getClass()), null, cb);
            }
        }
        JSObject ret = new JSObject();
        ret.put("asked", asked);
        call.resolve(ret);
    }

    @PluginMethod
    public void auth(PluginCall call) {
        JSObject a = call.getData();
        ExpenseStore.setAuth(getContext(), a.has("uid") ? a : null);
        call.resolve();
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("items", new JSArray(ExpenseStore.pending(getContext()).toString()));
        } catch (org.json.JSONException e) {
            ret.put("items", new JSArray());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void done(PluginCall call) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        JSArray a = call.getArray("ids", new JSArray());
        for (int i = 0; i < a.length(); i++) ids.add(a.optString(i));
        ExpenseStore.remove(getContext(), ids);
        call.resolve();
    }

    // BridgeActivity passes the launch intent here too, so a cold start from
    // the widget arrives the same way as a tap while the app is open.
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null || !WidgetKit.ACTION_OPEN.equals(intent.getAction())) return;
        JSObject data = new JSObject();
        data.put("tripId", intent.getStringExtra("tripId"));
        data.put("tab", intent.getStringExtra("tab"));
        // Handled once: the activity keeps its intent, and a recreated
        // activity must not open the trip again.
        intent.setAction(Intent.ACTION_MAIN);
        notifyListeners("open", data, true);
    }
}
