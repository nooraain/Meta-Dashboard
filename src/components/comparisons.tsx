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
    <section className="rounded-2xl border border-line/80 bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{caption}</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line/80">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line bg-pine-soft/50 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3.5 font-semibold">Metric</th>
              <th className="px-4 py-3.5 text-right font-semibold">{earlier}</th>
              <th className="px-4 py-3.5 text-right font-semibold">{later}</th>
              <th className="px-4 py-3.5 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const delta = deltaText(row.delta, row.better);
              return (
                <tr
                  key={row.label}
                  className={`border-b border-line/80 last:border-0 ${
                    index % 2 === 0 ? "bg-card" : "bg-pine-soft/30"
                  }`}
                >
                  <td className="px-4 py-3.5 font-medium text-ink">{row.label}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-ink/90">{row.earlier}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-medium text-ink">{row.later}</td>
                  <td className={`px-4 py-3.5 text-right font-mono ${delta.className}`}>{delta.text}</td>
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

function cpm(campaign: CampaignTotal) {
  if (!campaign.impressions) return null;
  return (campaign.spend / campaign.impressions) * 1000;
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
    <div className="min-w-0 flex-1 rounded-xl border border-line/80 bg-card px-4 py-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-ink">{name}</p>
      <p className="mt-1 font-mono text-sm font-medium text-sea">{detail}</p>
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
  const currentCpa = ratio(current.demoSpend ?? current.spend, current.demos);
  const previousCpa = previous ? ratio(previous.demoSpend ?? previous.spend, previous.demos) : null;
  const currentCpm = current.impressions ? (current.spend / current.impressions) * 1000 : null;
  const previousCpm = previous?.impressions ? (previous.spend / previous.impressions) * 1000 : null;
  const currentCpl = ratio(current.leadSpend, current.leadForms);
  const previousCpl = previous ? ratio(previous.leadSpend, previous.leadForms) : null;
  const currentCtr = current.impressions ? current.linkClicks / current.impressions : null;
  const previousCtr = previous?.impressions ? previous.linkClicks / previous.impressions : null;
  const formatCtr = (value: number) => `${(value * 100).toFixed(2)}%`;
  const earlier = previous ? windowLabel(previous.since, previous.until) : "Earlier";
  const later = windowLabel(current.since, current.until);
  const basis =
    range.comparison === "month"
      ? `Follows the ${range.label} filter. The earlier column is the same calendar days in the previous month.`
      : range.key === "week"
        ? "Follows the selected week. The earlier column is the previous week."
        : `Follows the ${range.label} filter. The earlier column is the previous window of the same length.`;
  const show = (value: number | null, format: (value: number) => string) => (value == null ? "—" : format(value));

  return (
    <div className="flex flex-col gap-8">
      <CompareTable
        title="Demo Performance"
        caption={`${basis} Change is the later window against the earlier one. Demos match Amplitude Meta demos booked: unique Demo Booked users with initial utm source facebook. Spend in this table is demo-campaign spend only (lead campaigns excluded). CPA is that spend divided by demos. CTR is link clicks divided by impressions.`}
        earlier={earlier}
        later={later}
        rows={[
          {
            label: "Spend",
            earlier: show(previous?.demoSpend ?? previous?.spend ?? null, (value) => money(value, currency)),
            later: show(current.demoSpend ?? current.spend, (value) => money(value, currency)),
            delta: change(current.demoSpend ?? current.spend, previous?.demoSpend ?? previous?.spend ?? null),
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
            label: "CTR",
            earlier: show(previousCtr, formatCtr),
            later: show(currentCtr, formatCtr),
            delta: change(currentCtr, previousCtr),
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
        title="Leads Performance (Meta)"
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
      <CompareTable
        title="Leads to Demo Booked (Amplitude)"
        caption="Matches Amplitude Meta Leads Campaign to Demos Booked: unique Lead Email Collected (Meta lead signup_source), then demo_booked within 30 days, excluding emails containing taxgpt or usemomentic."
        earlier={earlier}
        later={later}
        rows={[
          {
            label: "Lead emails",
            earlier: show(previous?.funnelLeadEmails ?? null, integer),
            later: show(current.funnelLeadEmails, integer),
            delta: change(current.funnelLeadEmails, previous?.funnelLeadEmails ?? null),
            better: "up",
          },
          {
            label: "Demos booked",
            earlier: show(previous?.funnelDemos ?? null, integer),
            later: show(current.funnelDemos, integer),
            delta: change(current.funnelDemos, previous?.funnelDemos ?? null),
            better: "up",
          },
          {
            label: "Conversion",
            earlier: show(
              ratio(previous?.funnelDemos ?? null, previous?.funnelLeadEmails ?? null),
              (value) => `${(value * 100).toFixed(2)}%`,
            ),
            later: show(
              ratio(current.funnelDemos, current.funnelLeadEmails),
              (value) => `${(value * 100).toFixed(2)}%`,
            ),
            delta: change(
              ratio(current.funnelDemos, current.funnelLeadEmails),
              previous ? ratio(previous.funnelDemos, previous.funnelLeadEmails) : null,
            ),
            better: "up",
          },
        ]}
      />
    </div>
  );
}

export function CampaignBoard({
  campaigns,
  currency,
  since,
  until,
}: {
  campaigns: CampaignTotal[];
  currency: string;
  since: string;
  until: string;
}) {
  const { listed, topDemos, topSpend, bestCpa } = ranked(campaigns);
  return (
    <section className="rounded-2xl border border-line/80 bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-ink">Top campaigns</h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">
        Ranked for {windowLabel(since, until)}, the dates selected above. Demo campaigns only; lead campaigns are excluded. Demos are Meta’s demo_booked results on that campaign. CPA divides campaign spend by those results. CPM is spend per 1,000 impressions.
      </p>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row">
        <Highlight
          label="Most demos"
          name={topDemos?.campaignName || "—"}
          detail={topDemos?.demos == null ? "—" : `${integer(topDemos.demos)} demos`}
        />
        <Highlight
          label="Most spend"
          name={topSpend?.campaignName || "—"}
          detail={topSpend ? money(topSpend.spend, currency) : "—"}
        />
        <Highlight
          label="Best CPA"
          name={bestCpa?.campaignName || "—"}
          detail={bestCpa && cpa(bestCpa) != null ? money(cpa(bestCpa) as number, currency) : "—"}
        />
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line/80">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line bg-pine-soft/50 text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-3.5 font-semibold">Campaign</th>
              <th className="px-4 py-3.5 text-right font-semibold">Spend</th>
              <th className="px-4 py-3.5 text-right font-semibold">Demos</th>
              <th className="px-4 py-3.5 text-right font-semibold">CPA</th>
              <th className="px-4 py-3.5 text-right font-semibold">CPM</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((campaign, index) => {
              const cost = cpa(campaign);
              const mille = cpm(campaign);
              const marks = [
                campaign.campaignId === topDemos?.campaignId ? "Most demos" : "",
                campaign.campaignId === topSpend?.campaignId ? "Most spend" : "",
                campaign.campaignId === bestCpa?.campaignId ? "Best CPA" : "",
              ].filter(Boolean);
              return (
                <tr
                  key={campaign.campaignId}
                  className={`border-b border-line/80 last:border-0 ${
                    index % 2 === 0 ? "bg-card" : "bg-pine-soft/30"
                  }`}
                >
                  <td className="max-w-[360px] px-4 py-3.5">
                    <p className="truncate font-medium text-ink">{campaign.campaignName || campaign.campaignId}</p>
                    {marks.length ? <p className="mt-1 text-xs text-sea/90">{marks.join(" · ")}</p> : null}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-ink">{money(campaign.spend, currency)}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{campaign.demos == null ? "—" : integer(campaign.demos)}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{cost == null ? "—" : money(cost, currency)}</td>
                  <td className="px-4 py-3.5 text-right font-mono">{mille == null ? "—" : money(mille, currency)}</td>
                </tr>
              );
            })}
            {listed.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted" colSpan={5}>
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
