package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

/**
 * Which trip a widget shows, asked when it is added from the home screen
 * (the widget's configure screen) or set again with a long press. A widget
 * the app asked for from inside a trip is that trip's already
 * (WidgetTrips.pendingPin), so this asks nothing. Backing out keeps the
 * widget, on the next trip.
 *
 * The expense widget's screen also sets its keypad's currencies: the trip's to
 * start with, and any removed or added from every currency the app knows
 * (ExpenseWidget.own); "שמירה" keeps the trip and the currencies.
 */
public class WidgetTripActivity extends AppCompatActivity {
    private int id;
    private int[] colors;   // accent, brand, card, tile, soft
    private LinearLayout rows;
    private final List<View> tripRows = new ArrayList<>();
    // The expense widget
    private String picked;                                  // the trip chosen here (null: the next one)
    private final List<String> codes = new ArrayList<>();   // its keypad's currencies, in order
    private List<String> defaults = new ArrayList<>();      // the chosen trip's
    private JSONArray catalog;
    private ChipFlow chosen, more;
    private TextView reset;

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

        rows = findViewById(R.id.rows);
        String current = WidgetTrips.get(this, id);
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
        if (info == null || !info.provider.getClassName().endsWith(".ExpenseWidget")) {
            addTrips(trips, current, this::choose);
            return;
        }

        // The expense widget: a trip, then the keypad's currencies, then "שמירה".
        ((TextView) findViewById(R.id.title)).setText("הגדרות הווידג׳ט");
        picked = current;
        rows.addView(label("טיול"));
        addTrips(trips, current, this::pick);
        rows.addView(label("מטבעות במקלדת"));
        rows.addView(hint("לחיצה על מטבע מסירה אותו"));
        chosen = flow();
        rows.addView(chosen);
        catalog = ExpenseWidget.catalog(s);
        more = flow();
        more.setVisibility(View.GONE);
        ChipFlow actions = flow();
        TextView add = chip("+ הוספת מטבע", v -> more.setVisibility(more.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        reset = chip("כמו בטיול", v -> {
            codes.clear();
            codes.addAll(defaults);
            paintCodes();
        });
        for (TextView t : new TextView[] { add, reset }) {
            t.setBackground(round(colors[4], dp(999)));
            t.setTextColor(colors[0]);
            actions.addView(t);
        }
        add.setVisibility(catalog.length() > 0 ? View.VISIBLE : View.GONE);
        rows.addView(actions);
        rows.addView(more);
        defaults = tripCodes();
        List<String> own = ExpenseWidget.own(this, id);
        codes.addAll(own != null ? own : defaults);
        paintCodes();

        TextView done = findViewById(R.id.done);
        done.setVisibility(View.VISIBLE);
        done.setBackground(round(colors[1], dp(18)));
        done.setOnClickListener(v -> {
            // The trip's own currencies are kept as "the trip's", to follow it.
            ExpenseWidget.setOwn(this, id, codes.equals(defaults) ? null : codes);
            choose(picked);
        });
    }

    /** "הטיול הבא" and each trip; tap: what choosing one does (null: the next trip). */
    private void addTrips(JSONArray trips, String current, Consumer<String> tap) {
        tripRows.add(row("הטיול הבא", "מתחלף לבד לטיול הקרוב", "", v -> tap.accept(null)));
        for (int i = 0; i < trips.length(); i++) {
            JSONObject t = trips.optJSONObject(i);
            if (t == null) continue;
            String tripId = t.optString("id");
            tripRows.add(row(t.optString("name"), dates(t), tripId, v -> tap.accept(tripId)));
        }
        for (View r : tripRows) rows.addView(r);
        paintTrips(current);
    }

    private void paintTrips(String current) {
        for (View r : tripRows) {
            boolean on = Objects.equals(r.getTag(), current == null ? "" : current);
            r.setBackground(round(on ? colors[4] : colors[3], dp(18)));
            ((TextView) ((LinearLayout) r).getChildAt(0)).setTextColor(on ? colors[0] : getColor(R.color.w_text));
            r.setSelected(on);
        }
    }

    /** The expense widget: a trip is chosen, and saved with the rest. Currencies left as the trip's follow it. */
    private void pick(String tripId) {
        boolean following = codes.equals(defaults);
        picked = tripId;
        paintTrips(tripId);
        defaults = tripCodes();
        if (following) {
            codes.clear();
            codes.addAll(defaults);
        }
        paintCodes();
    }

    /** The chosen trip's currencies, as its keypad has them unless set here. */
    private List<String> tripCodes() {
        WidgetKit.Moment m = WidgetKit.momentOf(this, id, picked);
        JSONArray a = m == null ? null : ExpenseWidget.tripCurrencies(m.trip);
        List<String> out = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject c = a.optJSONObject(i);
            if (c != null && !c.optString("code").isEmpty()) out.add(c.optString("code"));
        }
        if (out.isEmpty()) out.add("ILS");
        return out;
    }

