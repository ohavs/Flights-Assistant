package com.ohavs.flightsassistant.widget;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import com.ohavs.flightsassistant.R;

import java.util.ArrayList;
import java.util.List;

/**
 * The rows of a widget list that scrolls: today's plan (PlanWidget) or the
 * open reminders (RemindersWidget). Each row has a box to tick. A tick goes
 * through WidgetActionActivity, and a tap on the row opens the app.
 */
public class ListWidgetService extends RemoteViewsService {
    static final String PLAN = "plan", REMINDERS = "reminders";

    /** The adapter for widget id's list; a distinct address per widget, or Android shares one. */
    static Intent intent(Context ctx, int id, String kind) {
        return new Intent(ctx, ListWidgetService.class)
            .setData(Uri.parse("listwidget://" + kind + "/" + id))
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            .putExtra("kind", kind);
    }

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(),
            intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID),
            intent.getStringExtra("kind"));
    }

    static final class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private final int id;
        private final String kind;
        private WidgetKit.Moment m;
        private List<WidgetLists.Row> rows = new ArrayList<>();

        Factory(Context ctx, int id, String kind) {
            this.ctx = ctx;
            this.id = id;
            this.kind = kind == null ? PLAN : kind;
        }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            m = WidgetKit.momentOf(ctx, id);
            if (m == null || m.trip == null) {
                rows = new ArrayList<>();
                return;
            }
            rows = REMINDERS.equals(kind) ? WidgetLists.reminders(ctx, m) : WidgetLists.plan(ctx, m);
        }

        @Override public void onDestroy() {}

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int pos) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_list_item));
            if (pos >= rows.size()) return v;
            WidgetLists.Row r = rows.get(pos);
            v.setTextViewText(R.id.item_title, r.title);
            v.setFloat(R.id.item_title, "setAlpha", r.done ? 0.5f : 1f);
            v.setTextViewText(R.id.item_sub, r.sub);
            WidgetKit.visible(v, R.id.item_sub, !r.sub.isEmpty());
            v.setTextViewText(R.id.item_pill, r.pill);
            WidgetKit.visible(v, R.id.item_pill, !r.pill.isEmpty());
            WidgetKit.visible(v, R.id.item_ring, !r.done);
            WidgetKit.visible(v, R.id.item_check, r.done);
            v.setContentDescription(R.id.item_box, (r.done ? "בוצע: " : "סמן: ") + r.title);
            WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().chip(R.id.item_pill).fill(R.id.item_check));

            String tab = REMINDERS.equals(kind) ? "checklist" : "planning";
            Intent open = new Intent().putExtra("action", "open").putExtra("tripId", m.tripId).putExtra("tab", tab);
            v.setOnClickFillInIntent(R.id.item, open);
            v.setOnClickFillInIntent(R.id.item_box, r.path == null ? open : new Intent()
                .putExtra("action", "tick")
                .putExtra("path", r.path)
                .putExtra("field", r.field)
                .putExtra("value", !r.done)
                .putExtra("kind", kind)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id));
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return false; }
    }
}
