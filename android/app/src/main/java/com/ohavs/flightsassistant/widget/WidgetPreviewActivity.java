package com.ohavs.flightsassistant.widget;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.FrameLayout;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * CI only (not exported; started with adb as root after `appwidget
 * grantbind`): hosts a widget like a launcher does, so the emulator run
 * can screenshot it (scripts/widget-shots.sh). Extras: provider (the
 * widget's class name, TripWidget when absent), snapshot64 (the snapshot
 * as base64 JSON, since adb cannot pass Hebrew and quotes; "none" for
 * signed out), nowMs (the clock to draw at), widthDp, heightDp.
 * Without the bind grant it just closes. Learned from Payments.
 */
public class WidgetPreviewActivity extends Activity {
    private static final int HOST_ID = 0x54524950;
    private AppWidgetHost host;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        String b64 = getIntent().getStringExtra("snapshot64");
        String json = b64 == null || "none".equals(b64) ? null
            : new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
        long now = getIntent().getLongExtra("nowMs", System.currentTimeMillis());
        int wDp = getIntent().getIntExtra("widthDp", 320), hDp = getIntent().getIntExtra("heightDp", 150);
        String name = getIntent().getStringExtra("provider");
        BaseWidget provider = WidgetKit.byName(name == null ? "TripWidget" : name);

        AppWidgetManager m = AppWidgetManager.getInstance(this);
        host = new AppWidgetHost(this, HOST_ID);
        // A force-stopped run left its record pointing at a dead listener;
        // an update sent there drops the new one. Start clean.
        host.deleteHost();
        int id = host.allocateAppWidgetId();
        if (!m.bindAppWidgetIdIfAllowed(id, new ComponentName(this, provider.getClass()))) {
            host.deleteAppWidgetId(id);
            finish();
            return;
        }
        // The moment under test, kept with this widget (BaseWidget.redraw):
        // the system redraws it right after binding, and must draw the same.
        Bundle opts = new Bundle();
        opts.putString(WidgetKit.OPT_PREVIEW, json == null ? "" : json);
        opts.putLong(WidgetKit.OPT_NOW, now);
        m.updateAppWidgetOptions(id, opts);
        AppWidgetProviderInfo info = m.getAppWidgetInfo(id);
        AppWidgetHostView view = host.createView(getApplicationContext(), id, info);
        // The host view keeps a default padding and takes it off the size it
        // reports (about 8dp a side), so 360x190 reached the widget as
        // 344x174. Add it back: the widget gets exactly the size under test,
        // as on a launcher.
        Rect pad = AppWidgetHostView.getDefaultPaddingForWidget(this, info.provider, null);
        float density = getResources().getDisplayMetrics().density;
        float padW = (pad.left + pad.right) / density, padH = (pad.top + pad.bottom) / density;
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#7FA4C9"));
        root.addView(view, new FrameLayout.LayoutParams(dp(wDp) + pad.left + pad.right, dp(hDp) + pad.top + pad.bottom, Gravity.CENTER));
        if (Build.VERSION.SDK_INT >= 31) {
            view.updateAppWidgetSize(opts, Collections.singletonList(new SizeF(wDp + padW, hDp + padH)));
        }
        android.util.Log.i("WidgetPreview", "content " + wDp + "x" + hDp + "dp, host padding " + padW + "x" + padH + "dp");
        setContentView(root);
        host.startListening();   // before the first render, so it is not missed
        provider.redraw(this, m, id);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (host != null) host.stopListening();
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
