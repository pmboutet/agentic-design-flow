"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const navigationButtonClasses =
    "flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

  const ChevronComponent =
    components?.Chevron ??
    (({ orientation, className: chevronClassName, size = 16, ...chevronProps }) => {
      const icons = {
        down: ChevronDown,
        left: ChevronLeft,
        right: ChevronRight,
        up: ChevronUp
      } as const;

      const Icon = orientation ? icons[orientation] ?? ChevronRight : ChevronRight;

      return (
        <Icon
          className={cn("h-4 w-4", chevronClassName)}
          size={size}
          {...chevronProps}
        />
      );
    });

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-slate-100 shadow-xl backdrop-blur-sm",
        className
      )}
      classNames={{
        ...classNames,
        root: cn("text-slate-100", classNames?.root),
        months: cn(
          "flex flex-col gap-6 sm:flex-row sm:gap-8",
          classNames?.months
        ),
        month: cn("space-y-6", classNames?.month),
        month_caption: cn(
          "flex items-center justify-between px-1 text-sm font-semibold",
          classNames?.month_caption
        ),
        caption: cn(
          "flex items-center justify-between px-1 text-sm font-semibold",
          classNames?.caption
        ),
        caption_label: cn(
          "text-base font-semibold tracking-wide text-white",
          classNames?.caption_label
        ),
        nav: cn("flex items-center gap-2", classNames?.nav),
        button_previous: cn(navigationButtonClasses, classNames?.button_previous),
        button_next: cn(navigationButtonClasses, classNames?.button_next),
        nav_button: cn(navigationButtonClasses, classNames?.nav_button),
        nav_button_previous: cn("order-first", classNames?.nav_button_previous),
        nav_button_next: cn("order-last", classNames?.nav_button_next),
        month_grid: cn(
          "w-full border-separate border-spacing-x-1 border-spacing-y-1",
          classNames?.month_grid
        ),
        table: cn(
          "w-full border-separate border-spacing-x-1 border-spacing-y-1",
          classNames?.table
        ),
        weekdays: cn(
          "border-b border-white/10 pb-2",
          classNames?.weekdays,
          classNames?.head_row
        ),
        weekday: cn(
          "w-10 text-center text-xs font-semibold uppercase tracking-wide text-indigo-200",
          classNames?.weekday,
          classNames?.head_cell
        ),
        weeks: cn(classNames?.weeks),
        week: cn("", classNames?.week, classNames?.row),
        day: cn(
          "relative p-0 text-center align-middle text-sm text-slate-200 focus-within:relative focus-within:z-20",
          classNames?.day,
          classNames?.cell
        ),
        day_button: cn(
          "mx-auto flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          classNames?.day_button
        ),
        selected: cn(
          "bg-indigo-500 text-white hover:bg-indigo-500 hover:text-white focus-visible:bg-indigo-500 focus-visible:text-white",
          classNames?.selected,
          classNames?.day_selected
        ),
        today: cn(
          "text-white ring-1 ring-indigo-400/60",
          classNames?.today,
          classNames?.day_today
        ),
        outside: cn(
          "text-slate-500",
          classNames?.outside,
          classNames?.day_outside
        ),
        disabled: cn(
          "text-slate-600 opacity-40",
          classNames?.disabled,
          classNames?.day_disabled
        ),
        hidden: cn("hidden", classNames?.hidden, classNames?.day_hidden),
        range_middle: cn(
          "rounded-none bg-indigo-500/20 text-white",
          classNames?.range_middle,
          classNames?.day_range_middle
        ),
        range_start: cn(
          "rounded-l-xl bg-indigo-500 text-white",
          classNames?.range_start,
          classNames?.day_range_start
        ),
        range_end: cn(
          "rounded-r-xl bg-indigo-500 text-white",
          classNames?.range_end,
          classNames?.day_range_end
        )
      }}
      components={{
        ...components,
        Chevron: ChevronComponent
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";
