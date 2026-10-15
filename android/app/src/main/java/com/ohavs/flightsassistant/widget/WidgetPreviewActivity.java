package com.ohavs.flightsassistant.widget;

import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.graphics.Color;
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
 * grantbind`): hosts the widget like a launcher does, so the emulator run
 * can screenshot it (scripts/widget-shots.sh). Extras: snapshot64 (the
 * snapshot as base64 JSON, since adb cannot pass Hebrew and quotes; "none"
 * for signed out), nowMs (the clock to draw at), widthDp, heightDp.
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

        AppWidgetManager m = AppWidgetManager.getInstance(this);
        host = new AppWidgetHost(this, HOST_ID);
        // A force-stopped run left its record pointing at a dead listener;
        // an update sent there drops the new one. Start clean.
        host.deleteHost();
        int id = host.allocateAppWidgetId();
        if (!m.bindAppWidgetIdIfAllowed(id, new ComponentName(this, TripWidget.class))) {
            host.deleteAppWidgetId(id);
            finish();
            return;
        }
        AppWidgetProviderInfo info = m.getAppWidgetInfo(id);
        AppWidgetHostView view = host.createView(getApplicationContext(), id, info);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#7FA4C9"));
        root.addView(view, new FrameLayout.LayoutParams(dp(wDp), dp(hDp), Gravity.CENTER));
        if (Build.VERSION.SDK_INT >= 31) {
            view.updateAppWidgetSize(new Bundle(), Collections.singletonList(new SizeF(wDp, hDp)));
        }
        setContentView(root);
        host.startListening();   // before the first render, so it is not missed
        TripWidget.render(this, m, id, json, now);
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
