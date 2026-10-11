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

export function RangeFilters({ range }: { range: DashboardRange }) {
  const router = useRouter();

  function open(query: Record<string, string>) {
    const params = new URLSearchParams(query);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Month"
          className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink"
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
          className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink"
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
        {PRESETS.map((preset) => (
          <a
            key={preset.key}
            className={`rounded-md border px-3 py-2 text-sm ${
              range.key === preset.key
                ? "border-pine bg-pine text-card"
                : "border-line bg-card text-ink hover:border-pine"
            }`}
            href={`/?range=${preset.key}`}
          >
            {preset.label}
          </a>
        ))}
        <a
          className={`rounded-md border px-3 py-2 text-sm ${
            range.key === "custom"
              ? "border-pine bg-pine text-card"
              : "border-line bg-card text-ink hover:border-pine"
          }`}
          href={`/?range=custom&from=${range.since}&to=${range.until}`}
        >
          Custom
        </a>
      </div>
      {range.key === "custom" ? (
        <form
          className="flex flex-wrap items-end gap-2"
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
          <label className="text-sm text-muted">
            From
            <input
              className="mt-1 block rounded-md border border-line bg-card px-3 py-2 text-ink"
              defaultValue={range.since}
              name="from"
              required
              type="date"
            />
          </label>
          <label className="text-sm text-muted">
            To
            <input
              className="mt-1 block rounded-md border border-line bg-card px-3 py-2 text-ink"
              defaultValue={range.until}
              name="to"
              required
              type="date"
            />
          </label>
          <button className="rounded-md border border-pine bg-pine px-4 py-2 text-sm text-card" type="submit">
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
