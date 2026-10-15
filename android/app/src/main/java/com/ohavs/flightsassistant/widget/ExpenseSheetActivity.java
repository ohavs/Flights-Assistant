package com.ohavs.flightsassistant.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.res.ResourcesCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.ohavs.flightsassistant.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * The expense widget's second step, over the home screen: the amount typed
 * on the widget, a category, a place from today's plan or one typed in,
 * and save. It writes through ExpenseStore and tells the widget how it
 * went; the app does not open.
 */
public class ExpenseSheetActivity extends AppCompatActivity {

    /** "המשך" on widget id: an activity, so it opens from the home screen on every Android. */
    static PendingIntent open(Context ctx, int id) {
        Intent i = new Intent(ctx, ExpenseSheetActivity.class)
            .setData(Uri.parse("expensewidget://sheet/" + id))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private int widgetId;
    private JSONObject trip;
    private double amount;
    private String currency, symbol;
    private Double ils;
    private String category, placeId, placeName;
    private boolean saving;
    private int[] colors;   // accent, brand, card, tile, soft
    private ChipFlow categories, places;
    private EditText custom;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        WidgetKit.Moment m = WidgetKit.momentOf(this, AppWidgetManager.getInstance(this).getAppWidgetOptions(widgetId));
        SharedPreferences p = ExpenseWidget.prefs(this);
        String typed = p.getString("amount_" + widgetId, "");
        amount = ExpenseWidget.value(typed);
        if (m == null || m.trip == null || amount <= 0) {
            finish();
            return;
        }
        trip = m.trip;
        JSONObject cur = ExpenseWidget.currency(trip, p.getString("cur_" + widgetId, null));
        currency = cur.optString("code", "ILS");
        symbol = cur.optString("symbol", currency);
        ils = shekels(m.snapshot.optJSONObject("rates"), amount, currency);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        colors = WidgetKit.colors(m.palette)[dark ? 1 : 0];

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.expense_sheet);
        View scrim = findViewById(R.id.scrim), sheet = findViewById(R.id.sheet);
        scrim.setOnClickListener(v -> { if (!saving) finish(); });
        // Edge to edge: the sheet sits above the navigation bar, and above the keyboard.
        int bottom = sheet.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(sheet, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), bottom + bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        float r = dp(28);
        sheet.setBackground(shape(colors[2], new float[] { r, r, r, r, 0, 0, 0, 0 }));
        findViewById(R.id.handle).setBackground(round(colors[3], dp(3)));
        findViewById(R.id.icon_tile).setBackground(round(colors[4], dp(16)));
        ((TextView) findViewById(R.id.amount)).setText(String.format(Locale.US, "%s %s", typed, symbol));
        String sub = trip.optString("name");
        if (ils != null) sub = String.format(Locale.US, "≈ %,.2f ₪ · %s", ils, sub);
        ((TextView) findViewById(R.id.trip)).setText(sub);

        categories = findViewById(R.id.categories);
        JSONArray cats = ExpenseWidget.spend(trip).optJSONArray("categories");
        for (int i = 0; cats != null && i < cats.length(); i++) {
            String c = cats.optString(i);
            if (c.isEmpty()) continue;
            categories.addView(chip(c, v -> {
                category = c.equals(category) ? null : c;
                paint(categories, category);
            }));
        }
        paint(categories, null);

