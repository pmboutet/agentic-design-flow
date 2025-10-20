"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        months: cn("flex flex-col space-y-4", classNames?.months),
        month: cn("space-y-4", classNames?.month),
        caption: cn("flex justify-between px-1 text-sm font-medium text-slate-100", classNames?.caption),
        caption_label: cn("capitalize", classNames?.caption_label),
        nav: cn("flex items-center gap-1", classNames?.nav),
        nav_button: cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400",
          classNames?.nav_button
        ),
        nav_button_previous: cn("absolute left-1 top-1", classNames?.nav_button_previous),
        nav_button_next: cn("absolute right-1 top-1", classNames?.nav_button_next),
        table: cn("w-full border-collapse space-y-1", classNames?.table),
        head_row: cn("flex w-full", classNames?.head_row),
        head_cell: cn("w-9 text-center text-xs font-medium uppercase tracking-wide text-slate-400", classNames?.head_cell),
        row: cn("mt-2 flex w-full", classNames?.row),
        cell: cn(
          "relative h-9 w-9 rounded-xl text-sm text-slate-200 focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-indigo-500/10 [&:has([aria-selected])]:text-white",
          "data-[disabled]:opacity-40",
          classNames?.cell
        ),
        day: cn(
          "flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-white/10 hover:text-white focus:outline-none",
          classNames?.day
        ),
        day_selected: cn(
          "bg-indigo-500 text-white hover:bg-indigo-500 hover:text-white focus:bg-indigo-500 focus:text-white",
          classNames?.day_selected
        ),
        day_today: cn("text-indigo-200", classNames?.day_today),
        day_outside: cn("opacity-40", classNames?.day_outside),
        day_disabled: cn("opacity-30", classNames?.day_disabled),
        day_range_middle: cn("rounded-none bg-indigo-500/20 text-white", classNames?.day_range_middle),
        day_hidden: cn("invisible", classNames?.day_hidden)
      }}
      components={{
        IconLeft: props => <ChevronLeft className="h-4 w-4" {...props} />,
        IconRight: props => <ChevronRight className="h-4 w-4" {...props} />
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";
