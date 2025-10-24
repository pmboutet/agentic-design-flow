"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface DatePickerProps {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Select date",
  disabled,
  className,
  align = "start",
  sideOffset,
  minDate,
  maxDate
}: DatePickerProps) {
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
        dateStyle: "medium"
      }).format(parsedValue);
    } catch {
      return format(parsedValue, "PP");
    }
  }, [parsedValue]);

  const handleSelectDate = React.useCallback(
    (next: Date | null) => {
      if (!next) {
        onChange("");
        return;
      }
      // Set the time to noon to avoid timezone issues
      const dateAtNoon = new Date(
        next.getFullYear(),
        next.getMonth(),
        next.getDate(),
        12,
        0,
        0,
        0
      );
      onChange(dateAtNoon.toISOString());
      setOpen(false);
    },
    [onChange]
  );

  const handleClear = React.useCallback(() => {
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
        <Calendar
          selected={parsedValue ?? null}
          onSelect={handleSelectDate}
          minDate={minDate}
          maxDate={maxDate}
          containerClassName="rounded-2xl"
          ariaLabel="Date picker"
        />
      </PopoverContent>
    </Popover>
  );
}