        places = findViewById(R.id.places);
        custom = findViewById(R.id.custom_place);
        custom.setBackground(round(colors[3], dp(16)));
        JSONObject day = m.day(m.today);
        JSONArray items = day == null ? null : day.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || it.optString("title").isEmpty()) continue;
            String title = it.optString("title"), id = it.optString("placeId");
            places.addView(chip(title, v -> {
                boolean off = title.equals(placeName);
                placeName = off ? null : title;
                placeId = off || id.isEmpty() ? null : id;
                if (!off) custom.setText("");
                paint(places, placeName);
            }));
        }
        places.setVisibility(places.getChildCount() == 0 ? View.GONE : View.VISIBLE);
        if (places.getChildCount() == 0) custom.setHint("איפה? (לא חובה)");
        custom.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable s) {
                if (s.length() > 0 && placeName != null) { placeName = null; placeId = null; paint(places, null); }
            }
        });
        custom.setOnEditorActionListener((v, action, e) -> {
            if (action == EditorInfo.IME_ACTION_DONE) { v.clearFocus(); hideKeyboard(v); return true; }
            return false;
        });

        TextView save = findViewById(R.id.save);
        save.setBackground(round(colors[1], dp(18)));
        save.setOnClickListener(v -> save(save));
    }

    private void save(TextView button) {
        if (saving) return;
        String uid = ExpenseStore.uid(this);
        String typedPlace = custom.getText().toString().trim();
        JSONObject e;
        try {
            e = ExpenseStore.expense(uid == null ? "" : uid, trip.optString("id"), amount, currency, category,
                placeId, placeId != null ? null : (typedPlace.isEmpty() ? placeName : typedPlace), ils,
                System.currentTimeMillis());
        } catch (Exception x) {
            Log.w("ExpenseWidget", "cannot build", x);
            return;
        }
        saving = true;
        button.setText("שומר…");
        findViewById(R.id.error).setVisibility(View.GONE);
        Context app = getApplicationContext();
        String what = String.format(Locale.US, "%s %s", trimmed(amount), symbol)
            + " · " + (category == null ? "כללי" : category);
        new Thread(() -> {
            ExpenseStore.Result r = ExpenseStore.save(app, e);
            Log.i("ExpenseWidget", "save: " + r);
            runOnUiThread(() -> done(r, what, button));
        }, "expense-save").start();
    }

    private void done(ExpenseStore.Result r, String what, TextView button) {
        switch (r) {
            case SAVED:
                ExpenseWidget.saved(this, widgetId, "נשמר ✓ " + what);
                break;
            case OFFLINE:
                ExpenseWidget.saved(this, widgetId, "אין חיבור · יישמר כשיחזור ✓");
                break;
            case SIGNED_OUT:
                ExpenseWidget.saved(this, widgetId, "יישמר כשתפתחו את האפליקציה ✓");
                break;
            default:
                saving = false;
                button.setText("שמירה");
                TextView err = findViewById(R.id.error);
                err.setText("לא נשמר: אין הרשאה להוסיף הוצאות לטיול הזה");
                err.setVisibility(View.VISIBLE);
                return;
        }
        finish();
    }

    // ── Chips ────────────────────────────────────────────────────────────

    private TextView chip(String label, View.OnClickListener tap) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTag(label);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(ResourcesCompat.getFont(this, R.font.rubik_semibold));
        t.setMaxLines(1);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setMaxWidth(Math.round(dp(220)));
        t.setPadding(Math.round(dp(16)), Math.round(dp(9)), Math.round(dp(16)), Math.round(dp(9)));
        t.setOnClickListener(tap);
        return t;
    }

    /** The picked chip on the brand, the others on the tile colour. */
    private void paint(ChipFlow flow, String picked) {
        for (int i = 0; i < flow.getChildCount(); i++) {
            TextView t = (TextView) flow.getChildAt(i);
            boolean on = t.getTag().equals(picked);
            t.setBackground(round(on ? colors[1] : colors[3], dp(999)));
            t.setTextColor(getColor(on ? R.color.w_on_brand : R.color.w_text));
            t.setSelected(on);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** The amount in shekels at the rates the app saved (per euro), or null. */
    static Double shekels(JSONObject rates, double amount, String code) {
        if ("ILS".equals(code) || rates == null) return null;
        double from = rates.optDouble(code, 0), to = rates.optDouble("ILS", 0);
        if (from <= 0 || to <= 0) return null;
        return Math.round(amount * to / from * 100) / 100.0;
    }

    private static String trimmed(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.format(Locale.US, "%.2f", v).replaceAll("0$", "");
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

    private static GradientDrawable shape(int color, float[] radii) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadii(radii);
        return d;
    }

    private void hideKeyboard(View v) {
        android.view.inputmethod.InputMethodManager imm =
            (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
    }
}
