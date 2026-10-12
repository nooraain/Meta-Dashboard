import { signOut } from "@/auth";
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
  const toneClass = tone === "pine" ? "bg-pine text-pine" : tone === "sea" ? "bg-sea text-sea" : "bg-clay text-clay";
  return (
    <div className="min-w-0 flex-1 rounded-md border border-line bg-card">
      <div className={`h-1 rounded-t-md ${toneClass.split(" ")[0]}`} />
      <div className="px-4 py-5 sm:px-5">
      <p className={`text-xs uppercase tracking-[0.16em] ${toneClass.split(" ")[1]}`}>{label}</p>
      <p className="mt-3 font-mono text-3xl tracking-tight text-ink">{value}</p>
      <p className={`mt-2 text-sm ${improved == null ? "text-muted" : improved ? "text-up" : "text-down"}`}>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg text-ink">{value}</p>
    </div>
  );
}

function periodFacts(period: Period) {
  const cpa = ratio(period.spend, period.demos);
  const cpl = ratio(period.spend, period.leadForms);
  const cpm = period.impressions ? (period.spend / period.impressions) * 1000 : null;
  return { cpa, cpl, cpm };
}

function RefreshForm({ label }: { label: string }) {
  return (
    <form action="/api/cron/refresh" method="post">
      <button
        className="rounded-md border border-pine bg-pine px-4 py-2 text-sm text-card"
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
      <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-pine">TaxGPT</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Ads</h1>
          <p className="mt-2 text-sm text-muted">
            Meta account 984644083020099 · Pacific time
            {current ? ` · refreshed ${stamp(current.refreshedAt)}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">{email}</p>
          {data.status !== "unconfigured" ? (
            <form action="/api/cron/refresh" method="post">
              <button className="mt-2 text-sm text-pine underline decoration-pine/40 underline-offset-4" type="submit">
                Refresh
              </button>
            </form>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button className="mt-2 text-sm text-muted underline decoration-line underline-offset-4" type="submit">
              Sign out
            </button>
          </form>
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
        <main className="mt-8 flex flex-col gap-10">
          <RangeFilters range={data.range} />
          {data.notice && current.demos != null ? <p className="text-sm text-down">{data.notice}</p> : null}
          {!data.hasTotals ? (
            <p className="text-sm text-muted">No Meta days are stored for this range yet.</p>
          ) : null}
          {data.hasTotals ? (
          <>
          <section>
            <p className="text-sm text-muted">
              {data.range.label} · {pretty(current.since)} – {pretty(current.until)}
              {previous ? ` · compared with ${pretty(previous.since)} – ${pretty(previous.until)}` : ""}
            </p>
            {data.range.totalsFrom === "stored" && data.range.storedDays < data.range.spanDays ? (
              <p className="mt-2 text-sm text-muted">
                Totals include {data.range.storedDays} of {data.range.spanDays} stored days, so a longer range can show the same number.
              </p>
            ) : null}
            {current.demos == null ? (
              <p className="mt-4 rounded-md border border-warn-line bg-warn px-4 py-3 text-sm text-warn-ink">
                {data.notice
                  ? `${data.notice} Spend is already from Meta.`
                  : data.range.totalsFrom === "stored" && data.range.storedDays < data.range.spanDays
                    ? "Demos and CPA stay blank until every day in this range is stored. Spend shown is only the days already saved."
                    : "Demos and CPA stay blank until Amplitude returns the Facebook unique count. Spend is already from Meta."}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <Metric
                label="Spend"
                tone="pine"
                value={money(current.spend, currency)}
                previous={previous ? money(previous.spend, currency) : null}
              />
              <Metric
                label="Demos"
                tone="sea"
                value={current.demos == null ? "—" : integer(current.demos)}
                previous={previous?.demos == null ? null : integer(previous.demos)}
                better="up"
              />
              <Metric
                label="CPA"
                tone="clay"
                value={currentFacts.cpa == null ? "—" : money(currentFacts.cpa, currency)}
                previous={previousFacts?.cpa == null ? null : money(previousFacts.cpa, currency)}
                better="down"
              />
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
              Demos are unique Demo Booked users whose initial source is facebook, excluding the random Calendly cohort and the email taxgpt. CPA divides Meta spend by that unique total. Daily uniques are not added together.
            </p>
          </section>

          <section className="grid grid-cols-2 gap-4 rounded-md border border-line bg-card px-5 py-5 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Impressions" value={integer(current.impressions)} />
            <Fact label="Link clicks" value={integer(current.linkClicks)} />
            <Fact label="Reach" value={current.reach == null ? "—" : integer(current.reach)} />
            <Fact label="Lead forms" value={integer(current.leadForms)} />
            <Fact label="CPL" value={currentFacts.cpl == null ? "—" : money(currentFacts.cpl, currency)} />
            <Fact label="CPM" value={currentFacts.cpm == null ? "—" : money(currentFacts.cpm, currency)} />
          </section>
          <p className="-mt-6 text-sm text-muted">
            {current.reach == null
              ? "Reach stays blank on this range. It is the people reached in one Meta window, not a sum of daily reach."
              : "Reach is the people reached in this window. It is not a sum of daily reach."}
          </p>

          <section>
            <h2 className="text-lg font-semibold">Daily spend</h2>
            {data.days.length ? (
              <>
                <div className="mt-4 flex h-52 items-end gap-1 rounded-md bg-pine-soft px-3 pb-3 pt-8">
                  {data.days.map((day) => (
                    <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      {data.days.length <= 16 ? (
                        <span className="text-[10px] leading-none text-pine">{shortMoney(day.spend)}</span>
                      ) : null}
                      <div
                        className="w-full rounded-t-sm bg-pine"
                        style={{
                          height: `${Math.max(4, (day.spend / maxSpend) * (data.days.length <= 16 ? 78 : 100))}%`,
                          opacity: 0.45 + 0.55 * (day.spend / maxSpend),
                        }}
                        title={`${pretty(day.day)} ${money(day.spend, currency)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted">
                  <span>{pretty(data.days[0].day)}</span>
                  <span>{pretty(data.days[data.days.length - 1].day)}</span>
                </div>
                <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-line bg-card">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 border-b border-line bg-card text-xs uppercase tracking-[0.14em] text-muted">
                      <tr>
                        <th className="px-4 py-3 font-medium">Day</th>
                        <th className="px-4 py-3 text-right font-medium">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.days].reverse().map((day) => (
                        <tr key={day.day} className="border-b border-line last:border-0">
                          <td className="px-4 py-2">{pretty(day.day)}</td>
                          <td className="px-4 py-2 text-right font-mono text-pine">{money(day.spend, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Daily bars appear as the refresh stores each day. The totals above already cover the full window.</p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Campaign spend</h2>
            <p className="mt-1 text-sm text-muted">Spend only. Campaign names do not match demo sources, so there is no campaign CPA.</p>
            <div className="mt-4 overflow-x-auto rounded-md border border-line bg-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 text-right font-medium">Spend</th>
                    <th className="px-4 py-3 text-right font-medium">Impressions</th>
                    <th className="px-4 py-3 text-right font-medium">Clicks</th>
                    <th className="px-4 py-3 text-right font-medium">Link clicks</th>
                    <th className="px-4 py-3 text-right font-medium">Lead forms</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.campaignId} className="border-b border-line last:border-0">
                      <td className="max-w-[280px] truncate px-4 py-3">{campaign.campaignName || campaign.campaignId}</td>
                      <td className="px-4 py-3 text-right font-mono text-pine">{money(campaign.spend, currency)}</td>
                      <td className="px-4 py-3 text-right font-mono">{integer(campaign.impressions)}</td>
                      <td className="px-4 py-3 text-right font-mono">{integer(campaign.clicks)}</td>
                      <td className="px-4 py-3 text-right font-mono">{integer(campaign.linkClicks)}</td>
                      <td className="px-4 py-3 text-right font-mono">{integer(campaign.leadForms)}</td>
                    </tr>
                  ))}
                  {data.campaigns.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-muted" colSpan={6}>
                        Campaign rows appear after the first daily refresh.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          </>
          ) : null}
        </main>
      ) : null}
    </div>
  );
}
