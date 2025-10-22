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
  "flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40";

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
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Previous year"
          className={navigationButtonClasses}
          isDisabled={disablePreviousYear}
          onPress={() => {
            if (!state) {
              return;
            }
            state.focusPreviousSection(true);
          }}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          slot="previous"
          aria-label="Previous month"
          className={navigationButtonClasses}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center text-sm font-semibold text-white">
        <span className="uppercase tracking-wide text-indigo-200">
          {monthLabel}
        </span>
        <span className="text-xs text-slate-300">{yearLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          slot="next"
          aria-label="Next month"
          className={navigationButtonClasses}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Next year"
          className={navigationButtonClasses}
          isDisabled={disableNextYear}
          onPress={() => {
            if (!state) {
              return;
            }
            state.focusNextSection(true);
          }}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
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
        <CalendarGrid className="w-full border-separate border-spacing-y-2">
          <CalendarGridHeader className="grid grid-cols-7 gap-1 border-b border-white/10 pb-2 text-xs font-semibold uppercase tracking-wide text-indigo-200">
            {day => (
              <CalendarHeaderCell className="flex h-10 w-10 items-center justify-center rounded-xl">
                {day}
              </CalendarHeaderCell>
            )}
          </CalendarGridHeader>
          <CalendarGridBody className="grid grid-cols-7 gap-1">
            {date => (
              <CalendarCell
                date={date}
                className="group mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-sm font-medium text-slate-200 transition data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40 data-[outside-month]:text-slate-500 data-[selected]:bg-indigo-500 data-[selected]:text-white data-[selected]:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.85)] data-[today]:ring-1 data-[today]:ring-indigo-400/60 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                {({ formattedDate }) => formattedDate}
              </CalendarCell>
            )}
          </CalendarGridBody>
        </CalendarGrid>
      </AriaCalendar>
    </div>
  );
}

Calendar.displayName = "Calendar";
