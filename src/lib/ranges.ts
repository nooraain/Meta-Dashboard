import { addDays, inclusiveDays, shiftMonths, startOfWeek } from "@/lib/dates";

export type RangeKey = "7d" | "14d" | "1m" | "2m" | "3m" | "4m" | "month" | "week" | "custom";

export type RangeOption = { value: string; label: string };

export type ResolvedRange = {
  key: RangeKey;
  label: string;
  since: string;
  until: string;
  previousSince: string;
  previousUntil: string;
  comparison: "month" | "previous";
  month: string;
  week: string;
  months: RangeOption[];
  weeks: RangeOption[];
};

const PRESETS: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "14d", label: "14 days", days: 14 },
  { key: "1m", label: "1 month", days: 30 },
  { key: "2m", label: "2 months", days: 60 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "4m", label: "4 months", days: 120 },
];

function isYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function monthKey(ymd: string) {
  return ymd.slice(0, 7);
}

function monthName(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function shortDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function monthWindow(ym: string, anchor: string) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [year, month] = ym.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  const since = `${ym}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${ym}-${String(last).padStart(2, "0")}`;
  if (!isYmd(since) || since > anchor) return null;
  return { since, until: end > anchor ? anchor : end };
}

function weekWindow(value: string, anchor: string) {
  if (!isYmd(value)) return null;
  const since = startOfWeek(value);
  const end = addDays(since, 6);
  if (since > anchor) return null;
  return { since, until: end > anchor ? anchor : end };
}

function preset(key: RangeKey, anchor: string) {
  const match = PRESETS.find((item) => item.key === key);
  if (!match) return null;
  return {
    key,
    label: match.label,
    since: addDays(anchor, -(match.days - 1)),
    until: anchor,
  };
}

function withPrevious(
  window: { key: RangeKey; label: string; since: string; until: string },
  anchor: string,
  month: string,
  week: string,
): ResolvedRange {
  let previousSince = addDays(window.since, -inclusiveDays(window.since, window.until));
  let previousUntil = addDays(window.since, -1);
  let comparison: "month" | "previous" = "previous";
  const sameMonth = window.since.slice(0, 7) === window.until.slice(0, 7);
  if (window.key === "week") {
    previousSince = addDays(window.since, -7);
    previousUntil = addDays(window.since, -1);
  } else if (window.key === "month" || sameMonth) {
    previousSince = shiftMonths(window.since, -1);
    previousUntil = shiftMonths(window.until, -1);
    comparison = "month";
  }
  const months = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 - index, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value, label: monthName(value) };
  });
  const weeks = Array.from({ length: 16 }, (_, index) => {
    const since = addDays(startOfWeek(anchor), -7 * index);
    const until = addDays(since, 6);
    const end = until > anchor ? anchor : until;
    return { value: since, label: `${shortDate(since)} – ${shortDate(end)}` };
  });
  return {
    ...window,
    previousSince,
    previousUntil,
    comparison,
    month,
    week,
    months,
    weeks,
  };
}

export function resolveRange(
  anchor: string,
  input: { range?: string; month?: string; week?: string; from?: string; to?: string },
): ResolvedRange {
  const fallback = preset("1m", anchor)!;
  const monthChoice = input.month ? monthWindow(input.month, anchor) : null;
  const weekChoice = input.week ? weekWindow(input.week, anchor) : null;

  if (input.range === "month" && monthChoice) {
    return withPrevious(
      { key: "month", label: monthName(input.month!), since: monthChoice.since, until: monthChoice.until },
      anchor,
      input.month!,
      weekChoice?.since ?? startOfWeek(anchor),
    );
  }
  if (input.range === "week" && weekChoice) {
    return withPrevious(
      {
        key: "week",
        label: `Week of ${shortDate(weekChoice.since)}`,
        since: weekChoice.since,
        until: weekChoice.until,
      },
      anchor,
      monthKey(anchor),
      weekChoice.since,
    );
  }
  if (input.range === "custom" && input.from && input.to && isYmd(input.from) && isYmd(input.to)) {
    let since = input.from;
    let until = input.to;
    if (since > until) [since, until] = [until, since];
    if (since > anchor) since = anchor;
    if (until > anchor) until = anchor;
    return withPrevious(
      { key: "custom", label: "Custom", since, until },
      anchor,
      monthKey(until),
      startOfWeek(until),
    );
  }
  const rolling = preset((input.range as RangeKey) ?? "1m", anchor) ?? fallback;
  return withPrevious(rolling, anchor, monthKey(anchor), startOfWeek(anchor));
}
