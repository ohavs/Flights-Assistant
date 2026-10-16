package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.res.ResourcesCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Which trip a widget shows, asked when it is added from the home screen
 * (the widget's configure screen) or set again with a long press. A widget
 * the app asked for from inside a trip is that trip's already
 * (WidgetTrips.pendingPin), so this asks nothing. Backing out keeps the
 * widget, on the next trip.
 */
public class WidgetTripActivity extends AppCompatActivity {
    private int id;
    private int[] colors;

    @Override
    protected void onCreate(Bundle saved) {
        id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        JSONObject s = WidgetKit.snapshotOf(this, id);
        String theme = s == null ? "system" : s.optString("theme", "system");
        if ("dark".equals(theme) || "light".equals(theme)) {
            getDelegate().setLocalNightMode("dark".equals(theme) ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
        }
        super.onCreate(saved);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
        String pinned = WidgetTrips.pendingPin(this);
        JSONArray trips = s == null ? null : s.optJSONArray("trips");
        if (pinned != null || trips == null || trips.length() == 0) {
            choose(pinned == null || pinned.isEmpty() ? null : pinned);
            return;
        }
        boolean dark = "dark".equals(theme) || (!"light".equals(theme)
            && (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES);
        colors = WidgetKit.colors(s.optString("palette", "green"))[dark ? 1 : 0];

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.trip_picker);
        View sheet = findViewById(R.id.sheet);
        findViewById(R.id.scrim).setOnClickListener(v -> finish());
        int bottom = sheet.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(sheet, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), bottom + bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        float r = dp(28);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(colors[2]);
        bg.setCornerRadii(new float[] { r, r, r, r, 0, 0, 0, 0 });
        sheet.setBackground(bg);
        findViewById(R.id.handle).setBackground(round(colors[3], dp(3)));

        LinearLayout rows = findViewById(R.id.rows);
        String current = WidgetTrips.get(this, id);
        rows.addView(row("הטיול הבא", "מתחלף לבד לטיול הקרוב", current == null, v -> choose(null)));
        for (int i = 0; i < trips.length(); i++) {
            JSONObject t = trips.optJSONObject(i);
            if (t == null) continue;
            String tripId = t.optString("id");
            rows.addView(row(t.optString("name"), dates(t), tripId.equals(current), v -> choose(tripId)));
        }
    }

    /** Sets the widget to the trip (null: the next one), draws it, and is done. */
    private void choose(String tripId) {
        WidgetTrips.set(this, id, tripId);
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        AppWidgetProviderInfo info = m.getAppWidgetInfo(id);
        if (info != null) WidgetKit.byName(info.provider.getShortClassName().replaceAll(".*\\.", "")).redraw(this, m, id);
        finish();
    }

    /** "3.11–6.11". */
    private static String dates(JSONObject t) {
        return dm(t.optString("start")) + "–" + dm(t.optString("end"));
    }

    private static String dm(String iso) {
        if (iso.length() < 10) return "";
        return Integer.parseInt(iso.substring(8, 10)) + "." + Integer.parseInt(iso.substring(5, 7));
    }

    private View row(String title, String sub, boolean on, View.OnClickListener tap) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        int ph = Math.round(dp(18)), pv = Math.round(dp(14));
        l.setPadding(ph, pv, ph, pv);
        l.setBackground(round(on ? colors[4] : colors[3], dp(18)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(dp(8));
        l.setLayoutParams(lp);
        TextView a = new TextView(this);
        a.setText(title);
        a.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        a.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_extrabold));
        a.setTextColor(on ? colors[0] : getColor(R.color.w_text));
        a.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        TextView b = new TextView(this);
        b.setText(sub);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        b.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_semibold));
        b.setTextColor(getColor(R.color.w_muted));
        b.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        l.addView(a);
        l.addView(b);
        l.setOnClickListener(tap);
        l.setContentDescription(title);
        return l;
    }

    private float dp(float v) {
        return v * getResources().getDisplayMetrics().density;
    }

    private static GradientDrawable round(int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radius);
        return d;
    }
}
