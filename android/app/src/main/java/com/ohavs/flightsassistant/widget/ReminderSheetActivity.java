package com.ohavs.flightsassistant.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.ohavs.flightsassistant.R;

import org.json.JSONObject;

/**
 * "+" on the reminders widget: over the home screen, the reminder's text,
 * and save. It writes through ExpenseStore as the checklist tab writes a
 * reminder, and the widget's list shows it at once (WidgetLists.added);
 * the app does not open. A time for it is set in the app.
 */
public class ReminderSheetActivity extends AppCompatActivity {
    static PendingIntent open(Context ctx, int id) {
        Intent i = new Intent(ctx, ReminderSheetActivity.class)
            .setData(Uri.parse("reminderwidget://sheet/" + id))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private int widgetId;
    private JSONObject trip;
    private long savedAt;
    private boolean saving;

    @Override
    protected void onCreate(Bundle saved) {
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        WidgetKit.Moment m = WidgetKit.momentOf(this, widgetId);
        if (m != null && m.forced()) {
            getDelegate().setLocalNightMode(m.dark(this) ? AppCompatDelegate.MODE_NIGHT_YES : AppCompatDelegate.MODE_NIGHT_NO);
        }
        super.onCreate(saved);
        if (m == null || m.trip == null) {
            finish();
            return;
        }
        trip = m.trip;
        savedAt = m.snapshot.optLong("savedAt");
        int[] colors = WidgetKit.colors(m.palette)[m.dark(this) ? 1 : 0];   // accent, brand, card, tile, soft

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.reminder_sheet);
        View sheet = findViewById(R.id.sheet);
        findViewById(R.id.scrim).setOnClickListener(v -> { if (!saving) finish(); });
        // Edge to edge: the sheet sits above the navigation bar, and above the keyboard.
        int bottom = sheet.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(sheet, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), bottom + bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        float r = dp(28);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(colors[2]);
        bg.setCornerRadii(new float[] { r, r, r, r, 0, 0, 0, 0 });
        sheet.setBackground(bg);
        findViewById(R.id.handle).setBackground(round(colors[3], dp(3)));
        findViewById(R.id.icon_tile).setBackground(round(colors[4], dp(16)));
        ((TextView) findViewById(R.id.trip)).setText(trip.optString("name"));

        EditText text = findViewById(R.id.text);
        text.setBackground(round(colors[3], dp(16)));
        text.setOnEditorActionListener((v, action, e) -> {
            if (action == EditorInfo.IME_ACTION_DONE) { save(); return true; }
            return false;
        });
        TextView save = findViewById(R.id.save);
        save.setBackground(round(colors[1], dp(18)));
        save.setOnClickListener(v -> save());
        // The keyboard up at once: the text is all there is to type.
        text.requestFocus();
        text.postDelayed(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(text, InputMethodManager.SHOW_IMPLICIT);
        }, 150);
    }

    private void save() {
        if (saving) return;
        String text = ((EditText) findViewById(R.id.text)).getText().toString().trim();
        TextView err = findViewById(R.id.error);
        if (text.isEmpty()) {
            err.setText("כתבו מה להזכיר");
            err.setVisibility(View.VISIBLE);
            return;
        }
        String uid = ExpenseStore.uid(this);
        JSONObject e;
        try {
            e = ExpenseStore.reminder(uid == null ? "" : uid, ExpenseStore.name(this), ExpenseStore.photo(this),
                trip.optString("id"), text, System.currentTimeMillis());
        } catch (Exception x) {
            Log.w("ExpenseWidget", "cannot build a reminder", x);
            return;
        }
        saving = true;
        err.setVisibility(View.GONE);
        TextView button = findViewById(R.id.save);
        button.setText("שומר…");
        Context app = getApplicationContext();
        new Thread(() -> {
            ExpenseStore.Result r = ExpenseStore.save(app, e);
            Log.i("ExpenseWidget", "reminder: " + r);
            runOnUiThread(() -> done(r, e, text, button));
        }, "reminder-save").start();
    }

    private void done(ExpenseStore.Result r, JSONObject e, String text, TextView button) {
        String said;
        switch (r) {
            case SAVED: said = "התזכורת נשמרה ✓"; break;
            case OFFLINE: said = "אין חיבור · תישמר כשיחזור ✓"; break;
            case SIGNED_OUT: said = "תישמר כשתפתחו את האפליקציה ✓"; break;
            default:
                saving = false;
                button.setText("שמירה");
                TextView err = findViewById(R.id.error);
                err.setText("לא נשמר: אין הרשאה להוסיף לטיול הזה");
                err.setVisibility(View.VISIBLE);
                return;
        }
        WidgetLists.added(this, trip.optString("id"), e.optString("id"), text, savedAt);
        new RemindersWidget().redraw(this, AppWidgetManager.getInstance(this), widgetId);
        Toast.makeText(getApplicationContext(), said, Toast.LENGTH_SHORT).show();
        finish();
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
