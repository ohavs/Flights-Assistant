package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.widget.RemoteViews;

import com.ohavs.flightsassistant.R;

import org.json.JSONObject;

/** Packing (2x2): how much of the trip's checklist is packed, big, and a bar. */
public class PackWidget extends BaseWidget {

    @Override
    float[] defaultSize() {
        return new float[] { 170f, 180f };
    }

    @Override
    RemoteViews content(Context ctx, WidgetKit.Moment m, float w, float h) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), m.layout(R.layout.widget_pack));
        JSONObject packed = m.trip.optJSONObject("packed");
        int done = packed == null ? 0 : packed.optInt("done"), all = packed == null ? 0 : packed.optInt("total");
        int pct = all == 0 ? 0 : Math.round(100f * done / all);
        v.setTextViewText(R.id.chip, pct + "%");
        WidgetKit.visible(v, R.id.chip, all > 0);
        v.setTextViewText(R.id.big, all == 0 ? "0" : done + "/" + all);
        String state = all == 0 ? "הרשימה ריקה" : done == all ? "הכל ארוז!" : "נארזו";
        v.setTextViewText(R.id.caption, state + " · " + m.trip.optString("name"));
        v.setProgressBar(R.id.packed_bar, 100, pct, false);
        WidgetKit.visible(v, R.id.packed_bar, all > 0);
        WidgetKit.theme(ctx, v, m, new WidgetKit.Paint().card(R.id.root).soft(R.id.icon_tile).chip(R.id.chip).bar(R.id.packed_bar));
        v.setOnClickPendingIntent(R.id.root, WidgetKit.open(ctx, m.tripId, "checklist"));
        return v;
    }
}
