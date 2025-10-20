"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function createDateWithTime(date: Date, time: string): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  const hoursNumber = Number.parseInt(hours, 10);
  const minutesNumber = Number.parseInt(minutes, 10);

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number.isNaN(hoursNumber) ? 0 : hoursNumber,
    Number.isNaN(minutesNumber) ? 0 : minutesNumber,
    0,
    0
  );
}

const defaultTime = "09:00";

export interface DateTimePickerProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  disabled,
  className,
  align = "start",
  sideOffset
}: DateTimePickerProps) {
  const parsedValue = React.useMemo(() => {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date;
  }, [value]);

  const [open, setOpen] = React.useState(false);

  const formattedDisplay = React.useMemo(() => {
    if (!parsedValue) {
      return "";
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(parsedValue);
    } catch {
      return format(parsedValue, "PP p");
    }
  }, [parsedValue]);

  const [timeValue, setTimeValue] = React.useState(() => {
    if (!parsedValue) {
      return defaultTime;
    }
    try {
      return format(parsedValue, "HH:mm");
    } catch {
      return defaultTime;
    }
  });

  React.useEffect(() => {
    if (!parsedValue) {
      setTimeValue(defaultTime);
      return;
    }
    try {
      setTimeValue(format(parsedValue, "HH:mm"));
    } catch {
      setTimeValue(defaultTime);
    }
  }, [parsedValue]);

  const applyChange = React.useCallback(
    (date: Date | undefined, nextTime: string) => {
      if (!date) {
        onChange("");
        return;
      }
      const nextDate = createDateWithTime(date, nextTime || defaultTime);
      onChange(nextDate.toISOString());
    },
    [onChange]
  );

  const handleSelectDate = React.useCallback(
    (
      selected: Date | null | [Date | null, Date | null],
      _event?: React.SyntheticEvent<any> | undefined
    ) => {
      const [next] = Array.isArray(selected) ? selected : [selected];
      if (!next) {
        return;
      }
      applyChange(next, timeValue);
      setOpen(false);
    },
    [applyChange, timeValue]
  );

  const handleTimeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setTimeValue(next);
      if (parsedValue) {
        applyChange(parsedValue, next);
      }
    },
    [applyChange, parsedValue]
  );

  const handleClear = React.useCallback(() => {
    setTimeValue(defaultTime);
    onChange("");
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
            "flex h-10 w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-4 w-4 text-indigo-200" />
            {formattedDisplay || <span className="text-slate-400">{placeholder}</span>}
          </span>
          {value ? (
            <X
              className="h-4 w-4 text-slate-400 transition hover:text-red-300"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleClear();
              }}
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={sideOffset} className="w-80 space-y-3">
        <Calendar
          selected={parsedValue ?? null}
          onChange={handleSelectDate}
          containerClassName="rounded-2xl"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs uppercase tracking-wide text-slate-300">
            <span>Time</span>
            <input
              type="time"
              value={timeValue}
              onChange={handleTimeChange}
              className="flex-1 bg-transparent text-sm text-white outline-none [color-scheme:dark]"
            />
          </label>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:border-red-300/70 hover:text-red-200"
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
