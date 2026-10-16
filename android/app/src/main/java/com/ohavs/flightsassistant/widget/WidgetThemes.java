package com.ohavs.flightsassistant.widget;

import com.ohavs.flightsassistant.R;

/** Written by scripts/widget-layouts.py; edit there. A layout or drawable in the app's light or dark theme. */
final class WidgetThemes {
    private WidgetThemes() {}

    static int layout(int base, boolean dark) {
        if (base == R.layout.widget_trip) return dark ? R.layout.widget_trip_dark : R.layout.widget_trip_light;
        if (base == R.layout.widget_big) return dark ? R.layout.widget_big_dark : R.layout.widget_big_light;
        if (base == R.layout.widget_pack) return dark ? R.layout.widget_pack_dark : R.layout.widget_pack_light;
        if (base == R.layout.widget_plan) return dark ? R.layout.widget_plan_dark : R.layout.widget_plan_light;
        if (base == R.layout.widget_reminders) return dark ? R.layout.widget_reminders_dark : R.layout.widget_reminders_light;
        if (base == R.layout.widget_expense) return dark ? R.layout.widget_expense_dark : R.layout.widget_expense_light;
        if (base == R.layout.widget_list_item) return dark ? R.layout.widget_list_item_dark : R.layout.widget_list_item_light;
        if (base == R.layout.widget_message) return dark ? R.layout.widget_message_dark : R.layout.widget_message_light;
        return base;
    }

    static int drawable(int base, boolean dark) {
        if (base == R.drawable.widget_bg) return dark ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light;
        if (base == R.drawable.widget_tile) return dark ? R.drawable.widget_tile_dark : R.drawable.widget_tile_light;
        if (base == R.drawable.widget_soft) return dark ? R.drawable.widget_soft_dark : R.drawable.widget_soft_light;
        if (base == R.drawable.widget_chip) return dark ? R.drawable.widget_chip_dark : R.drawable.widget_chip_light;
        if (base == R.drawable.widget_brand) return dark ? R.drawable.widget_brand_dark : R.drawable.widget_brand_light;
        if (base == R.drawable.widget_dot) return dark ? R.drawable.widget_dot_dark : R.drawable.widget_dot_light;
        if (base == R.drawable.widget_progress) return dark ? R.drawable.widget_progress_dark : R.drawable.widget_progress_light;
        if (base == R.drawable.widget_route) return dark ? R.drawable.widget_route_dark : R.drawable.widget_route_light;
        if (base == R.drawable.widget_check_bg) return dark ? R.drawable.widget_check_bg_dark : R.drawable.widget_check_bg_light;
        if (base == R.drawable.widget_tick) return dark ? R.drawable.widget_tick_dark : R.drawable.widget_tick_light;
        if (base == R.drawable.ic_ws_plane) return dark ? R.drawable.ic_ws_plane_dark : R.drawable.ic_ws_plane_light;
        if (base == R.drawable.ic_ws_map) return dark ? R.drawable.ic_ws_map_dark : R.drawable.ic_ws_map_light;
        if (base == R.drawable.ic_ws_checklist) return dark ? R.drawable.ic_ws_checklist_dark : R.drawable.ic_ws_checklist_light;
        if (base == R.drawable.ic_ws_bell) return dark ? R.drawable.ic_ws_bell_dark : R.drawable.ic_ws_bell_light;
        if (base == R.drawable.ic_ws_wallet) return dark ? R.drawable.ic_ws_wallet_dark : R.drawable.ic_ws_wallet_light;
        return base;
    }
}
