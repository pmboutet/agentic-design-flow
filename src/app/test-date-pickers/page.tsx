"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker, DateTimePicker, DateRangePicker, type DateRange } from "@/components/ui/date-pickers";

export default function TestDatePickersPage() {
  const [date, setDate] = useState<string>("");
  const [datetime, setDatetime] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            Date Pickers Demo
          </h1>
          <p className="text-slate-300">
            Test des composants de sélection de date
          </p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>DatePicker - Simple Date Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Select a date
              </label>
              <DatePicker
                value={date}
                onChange={setDate}
                placeholder="Choose a date"
              />
            </div>
            {date && (
              <div className="rounded-lg bg-indigo-500/10 p-4 border border-indigo-400/20">
                <p className="text-sm text-slate-300">
                  Selected: <span className="font-mono text-indigo-300">{date}</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>DateTimePicker - Date and Time Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Select date and time
              </label>
              <DateTimePicker
                value={datetime}
                onChange={setDatetime}
                placeholder="Choose date and time"
              />
            </div>
            {datetime && (
              <div className="rounded-lg bg-indigo-500/10 p-4 border border-indigo-400/20">
                <p className="text-sm text-slate-300">
                  Selected: <span className="font-mono text-indigo-300">{datetime}</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Formatted: {new Date(datetime).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>DateRangePicker - Date Range Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Select a date range
              </label>
              <DateRangePicker
                value={dateRange}
                onChange={setDateRange}
                placeholder="Choose a date range"
              />
            </div>
            {dateRange && (
              <div className="rounded-lg bg-indigo-500/10 p-4 border border-indigo-400/20 space-y-2">
                <div className="text-sm text-slate-300">
                  Start: <span className="font-mono text-indigo-300">{dateRange.start}</span>
                </div>
                <div className="text-sm text-slate-300">
                  End: <span className="font-mono text-indigo-300">{dateRange.end}</span>
                </div>
                <div className="text-xs text-slate-400 mt-2">
                  {new Date(dateRange.start).toLocaleDateString()} → {new Date(dateRange.end).toLocaleDateString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>With Constraints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200">
                Date picker with min/max dates
              </label>
              <DatePicker
                value={date}
                onChange={setDate}
                placeholder="Only future dates"
                minDate={new Date()}
                maxDate={new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)}
              />
              <p className="text-xs text-slate-400">
                Only dates within the next 90 days can be selected
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card bg-slate-950/40">
          <CardHeader>
            <CardTitle>Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Built on React Aria Components for full accessibility</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Modern, beautiful design with smooth animations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Keyboard navigation support</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Min/max date constraints</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Responsive and mobile-friendly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>Consistent styling across all date pickers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-400">✓</span>
                <span>TypeScript support with full type safety</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

