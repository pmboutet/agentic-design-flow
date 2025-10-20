"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import ReactDatePicker, { type DatePickerProps } from "react-datepicker";

import { cn } from "@/lib/utils";

type HeaderRenderer = NonNullable<
  DatePickerProps["renderCustomHeader"]
>;

export interface CalendarProps
  extends Omit<DatePickerProps, "inline" | "renderCustomHeader"> {
  containerClassName?: string;
  renderCustomHeader?: HeaderRenderer;
}

type HeaderProps = Parameters<
  NonNullable<HeaderRenderer>
>[0];

const navigationButtonClasses =
  "flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-40";

function DefaultHeader({
  date,
  decreaseMonth,
  increaseMonth,
  decreaseYear,
  increaseYear,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled
}: HeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={decreaseYear}
          className={navigationButtonClasses}
          aria-label="Previous year"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={decreaseMonth}
          className={navigationButtonClasses}
          aria-label="Previous month"
          disabled={prevMonthButtonDisabled}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col items-center text-sm font-semibold text-white">
        <span className="uppercase tracking-wide text-indigo-200">
          {format(date, "MMMM")}
        </span>
        <span className="text-xs text-slate-300">{format(date, "yyyy")}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={increaseMonth}
          className={navigationButtonClasses}
          aria-label="Next month"
          disabled={nextMonthButtonDisabled}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={increaseYear}
          className={navigationButtonClasses}
          aria-label="Next year"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Calendar({
  containerClassName,
  calendarClassName,
  renderCustomHeader,
  ...props
}: CalendarProps) {
  const calendarProps = props as DatePickerProps;
  const headerRenderer = React.useMemo(() => {
    if (!renderCustomHeader) {
      return (headerProps: HeaderProps) => <DefaultHeader {...headerProps} />;
    }

    return renderCustomHeader;
  }, [renderCustomHeader]);

  return (
    <div className={cn("relative", containerClassName)}>
      <ReactDatePicker
        inline
        showPopperArrow={false}
        calendarClassName={cn(
          "akd-datepicker grid gap-2",
          calendarClassName
        )}
        renderCustomHeader={headerRenderer}
        {...calendarProps}
      />
    </div>
  );
}

Calendar.displayName = "Calendar";
