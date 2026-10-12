import type { CampaignTotal, DashboardRange, Period } from "@/lib/dashboard";

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

function pretty(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function change(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / previous;
}

function ratio(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function windowLabel(since: string, until: string) {
  return `${pretty(since)} – ${pretty(until)}`;
}

function deltaText(delta: number | null, better?: "up" | "down") {
  if (delta == null) return { text: "—", className: "text-muted" };
  const text = `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`;
  if (!better || delta === 0) return { text, className: "text-ink" };
  const improved = better === "up" ? delta > 0 : delta < 0;
  return { text, className: improved ? "text-up" : "text-down" };
}

function CompareTable({
  title,
  caption,
  earlier,
  later,
  rows,
}: {
  title: string;
  caption: string;
  earlier: string;
  later: string;
  rows: {
    label: string;
    earlier: string;
    later: string;
    delta: number | null;
    better?: "up" | "down";
  }[];
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{caption}</p>
      <div className="mt-4 overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 text-right font-medium">{earlier}</th>
              <th className="px-4 py-3 text-right font-medium">{later}</th>
              <th className="px-4 py-3 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta = deltaText(row.delta, row.better);
              return (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.earlier}</td>
                  <td className="px-4 py-3 text-right font-mono">{row.later}</td>
                  <td className={`px-4 py-3 text-right font-mono ${delta.className}`}>{delta.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function cpa(campaign: CampaignTotal) {
  return ratio(campaign.spend, campaign.demos);
}

function ranked(campaigns: CampaignTotal[]) {
  const active = campaigns.filter((campaign) => campaign.spend > 0 || (campaign.demos ?? 0) > 0);
  const byDemos = [...active].sort((a, b) => (b.demos ?? -1) - (a.demos ?? -1) || b.spend - a.spend);
  const topDemos = byDemos.find((campaign) => (campaign.demos ?? 0) > 0) ?? null;
  const topSpend = [...active].sort((a, b) => b.spend - a.spend)[0] ?? null;
  const bestCpa =
    [...active].filter((campaign) => cpa(campaign) != null).sort((a, b) => (cpa(a) ?? Infinity) - (cpa(b) ?? Infinity))[0] ??
    null;
  const picked = new Set<string>();
  const listed: CampaignTotal[] = [];
  for (const campaign of [topDemos, topSpend, bestCpa, ...byDemos]) {
    if (!campaign || picked.has(campaign.campaignId)) continue;
    picked.add(campaign.campaignId);
    listed.push(campaign);
    if (listed.length >= 8) break;
  }
  return { listed, topDemos, topSpend, bestCpa };
}

function Highlight({
  label,
  name,
  detail,
}: {
  label: string;
  name: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-line bg-card px-4 py-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-ink">{name}</p>
      <p className="mt-1 font-mono text-sm text-pine">{detail}</p>
    </div>
  );
}

export function PerformanceComparison({
  range,
  current,
  previous,
  currency,
}: {
  range: DashboardRange;
  current: Period;
  previous: Period | null;
  currency: string;
}) {
  const currentCpa = ratio(current.spend, current.demos);
  const previousCpa = previous ? ratio(previous.spend, previous.demos) : null;
  const currentCpm = current.impressions ? (current.spend / current.impressions) * 1000 : null;
  const previousCpm = previous?.impressions ? (previous.spend / previous.impressions) * 1000 : null;
  const currentCpl = ratio(current.leadSpend, current.leadForms);
  const previousCpl = previous ? ratio(previous.leadSpend, previous.leadForms) : null;
  const earlier = previous ? windowLabel(previous.since, previous.until) : "Earlier";
  const later = windowLabel(current.since, current.until);
  const basis =
    range.comparison === "month"
      ? "Same dates in the previous month."
      : "The previous window of the same length.";
  const show = (value: number | null, format: (value: number) => string) => (value == null ? "—" : format(value));

  return (
    <>
      <CompareTable
        title="Performance"
        caption={`${basis} Change is the later window against the earlier one. CPA is account spend divided by Facebook demo uniques.`}
        earlier={earlier}
        later={later}
        rows={[
          {
            label: "Spend",
            earlier: previous ? money(previous.spend, currency) : "—",
            later: money(current.spend, currency),
            delta: change(current.spend, previous?.spend ?? null),
          },
          {
            label: "Demos",
            earlier: show(previous?.demos ?? null, integer),
            later: show(current.demos, integer),
            delta: change(current.demos, previous?.demos ?? null),
            better: "up",
          },
          {
            label: "CPA",
            earlier: show(previousCpa, (value) => money(value, currency)),
            later: show(currentCpa, (value) => money(value, currency)),
            delta: change(currentCpa, previousCpa),
            better: "down",
          },
          {
            label: "CPM",
            earlier: show(previousCpm, (value) => money(value, currency)),
            later: show(currentCpm, (value) => money(value, currency)),
            delta: change(currentCpm, previousCpm),
            better: "down",
          },
          {
            label: "Impressions",
            earlier: previous ? integer(previous.impressions) : "—",
            later: integer(current.impressions),
            delta: change(current.impressions, previous?.impressions ?? null),
            better: "up",
          },
          {
            label: "Reach",
            earlier: show(previous?.reach ?? null, integer),
            later: show(current.reach, integer),
            delta: change(current.reach, previous?.reach ?? null),
            better: "up",
          },
        ]}
      />
      <CompareTable
        title="Lead performance"
        caption="Lead spend is spend from lead campaigns. Leads are Meta lead (form) results. Cost per lead divides that spend by those results."
        earlier={earlier}
        later={later}
        rows={[
          {
            label: "Spend",
            earlier: show(previous?.leadSpend ?? null, (value) => money(value, currency)),
            later: show(current.leadSpend, (value) => money(value, currency)),
            delta: change(current.leadSpend, previous?.leadSpend ?? null),
          },
          {
            label: "Leads",
            earlier: previous ? integer(previous.leadForms) : "—",
            later: integer(current.leadForms),
            delta: change(current.leadForms, previous?.leadForms ?? null),
            better: "up",
          },
          {
            label: "CPL",
            earlier: show(previousCpl, (value) => money(value, currency)),
            later: show(currentCpl, (value) => money(value, currency)),
            delta: change(currentCpl, previousCpl),
            better: "down",
          },
        ]}
      />
    </>
  );
}

export function CampaignBoard({
  campaigns,
  currency,
  unmatchedDemos,
}: {
  campaigns: CampaignTotal[];
  currency: string;
  unmatchedDemos: number | null;
}) {
  const { listed, topDemos, topSpend, bestCpa } = ranked(campaigns);
  const waiting = campaigns.every((campaign) => campaign.demos == null);
  return (
    <section>
      <h2 className="text-lg font-semibold">Top campaigns</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Demos are unique Demo Booked users whose initial campaign matches the Meta campaign. CPA is that campaign’s spend divided by those uniques.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row">
        <Highlight
          label="Most demos"
          name={topDemos?.campaignName || (waiting ? "Waiting on Amplitude" : "—")}
          detail={topDemos?.demos == null ? "—" : `${integer(topDemos.demos)} demos`}
        />
        <Highlight
          label="Most spend"
          name={topSpend?.campaignName || "—"}
          detail={topSpend ? money(topSpend.spend, currency) : "—"}
        />
        <Highlight
          label="Best CPA"
          name={bestCpa?.campaignName || (waiting ? "Waiting on Amplitude" : "—")}
          detail={bestCpa && cpa(bestCpa) != null ? money(cpa(bestCpa) as number, currency) : "—"}
        />
      </div>
      {unmatchedDemos ? (
        <p className="mt-3 text-sm text-muted">
          {integer(unmatchedDemos)} Facebook demos did not match a Meta campaign name or id, so they are left out of campaign CPA.
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-md border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-[0.14em] text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 text-right font-medium">Spend</th>
              <th className="px-4 py-3 text-right font-medium">Demos</th>
              <th className="px-4 py-3 text-right font-medium">CPA</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((campaign) => {
              const cost = cpa(campaign);
              const marks = [
                campaign.campaignId === topDemos?.campaignId ? "Most demos" : "",
                campaign.campaignId === topSpend?.campaignId ? "Most spend" : "",
                campaign.campaignId === bestCpa?.campaignId ? "Best CPA" : "",
              ].filter(Boolean);
              return (
                <tr key={campaign.campaignId} className="border-b border-line last:border-0">
                  <td className="max-w-[360px] px-4 py-3">
                    <p className="truncate">{campaign.campaignName || campaign.campaignId}</p>
                    {marks.length ? <p className="mt-1 text-xs text-pine">{marks.join(" · ")}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-pine">{money(campaign.spend, currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">{campaign.demos == null ? "—" : integer(campaign.demos)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cost == null ? "—" : money(cost, currency)}</td>
                </tr>
              );
            })}
            {listed.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted" colSpan={4}>
                  Campaign rows appear after Meta returns this window.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
