package com.ohavs.flightsassistant.widget;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.view.ViewGroup;

/** Chips in rows, wrapping, from the start side (right in Hebrew). ExpenseSheetActivity. */
public class ChipFlow extends ViewGroup {
    private final int gap;

    public ChipFlow(Context ctx, AttributeSet attrs) {
        super(ctx, attrs);
        gap = Math.round(8 * ctx.getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onMeasure(int widthSpec, int heightSpec) {
        int room = MeasureSpec.getSize(widthSpec) - getPaddingLeft() - getPaddingRight();
        int x = 0, y = 0, row = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View c = getChildAt(i);
            if (c.getVisibility() == GONE) continue;
            measureChild(c, MeasureSpec.makeMeasureSpec(room, MeasureSpec.AT_MOST), heightSpec);
            int w = c.getMeasuredWidth(), h = c.getMeasuredHeight();
            if (x > 0 && x + w > room) { y += row + gap; x = 0; row = 0; }
            x += w + gap;
            row = Math.max(row, h);
        }
        setMeasuredDimension(MeasureSpec.getSize(widthSpec), y + row + getPaddingTop() + getPaddingBottom());
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        int room = r - l - getPaddingLeft() - getPaddingRight();
        boolean rtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
        int x = 0, y = getPaddingTop(), row = 0;
        for (int i = 0; i < getChildCount(); i++) {
            View c = getChildAt(i);
            if (c.getVisibility() == GONE) continue;
            int w = c.getMeasuredWidth(), h = c.getMeasuredHeight();
            if (x > 0 && x + w > room) { y += row + gap; x = 0; row = 0; }
            int left = rtl ? r - l - getPaddingRight() - x - w : getPaddingLeft() + x;
            c.layout(left, y, left + w, y + h);
            x += w + gap;
            row = Math.max(row, h);
        }
    }
}
