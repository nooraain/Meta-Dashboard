import { signOut } from "@/auth";
import { CampaignBoard, PerformanceComparison } from "@/components/comparisons";
import { RangeFilters } from "@/components/range-filters";
import type { DashboardModel, Period } from "@/lib/dashboard";
import { TIME_ZONE } from "@/lib/constants";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function integer(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortMoney(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function barMoney(value: number, currency: string, compact: boolean) {
  if (compact) return shortMoney(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function pretty(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function stamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ratio(numerator: number, denominator: number | null) {
  if (denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function change(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

function Metric({
  label,
  value,
  previous,
  better,
  tone,
}: {
  label: string;
  value: string;
  previous: string | null;
  better?: "up" | "down";
  tone: "pine" | "sea" | "clay";
}) {
  const delta = change(
    value === "—" ? null : Number(value.replace(/[^0-9.-]/g, "")),
    previous == null || previous === "—" ? null : Number(previous.replace(/[^0-9.-]/g, "")),
  );
  const improved = delta != null && better ? (better === "up" ? delta > 0 : delta < 0) : null;
  const accent =
    tone === "pine" ? "from-pine to-pine-dark" : tone === "sea" ? "from-sea to-clay" : "from-clay to-sea";
  const labelTone = tone === "pine" ? "text-pine-dark" : tone === "sea" ? "text-sea" : "text-clay";
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-line/80 bg-card shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className={`h-0.5 rounded-t-xl bg-gradient-to-r ${accent}`} />
      <div className="px-4 py-5 sm:px-5">
        <p className={`text-[11px] font-medium uppercase tracking-[0.14em] ${labelTone}`}>{label}</p>
        <p className="mt-3 font-mono text-2xl font-medium tracking-tight text-ink sm:text-[1.65rem]">{value}</p>
        <p
          className={`mt-2 text-xs leading-relaxed sm:text-sm ${
            improved == null ? "text-muted" : improved ? "font-medium text-up" : "text-down"
          }`}
        >
          {value === "—"
            ? "Waiting on Amplitude"
            : delta == null
              ? "No previous window"
              : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}% vs previous period`}
        </p>
      </div>
    </div>
  );
}

function periodFacts(period: Period) {
  const cpa = ratio(period.demoSpend ?? period.spend, period.demos);
  return { cpa };
}

function RefreshForm({ label }: { label: string }) {
  return (
    <form action="/api/cron/refresh" method="post">
      <button
        className="rounded-lg bg-gradient-to-r from-pine to-pine-dark px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95"
        type="submit"
      >
        {label}
      </button>
    </form>
  );
}

export function Dashboard({
  data,
  email,
  error,
}: {
  data: DashboardModel;
  email: string;
  error?: string;
}) {
  const current = data.current;
  const previous = data.previous;
  const currency = current?.currency ?? "USD";
  const currentFacts = current ? periodFacts(current) : null;
  const previousFacts = previous ? periodFacts(previous) : null;
  const maxSpend = Math.max(...data.days.map((day) => day.spend), 1);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-line/80 bg-card/90 px-5 py-6 shadow-[var(--shadow-card)] backdrop-blur-sm sm:px-7">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine">TaxGPT</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              Meta reporting dashboard
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Account <span className="font-mono text-xs text-ink/80">984644083020099</span>
              <span className="mx-1.5 text-line">·</span>
              Pacific time
              {current ? (
                <>
                  <span className="mx-1.5 text-line">·</span>
                  Refreshed {stamp(current.refreshedAt)}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <p className="text-sm text-muted">{email}</p>
            <div className="flex flex-wrap items-center gap-3">
              {data.status !== "unconfigured" ? (
                <form action="/api/cron/refresh" method="post">
                  <button
                    className="rounded-lg border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink shadow-sm transition-colors hover:border-pine/40 hover:text-pine"
                    type="submit"
                  >
                    Refresh data
                  </button>
                </form>
              ) : null}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/sign-in" });
                }}
              >
                <button
                  className="text-sm text-muted transition-colors hover:text-ink"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {data.status === "unconfigured" ? (
        <section className="mt-10 max-w-xl">
          <h2 className="text-xl font-semibold">Database is not connected</h2>
          <p className="mt-3 text-muted">
            Add DATABASE_URL, then refresh. Spend shows up from Meta after that run.
          </p>
        </section>
      ) : null}

      {error ? <p className="mt-6 max-w-xl text-sm text-down">{error}</p> : null}

      {data.status === "empty" ? (
        <section className="mt-10 max-w-xl">
          <h2 className="text-xl font-semibold">Meta numbers are not stored yet</h2>
          <p className="mt-3 text-muted">
            Pull spend, impressions, clicks, reach, and lead forms from Meta now. The daily job also runs at 6:15am Pacific.
          </p>
          <div className="mt-6">
            <RefreshForm label="Refresh from Meta" />
          </div>
        </section>
      ) : null}

      {data.status === "ready" && data.range && current && currentFacts ? (
        <main className="mt-8 flex flex-col gap-12">
          <RangeFilters range={data.range} />
          {data.notice && current.demos != null ? <p className="text-sm text-down">{data.notice}</p> : null}
          {!data.hasTotals ? (
            <p className="text-sm text-muted">No Meta days are stored for this range yet.</p>
          ) : null}
          {data.hasTotals ? (
          <>
          <section>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-line bg-card px-3 py-1 font-medium text-ink shadow-sm">
                {data.range.label}
              </span>
              <span className="text-muted">
                {pretty(current.since)} – {pretty(current.until)}
                {previous ? ` vs ${pretty(previous.since)} – ${pretty(previous.until)}` : ""}
              </span>
            </div>
            {data.range.totalsFrom === "stored" && data.range.storedDays < data.range.spanDays ? (
              <p className="mt-2 text-sm text-muted">
                Totals include {data.range.storedDays} of {data.range.spanDays} stored days, so a longer range can show the same number.
              </p>
            ) : null}
            {current.demos == null ? (
              <p className="mt-4 rounded-xl border border-warn-line bg-warn px-4 py-3 text-sm leading-relaxed text-warn-ink">
                {data.notice
                  ? `${data.notice} Spend is already from Meta.`
                  : data.range.totalsFrom === "stored" && data.range.storedDays < data.range.spanDays
                    ? "Demos and CPA stay blank until every day in this range is stored. Spend shown is only the days already saved."
                    : "Demos and CPA stay blank until Amplitude returns Meta demos booked (initial utm source facebook). Spend is already from Meta."}
              </p>
            ) : null}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Total Spend"
                tone="pine"
                value={money(current.spend, currency)}
                previous={previous ? money(previous.spend, currency) : null}
              />
              <Metric
                label="Demo Spend"
                tone="sea"
                value={money(current.demoSpend ?? current.spend, currency)}
                previous={previous ? money(previous.demoSpend ?? previous.spend, currency) : null}
              />
              <Metric
                label="Demos Booked"
                tone="clay"
                value={current.demos == null ? "—" : integer(current.demos)}
                previous={previous?.demos == null ? null : integer(previous.demos)}
                better="up"
              />
              <Metric
                label="CPA"
                tone="pine"
                value={currentFacts.cpa == null ? "—" : money(currentFacts.cpa, currency)}
                previous={previousFacts?.cpa == null ? null : money(previousFacts.cpa, currency)}
                better="down"
              />
              <Metric
                label="Lead to Demo Booked"
                tone="sea"
                value={current.funnelDemos == null ? "—" : integer(current.funnelDemos)}
                previous={previous?.funnelDemos == null ? null : integer(previous.funnelDemos)}
                better="up"
              />
            </div>
            <p className="mt-5 max-w-3xl rounded-xl border border-line/60 bg-pine-soft/60 px-4 py-3 text-sm leading-relaxed text-muted">
              Total Spend is all Meta campaigns; Demo Spend excludes lead campaigns. Demos Booked match Amplitude Meta
              demos (facebook utm, cohort exclusions). CPA is demo spend divided by those demos. Lead to Demo Booked is
              the Amplitude funnel: lead email collected (Meta) then demo_booked within 30 days.
            </p>
          </section>

          <PerformanceComparison range={data.range} current={current} previous={previous} currency={currency} />

          <section className="rounded-2xl border border-line/80 bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
            <h2 className="text-base font-semibold tracking-tight text-ink">Daily spend</h2>
            <p className="mt-1 text-sm text-muted">Account spend by day for the selected window.</p>
            {data.days.length ? (
              <>
                <div className="mt-5 overflow-x-auto rounded-xl border border-line/80 bg-pine-soft/80 p-2">
                  <div
                    className="flex h-60 items-end gap-0.5 px-2 pb-2 pt-1"
                    style={data.days.length > 20 ? { minWidth: `${data.days.length * 2.75}rem` } : undefined}
                  >
                    {data.days.map((day) => (
                      <div
                        key={day.day}
                        className="flex h-full min-w-[2.25rem] flex-1 flex-col items-center justify-end gap-1"
                        title={`${pretty(day.day)} · ${money(day.spend, currency)}`}
                      >
                        <span
                          className={`max-w-full truncate text-center font-mono leading-none text-ink ${
                            data.days.length > 28 ? "text-[8px]" : data.days.length > 16 ? "text-[9px]" : "text-[10px]"
                          }`}
                        >
                          {barMoney(day.spend, currency, data.days.length > 14)}
                        </span>
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-pine-dark to-pine"
                          style={{
                            height: `${Math.max(6, (day.spend / maxSpend) * 72)}%`,
                            opacity: 0.45 + 0.5 * (day.spend / maxSpend),
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>{pretty(data.days[0].day)}</span>
                  <span>{pretty(data.days[data.days.length - 1].day)}</span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Daily bars appear as the refresh stores each day. The totals above already cover the full window.</p>
            )}
          </section>

          <CampaignBoard
            campaigns={data.campaigns}
            currency={currency}
            since={current.since}
            until={current.until}
          />
          </>
          ) : null}
        </main>
      ) : null}
    </div>
  );
}
