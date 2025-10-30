"use client";

import * as React from "react";
import {
  Button,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  useLocale,
  type CalendarProps as AriaCalendarProps,
  type DateValue
} from "react-aria-components";
import { CalendarDate, fromDate, getLocalTimeZone } from "@internationalized/date";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";

import { cn } from "@/lib/utils";

const timeZone = getLocalTimeZone();

const navigationButtonClasses =
  "flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition-all duration-200 hover:bg-indigo-500/20 hover:text-white hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[disabled]:hover:scale-100";

type OptionalAriaProps = Partial<
  Omit<
    AriaCalendarProps<DateValue>,
    | "value"
    | "defaultValue"
    | "onChange"
    | "className"
    | "minValue"
    | "maxValue"
    | "isDateUnavailable"
    | "children"
  >
>;

export interface CalendarProps extends OptionalAriaProps {
  /**
   * The currently selected date. When provided, the calendar becomes controlled.
   */
  selected?: Date | null;
  /**
   * The initial selected date when the calendar is uncontrolled.
   */
  defaultSelected?: Date | null;
  /**
   * Callback fired when the user selects a date.
   */
  onSelect?: (value: Date | null) => void;
  /**
   * The minimum selectable date.
   */
  minDate?: Date;
  /**
   * The maximum selectable date.
   */
  maxDate?: Date;
  /**
   * Function used to determine if a date should be marked as unavailable.
   */
  isDateUnavailable?: (date: Date) => boolean;
  /**
   * Optional class name for the calendar surface.
   */
  className?: string;
  /**
   * Optional class name applied to the wrapping element.
   */
  containerClassName?: string;
  /**
   * Accessible label for the calendar widget.
   */
  ariaLabel?: string;
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

function CalendarHeader() {
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

  const minDate = React.useMemo(() => state?.minValue?.toDate(timeZone) ?? null, [state?.minValue]);
  const maxDate = React.useMemo(() => state?.maxValue?.toDate(timeZone) ?? null, [state?.maxValue]);

  let disablePreviousYear = !state;
  let disableNextYear = !state;

  if (state) {
    disablePreviousYear = false;
    disableNextYear = false;

    if (minDate) {
      const previousEnd = state.visibleRange.end.subtract({ years: 1 });
      disablePreviousYear =
        previousEnd.toDate(timeZone).getTime() < minDate.getTime();
    }

    if (maxDate) {
      const nextStart = state.visibleRange.start.add({ years: 1 });
      disableNextYear =
        nextStart.toDate(timeZone).getTime() > maxDate.getTime();
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous year"
          className={navigationButtonClasses}
          disabled={disablePreviousYear}
          onClick={() => {
            if (!state) {
              return;
            }
            state.focusPreviousSection(true);
          }}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
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
        <button
          type="button"
          aria-label="Next year"
          className={navigationButtonClasses}
          disabled={disableNextYear}
          onClick={() => {
            if (!state) {
              return;
            }
            state.focusNextSection(true);
          }}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Calendar({
  className,
  containerClassName,
  selected,
  defaultSelected,
  onSelect,
  minDate,
  maxDate,
  isDateUnavailable,
  ariaLabel = "Calendar",
  ...rest
}: CalendarProps) {
  const isControlled = selected !== undefined;

  const calendarValue = React.useMemo(() => {
    if (!isControlled) {
      return null;
    }
    return toCalendarDate(selected ?? null);
  }, [isControlled, selected]);

  const calendarDefaultValue = React.useMemo(() => {
    if (isControlled || defaultSelected === undefined) {
      return undefined;
    }
    return toCalendarDate(defaultSelected ?? null) ?? undefined;
  }, [defaultSelected, isControlled]);

  const minValue = React.useMemo(
    () => (minDate ? toCalendarDate(minDate) ?? undefined : undefined),
    [minDate]
  );

  const maxValue = React.useMemo(
    () => (maxDate ? toCalendarDate(maxDate) ?? undefined : undefined),
    [maxDate]
  );

  const unavailableChecker = React.useMemo(() => {
    if (!isDateUnavailable) {
      return undefined;
    }
    return (dateValue: DateValue) => {
      const date = fromDateValue(dateValue);
      return date ? isDateUnavailable(date) : false;
    };
  }, [isDateUnavailable]);

  const handleSelect = React.useCallback(
    (value: DateValue | null) => {
      onSelect?.(fromDateValue(value));
    },
    [onSelect]
  );

  return (
    <div className={cn("relative", containerClassName)}>
      <AriaCalendar
        {...(rest as AriaCalendarProps<DateValue>)}
        aria-label={ariaLabel}
        className={cn(
          "akd-calendar grid gap-3 rounded-2xl border border-white/10 bg-slate-950/90 p-4 text-slate-100 shadow-xl backdrop-blur-md",
          className
        )}
        value={isControlled ? calendarValue ?? null : undefined}
        defaultValue={!isControlled ? calendarDefaultValue : undefined}
        minValue={minValue}
        maxValue={maxValue}
        isDateUnavailable={unavailableChecker}
        onChange={handleSelect}
      >
        <CalendarHeader />
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
                className="group relative h-10 w-10 text-center align-middle rounded-xl text-sm font-semibold text-slate-200 transition-all duration-150 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-30 data-[outside-month]:text-slate-600 data-[selected]:bg-gradient-to-br data-[selected]:from-indigo-500 data-[selected]:to-indigo-600 data-[selected]:text-white data-[selected]:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.9)] data-[selected]:ring-2 data-[selected]:ring-indigo-400/50 data-[today]:ring-2 data-[today]:ring-indigo-400/60 data-[today]:ring-offset-1 data-[today]:ring-offset-slate-950 hover:bg-white/15 hover:text-white hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                {({ formattedDate }) => <span className="inline-block w-10">{formattedDate}</span>}
              </CalendarCell>
            )}
          </CalendarGridBody>
        </CalendarGrid>
      </AriaCalendar>
    </div>
  );
}

Calendar.displayName = "Calendar";
