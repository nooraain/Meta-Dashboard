"use client";

import { useRouter } from "next/navigation";
import type { DashboardRange } from "@/lib/dashboard";

const PRESETS = [
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "1m", label: "1 month" },
  { key: "2m", label: "2 months" },
  { key: "3m", label: "3 months" },
  { key: "4m", label: "4 months" },
] as const;

const selectClass =
  "rounded-lg border border-line/80 bg-card px-3 py-2 text-sm text-ink shadow-sm outline-none transition-colors focus:border-sea/50 focus:ring-2 focus:ring-sea/15";

const chipClass = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
    active
      ? "border-transparent bg-gradient-to-r from-pine to-pine-dark text-white shadow-sm"
      : "border-line/80 bg-card text-ink shadow-sm hover:border-pine/35 hover:text-pine"
  }`;

export function RangeFilters({ range }: { range: DashboardRange }) {
  const router = useRouter();

  function open(query: Record<string, string>) {
    const params = new URLSearchParams(query);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-card/90 p-4 shadow-[var(--shadow-card)] backdrop-blur-sm sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Date range</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Month"
            className={selectClass}
            value={range.key === "month" ? range.month : ""}
            onChange={(event) => {
              if (event.target.value) open({ range: "month", month: event.target.value });
            }}
          >
            <option value="">Months</option>
            {range.months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Week"
            className={selectClass}
            value={range.key === "week" ? range.week : ""}
            onChange={(event) => {
              if (event.target.value) open({ range: "week", week: event.target.value });
            }}
          >
            <option value="">Weeks</option>
            {range.weeks.map((week) => (
              <option key={week.value} value={week.value}>
                {week.label}
              </option>
            ))}
          </select>
          <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden />
          {PRESETS.map((preset) => (
            <a key={preset.key} className={chipClass(range.key === preset.key)} href={`/?range=${preset.key}`}>
              {preset.label}
            </a>
          ))}
          <a
            className={chipClass(range.key === "custom")}
            href={`/?range=custom&from=${range.since}&to=${range.until}`}
          >
            Custom
          </a>
        </div>
        {range.key === "custom" ? (
          <form
            className="flex flex-wrap items-end gap-3 border-t border-line/80 pt-3"
            key={`${range.since}-${range.until}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              open({
                range: "custom",
                from: String(data.get("from") ?? ""),
                to: String(data.get("to") ?? ""),
              });
            }}
          >
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              From
              <input
                className={`${selectClass} mt-1.5 block`}
                defaultValue={range.since}
                name="from"
                required
                type="date"
              />
            </label>
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              To
              <input
                className={`${selectClass} mt-1.5 block`}
                defaultValue={range.until}
                name="to"
                required
                type="date"
              />
            </label>
            <button
              className="rounded-lg bg-gradient-to-r from-pine to-pine-dark px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95"
              type="submit"
            >
              Apply
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}