    /** The keypad's currencies (a tap removes one, never the last), and the others to add. */
    private void paintCodes() {
        WidgetKit.Moment m = WidgetKit.momentOf(this, id, picked);
        chosen.removeAllViews();
        for (String code : codes) {
            String symbol = m == null ? code : ExpenseWidget.symbol(m, code);
            TextView t = chip((symbol.equals(code) ? code : code + " " + symbol) + "  ✕", v -> {
                if (codes.size() < 2) return;
                codes.remove(code);
                paintCodes();
            });
            t.setContentDescription("הסרת " + name(code));
            t.setBackground(round(colors[1], dp(999)));
            t.setTextColor(getColor(R.color.w_on_brand));
            chosen.addView(t);
        }
        more.removeAllViews();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject c = catalog.optJSONObject(i);
            String code = c == null ? "" : c.optString("code");
            if (code.isEmpty() || codes.contains(code)) continue;
            TextView t = chip("+ " + c.optString("name", code) + " · " + code, v -> {
                codes.add(code);
                paintCodes();
            });
            t.setBackground(round(colors[3], dp(999)));
            t.setTextColor(getColor(R.color.w_text));
            more.addView(t);
        }
        reset.setVisibility(codes.equals(defaults) ? View.GONE : View.VISIBLE);
    }

    private String name(String code) {
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject c = catalog.optJSONObject(i);
            if (c != null && code.equals(c.optString("code"))) return c.optString("name", code);
        }
        return code;
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

    /** tag: the trip's id, "" for the next trip. */
    private View row(String title, String sub, String tag, View.OnClickListener tap) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setTag(tag);
        int ph = Math.round(dp(18)), pv = Math.round(dp(14));
        l.setPadding(ph, pv, ph, pv);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(dp(8));
        l.setLayoutParams(lp);
        TextView a = new TextView(this);
        a.setText(title);
        a.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        a.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_extrabold));
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

    private TextView label(String text) {
        TextView t = hint(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        t.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_extrabold));
        t.setTextColor(getColor(R.color.w_text));
        ((LinearLayout.LayoutParams) t.getLayoutParams()).topMargin = Math.round(dp(18));
        return t;
    }

    private TextView hint(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_semibold));
        t.setTextColor(getColor(R.color.w_muted));
        t.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(dp(2));
        t.setLayoutParams(lp);
        return t;
    }

    private ChipFlow flow() {
        ChipFlow f = new ChipFlow(this, null);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Math.round(dp(10));
        f.setLayoutParams(lp);
        return f;
    }

    private TextView chip(String label, View.OnClickListener tap) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_semibold));
        t.setMaxLines(1);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setPadding(Math.round(dp(16)), Math.round(dp(9)), Math.round(dp(16)), Math.round(dp(9)));
        t.setOnClickListener(tap);
        return t;
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
