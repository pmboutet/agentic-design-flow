/**
 * Date Pickers - Comprehensive date selection components
 * 
 * This module exports all date picker components for use throughout the application.
 * All components are built on top of React Aria Components for accessibility.
 * 
 * @example
 * ```tsx
 * import { DatePicker, DateTimePicker, DateRangePicker } from '@/components/ui/date-pickers';
 * 
 * // Simple date picker (date only)
 * <DatePicker value={date} onChange={setDate} />
 * 
 * // Date and time picker
 * <DateTimePicker value={datetime} onChange={setDatetime} />
 * 
 * // Date range picker
 * <DateRangePicker value={range} onChange={setRange} />
 * ```
 */

export { DatePicker } from "./date-picker";
export type { DatePickerProps } from "./date-picker";

export { DateTimePicker } from "./date-time-picker";
export type { DateTimePickerProps } from "./date-time-picker";

export { DateRangePicker } from "./date-range-picker";
export type { DateRangePickerProps, DateRange } from "./date-range-picker";

export { Calendar } from "./calendar";
export type { CalendarProps } from "./calendar";

