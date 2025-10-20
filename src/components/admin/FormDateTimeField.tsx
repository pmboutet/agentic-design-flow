"use client";

import type { ReactNode } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";

interface FormDateTimeFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  id: string;
  label: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
  errorClassName?: string;
}

export function FormDateTimeField<TFieldValues extends FieldValues>({
  control,
  name,
  id,
  label,
  placeholder = "Select date",
  disabled,
  error,
  align,
  sideOffset,
  errorClassName,
}: FormDateTimeFieldProps<TFieldValues>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <DateTimePicker
            id={id}
            value={field.value}
            onChange={field.onChange}
            disabled={disabled}
            placeholder={placeholder}
            align={align}
            sideOffset={sideOffset}
          />
        )}
      />
      {error ? <p className={errorClassName ?? "text-xs text-red-400"}>{error}</p> : null}
    </div>
  );
}
