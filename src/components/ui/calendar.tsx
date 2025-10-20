"use client";

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-slate-100 shadow-xl backdrop-blur-sm",
        className
      )}
      classNames={{
        months: cn("flex flex-col space-y-4", classNames?.months),
        month: cn("space-y-4", classNames?.month),
        caption: cn("flex items-center justify-between px-1 text-sm font-semibold", classNames?.caption),
        caption_label: cn("capitalize", classNames?.caption_label),
        nav: cn("flex items-center gap-2", classNames?.nav),
        nav_button: cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400",
          classNames?.nav_button
        ),
        nav_button_previous: cn("absolute left-1 top-1", classNames?.nav_button_previous),
        nav_button_next: cn("absolute right-1 top-1", classNames?.nav_button_next),
        table: cn("w-full border-collapse space-y-1", classNames?.table),
        head_row: cn("grid w-full grid-cols-7", classNames?.head_row),
        head_cell: cn(
          "text-center text-xs font-semibold uppercase tracking-wide text-indigo-200",
          classNames?.head_cell
        ),
        row: cn("mt-2 grid w-full grid-cols-7 gap-y-1", classNames?.row),
        cell: cn(
          "relative flex h-10 items-center justify-center text-sm text-slate-200 focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-indigo-500/10 [&:has([aria-selected])]:text-white",
          "data-[disabled]:opacity-40",
          classNames?.cell
        ),
        day: cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-white/10 hover:text-white focus:outline-none",
          classNames?.day
        ),
        day_selected: cn(
          "bg-indigo-500 text-white hover:bg-indigo-500 hover:text-white focus:bg-indigo-500 focus:text-white",
          classNames?.day_selected
        ),
        day_today: cn("border border-indigo-400/50 text-white", classNames?.day_today),
        day_outside: cn("opacity-40", classNames?.day_outside),
        day_disabled: cn("opacity-30", classNames?.day_disabled),
        day_range_middle: cn("rounded-none bg-indigo-500/20 text-white", classNames?.day_range_middle),
        day_hidden: cn("invisible", classNames?.day_hidden)
      }}
      components={{
        Chevron: ({ orientation, className, size = 16, ...chevronProps }) => {
          const icons = {
            down: ChevronDown,
            left: ChevronLeft,
            right: ChevronRight,
            up: ChevronUp
          } as const;

          const Icon = orientation ? icons[orientation] ?? ChevronRight : ChevronRight;

          return (
            <Icon
              className={cn("h-4 w-4", className)}
              size={size}
              {...chevronProps}
            />
          );
        }
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";
