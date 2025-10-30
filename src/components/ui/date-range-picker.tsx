"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RangeCalendar as AriaRangeCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  Button,
  useLocale,
  type RangeCalendarProps as AriaRangeCalendarProps,
  type DateValue
} from "react-aria-components";
import { CalendarDate, fromDate, getLocalTimeZone } from "@internationalized/date";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";

const timeZone = getLocalTimeZone();

const navigationButtonClasses =
  "flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition-all duration-200 hover:bg-indigo-500/20 hover:text-white hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[disabled]:hover:scale-100";

export interface DateRange {
  start: string;
  end: string;
}

export interface DateRangePickerProps {
  id?: string;
  value?: DateRange | null;
  onChange: (value: DateRange | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  minDate?: Date;
  maxDate?: Date;
}

function toCalendarDate(value?: Date | null): CalendarDate | null {
  if (!value) {
    return null;
  }
  const zoned = fromDate(value, timeZone);
  return new CalendarDate(zoned.year, zoned.month, zoned.day);
}

function fromDateValue(value?: DateValue | null): Date | null {
  if (!value) {
    return null;
  }
  return value.toDate(timeZone);
}

function RangeCalendarHeader() {
  const state = React.useContext(CalendarStateContext);
  const { locale } = useLocale();

  const focusedDate = state?.focusedDate;
  const monthLabel = React.useMemo(() => {
    if (!focusedDate) {
      return "";
    }
    const date = focusedDate.toDate(timeZone);
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
  }, [focusedDate, locale]);

  const yearLabel = React.useMemo(() => {
    if (!focusedDate) {
      return "";
    }
    const date = focusedDate.toDate(timeZone);
    return new Intl.DateTimeFormat(locale, { year: "numeric" }).format(date);
  }, [focusedDate, locale]);

  return (
    <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
      <div className="flex items-center gap-0.5">
        <Button
          slot="previous"
          aria-label="Previous month"
          className={navigationButtonClasses}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-sm font-semibold text-white">
        <span className="text-base uppercase tracking-wider text-indigo-100">
          {monthLabel}
        </span>
        <span className="text-xs font-medium text-slate-400">{yearLabel}</span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          slot="next"
          aria-label="Next month"
          className={navigationButtonClasses}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder = "Select date range",
  disabled,
  className,
  align = "start",
  sideOffset,
  minDate,
  maxDate
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const parsedValue = React.useMemo(() => {
    if (!value?.start || !value?.end) {
      return null;
    }
    const start = new Date(value.start);
    const end = new Date(value.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }, [value]);

  const formattedDisplay = React.useMemo(() => {
    if (!parsedValue) {
      return "";
    }
    try {
      const startStr = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium"
      }).format(parsedValue.start);
      const endStr = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium"
      }).format(parsedValue.end);
      return `${startStr} → ${endStr}`;
    } catch {
      return `${format(parsedValue.start, "PP")} → ${format(parsedValue.end, "PP")}`;
    }
  }, [parsedValue]);

  const rangeValue = React.useMemo(() => {
    if (!parsedValue) {
      return null;
    }
    const start = toCalendarDate(parsedValue.start);
    const end = toCalendarDate(parsedValue.end);
    if (!start || !end) {
      return null;
    }
    return { start, end };
  }, [parsedValue]);

  const minValue = React.useMemo(
    () => (minDate ? toCalendarDate(minDate) ?? undefined : undefined),
    [minDate]
  );

  const maxValue = React.useMemo(
    () => (maxDate ? toCalendarDate(maxDate) ?? undefined : undefined),
    [maxDate]
  );

  const handleSelect = React.useCallback(
    (range: { start: DateValue; end: DateValue } | null) => {
      if (!range) {
        onChange(null);
        return;
      }
      const start = fromDateValue(range.start);
      const end = fromDateValue(range.end);
      if (!start || !end) {
        onChange(null);
        return;
      }
      // Set time to noon to avoid timezone issues
      const startAtNoon = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        12,
        0,
        0,
        0
      );
      const endAtNoon = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        12,
        0,
        0,
        0
      );
      onChange({
        start: startAtNoon.toISOString(),
        end: endAtNoon.toISOString()
      });
    },
    [onChange]
  );

  const handleClear = React.useCallback(() => {
    onChange(null);
    setOpen(false);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            "group relative flex h-10 w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white shadow-sm transition-all duration-200 hover:border-indigo-400/40 hover:bg-slate-900/80 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-white/10 disabled:hover:bg-slate-900/60 disabled:hover:shadow-sm",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 text-indigo-300 transition-colors group-hover:text-indigo-200" />
            {formattedDisplay || <span className="text-slate-400 group-hover:text-slate-300">{placeholder}</span>}
          </span>
          {value ? (
            <X
              className="h-4 w-4 text-slate-500 transition-all duration-150 hover:scale-110 hover:text-red-400"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleClear();
              }}
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={sideOffset} className="w-auto p-0">
        <div className="relative">
          <AriaRangeCalendar
            aria-label="Date range picker"
            className={cn(
              "akd-range-calendar grid gap-3 rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-slate-100 shadow-xl backdrop-blur-md"
            )}
            value={rangeValue}
            onChange={handleSelect}
            minValue={minValue}
            maxValue={maxValue}
          >
            <RangeCalendarHeader />
            <CalendarGrid className="w-full table-fixed">
              <CalendarGridHeader className="border-b border-white/10 pb-2.5 text-xs font-bold uppercase tracking-wider text-indigo-300/90">
                {day => (
                  <CalendarHeaderCell className="h-10 w-10 text-center align-middle">
                    <span className="inline-block w-10">{day}</span>
                  </CalendarHeaderCell>
                )}
              </CalendarGridHeader>
              <CalendarGridBody className="pt-2">
                {date => (
                  <CalendarCell
                    date={date}
                    className="group relative h-10 w-10 text-center align-middle rounded-xl text-sm font-semibold text-slate-200 transition-all duration-150 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-30 data-[outside-month]:text-slate-600 data-[selection-start]:bg-gradient-to-br data-[selection-start]:from-indigo-500 data-[selection-start]:to-indigo-600 data-[selection-start]:text-white data-[selection-end]:bg-gradient-to-br data-[selection-end]:from-indigo-500 data-[selection-end]:to-indigo-600 data-[selection-end]:text-white data-[selected]:bg-indigo-500/30 data-[selected]:text-white data-[selection-start]:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.9)] data-[selection-start]:ring-2 data-[selection-start]:ring-indigo-400/50 data-[selection-end]:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.9)] data-[selection-end]:ring-2 data-[selection-end]:ring-indigo-400/50 data-[today]:ring-2 data-[today]:ring-indigo-400/60 data-[today]:ring-offset-1 data-[today]:ring-offset-slate-950 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    {({ formattedDate }) => <span className="inline-block w-10">{formattedDate}</span>}
                  </CalendarCell>
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </AriaRangeCalendar>
        </div>
      </PopoverContent>
    </Popover>
  );
}

