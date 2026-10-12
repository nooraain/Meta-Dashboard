import { facebookUniques } from "@/lib/amplitude";
import { ACCOUNT_ID, TIME_ZONE } from "@/lib/constants";
import { inclusiveDays, ymdInZone } from "@/lib/dates";
import { db, ensureSchema } from "@/lib/db";
import { campaignWindow, insights, leadFormWindow, metrics } from "@/lib/meta";
import { resolveRange, type ResolvedRange } from "@/lib/ranges";

export type Period = {
  period: string;
  since: string;
  until: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number | null;
  demos: number | null;
  leadForms: number;
  leadSpend: number | null;
  currency: string;
  refreshedAt: string;
};

export type DayPoint = { day: string; spend: number };

export type CampaignTotal = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  leadForms: number;
  demos: number | null;
};

export type DashboardRange = ResolvedRange & {
  spanDays: number;
  storedDays: number;
  fromSnapshot: boolean;
  totalsFrom: "meta" | "stored";
};

export type DashboardModel = {
  status: "unconfigured" | "empty" | "ready";
  range: DashboardRange | null;
  notice: string | null;
  hasTotals: boolean;
  current: Period | null;
  previous: Period | null;
  days: DayPoint[];
  campaigns: CampaignTotal[];
};

const empty: DashboardModel = {
  status: "empty",
  range: null,
  notice: null,
  hasTotals: false,
  current: null,
  previous: null,
  days: [],
  campaigns: [],
};

type SnapshotRow = {
  period: string;
  since: string;
  until: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  reach: number;
  demos: number | null;
  lead_forms: number;
  currency: string;
  refreshed_at: Date;
};

type TotalsRow = {
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  lead_forms: number;
  currency: string | null;
  refreshed_at: Date | null;
};

async function metaWindow(since: string, until: string) {
  const [rows, uniques, leads] = await Promise.all([
    insights({ level: "account", since, until }),
    facebookUniques(since, until).then(
      (value) => ({ value, error: null as string | null }),
      (error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : "Amplitude rejected the key",
      }),
    ),
    leadFormWindow(since, until).catch(() => null),
  ]);
  const counted = rows[0]
    ? metrics(rows[0])
    : { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, leadForms: 0, reach: 0 };
  return {
    ...counted,
    leadForms: leads?.leadForms ?? counted.leadForms,
    leadSpend: leads?.spend ?? null,
    demos: uniques.value?.total ?? null,
    amplitudeError: uniques.error,
  };
}

async function windowDemos(since: string, until: string, snapshots: SnapshotRow[], allowFetch: boolean) {
  const match = snapshots.find((row) => row.since === since && row.until === until);
  if (match) return match.demos;
  if (!allowFetch) return null;
  try {
    return (await facebookUniques(since, until))?.total ?? null;
  } catch {
    return null;
  }
}

function snapshotPeriod(row: SnapshotRow): Period {
  return {
    period: row.period,
    since: row.since,
    until: row.until,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    linkClicks: row.link_clicks,
    reach: row.reach,
    demos: row.demos,
    leadForms: row.lead_forms,
    leadSpend: null,
    currency: row.currency,
    refreshedAt: row.refreshed_at.toISOString(),
  };
}

export async function loadDashboard(input: {
  range?: string;
  month?: string;
  week?: string;
  from?: string;
  to?: string;
} = {}): Promise<DashboardModel> {
  const sql = db();
  if (!sql) return { ...empty, status: "unconfigured" };
  await ensureSchema(sql);

  const periods = await sql<SnapshotRow[]>`
    SELECT period, since::text AS since, until::text AS until,
      spend::float8 AS spend, impressions, clicks, link_clicks, reach, demos,
      lead_forms, currency, refreshed_at
    FROM period_snapshots
    WHERE account_id = ${ACCOUNT_ID}
  `;
  const latest = periods.find((row) => row.period === "last_30_days");
  const [{ day }] = await sql<{ day: string | null }[]>`
    SELECT max(day)::text AS day FROM account_days WHERE account_id = ${ACCOUNT_ID}
  `;
  const anchor = latest?.until ?? day ?? ymdInZone(new Date(), TIME_ZONE);
  if (!latest && !day) return empty;

  const range = resolveRange(anchor, input);
  const totals = async (since: string, until: string) => {
    const [row] = await sql<TotalsRow[]>`
      SELECT count(*)::int AS days,
        coalesce(sum(spend), 0)::float8 AS spend,
        coalesce(sum(impressions), 0)::int AS impressions,
        coalesce(sum(clicks), 0)::int AS clicks,
        coalesce(sum(link_clicks), 0)::int AS link_clicks,
        coalesce(sum(lead_forms), 0)::int AS lead_forms,
        max(currency) AS currency,
        max(refreshed_at) AS refreshed_at
      FROM account_days
      WHERE account_id = ${ACCOUNT_ID}
        AND day BETWEEN ${since} AND ${until}
    `;
    return row;
  };

  const spanDays = inclusiveDays(range.since, range.until);
  const currency = latest?.currency ?? "USD";
  const refreshedAt = new Date().toISOString();
  let notice: string | null = null;
  let totalsFrom: "meta" | "stored" = "meta";
  let current: Period;
  let previous: Period | null;

  try {
    const [live, previousLive] = await Promise.all([
      metaWindow(range.since, range.until),
      metaWindow(range.previousSince, range.previousUntil),
    ]);
    current = {
      period: range.key,
      since: range.since,
      until: range.until,
      spend: live.spend,
      impressions: live.impressions,
      clicks: live.clicks,
      linkClicks: live.linkClicks,
      reach: live.reach,
      demos: live.demos,
      leadForms: live.leadForms,
      leadSpend: live.leadSpend,
      currency,
      refreshedAt,
    };
    notice = live.amplitudeError ?? previousLive.amplitudeError;
    previous = {
      period: "previous",
      since: range.previousSince,
      until: range.previousUntil,
      spend: previousLive.spend,
      impressions: previousLive.impressions,
      clicks: previousLive.clicks,
      linkClicks: previousLive.linkClicks,
      reach: previousLive.reach,
      demos: previousLive.demos,
      leadForms: previousLive.leadForms,
      leadSpend: previousLive.leadSpend,
      currency,
      refreshedAt,
    };
  } catch (error) {
    totalsFrom = "stored";
    notice = error instanceof Error ? error.message : "Meta request failed";
    const currentSnapshot = periods.find((row) => row.since === range.since && row.until === range.until);
    const currentTotals = currentSnapshot ? null : await totals(range.since, range.until);
    const storedForWindow = currentSnapshot ? spanDays : (currentTotals?.days ?? 0);
    current = currentSnapshot
      ? snapshotPeriod(currentSnapshot)
      : {
          period: range.key,
          since: range.since,
          until: range.until,
          spend: currentTotals?.spend ?? 0,
          impressions: currentTotals?.impressions ?? 0,
          clicks: currentTotals?.clicks ?? 0,
          linkClicks: currentTotals?.link_clicks ?? 0,
          reach: null,
          demos: await windowDemos(range.since, range.until, periods, storedForWindow === spanDays),
          leadForms: currentTotals?.lead_forms ?? 0,
          leadSpend: null,
          currency: currentTotals?.currency ?? currency,
          refreshedAt: currentTotals?.refreshed_at?.toISOString() ?? latest?.refreshed_at.toISOString() ?? refreshedAt,
        };
    const previousSpan = inclusiveDays(range.previousSince, range.previousUntil);
    const previousSnapshot = periods.find(
      (row) => row.since === range.previousSince && row.until === range.previousUntil,
    );
    const previousTotals = previousSnapshot ? null : await totals(range.previousSince, range.previousUntil);
    const previousStored = previousSnapshot ? previousSpan : (previousTotals?.days ?? 0);
    previous =
      previousSnapshot || previousStored > 0
        ? previousSnapshot
          ? snapshotPeriod(previousSnapshot)
          : {
              period: "previous",
              since: range.previousSince,
              until: range.previousUntil,
              spend: previousTotals?.spend ?? 0,
              impressions: previousTotals?.impressions ?? 0,
              clicks: previousTotals?.clicks ?? 0,
              linkClicks: previousTotals?.link_clicks ?? 0,
              reach: null,
              demos: await windowDemos(
                range.previousSince,
                range.previousUntil,
                periods,
                previousStored === previousSpan,
              ),
              leadForms: previousTotals?.lead_forms ?? 0,
              leadSpend: null,
              currency: previousTotals?.currency ?? currency,
              refreshedAt: previousTotals?.refreshed_at?.toISOString() ?? refreshedAt,
            }
        : null;
  }

  const [storedRow] = await sql<{ days: number }[]>`
    SELECT count(*)::int AS days
    FROM account_days
    WHERE account_id = ${ACCOUNT_ID}
      AND day BETWEEN ${range.since} AND ${range.until}
  `;
  const storedDays = storedRow?.days ?? 0;
  const hasTotals = totalsFrom === "meta" || current.spend > 0 || current.impressions > 0 || storedDays > 0;

  const days = await sql<DayPoint[]>`
    SELECT day::text AS day, spend::float8 AS spend
    FROM account_days
    WHERE account_id = ${ACCOUNT_ID}
      AND day BETWEEN ${range.since} AND ${range.until}
    ORDER BY day
  `;
  const liveCampaigns = await campaignWindow(range.since, range.until).catch(() => null);
  let campaigns: CampaignTotal[];
  if (liveCampaigns) {
    campaigns = liveCampaigns
      .filter((row) => row.spend > 0)
      .map((row) => ({
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        linkClicks: row.linkClicks,
        leadForms: row.leadForms,
        demos: row.demos,
      }));
  } else {
    const stored = await sql<
      {
        campaign_id: string;
        campaign_name: string;
        spend: number;
        impressions: number;
        clicks: number;
        link_clicks: number;
        lead_forms: number;
      }[]
    >`
      SELECT campaign_id, max(campaign_name) AS campaign_name,
        sum(spend)::float8 AS spend,
        sum(impressions)::int AS impressions,
        sum(clicks)::int AS clicks,
        sum(link_clicks)::int AS link_clicks,
        sum(lead_forms)::int AS lead_forms
      FROM campaign_days
      WHERE account_id = ${ACCOUNT_ID}
        AND day BETWEEN ${range.since} AND ${range.until}
      GROUP BY campaign_id
      ORDER BY sum(spend) DESC
      LIMIT 20
    `;
    campaigns = stored.map((row) => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      linkClicks: row.link_clicks,
      leadForms: row.lead_forms,
      demos: null,
    }));
  }

  return {
    status: "ready",
    range: {
      ...range,
      spanDays,
      storedDays,
      fromSnapshot: totalsFrom === "stored" && current.reach != null,
      totalsFrom,
    },
    notice,
    hasTotals,
    current,
    previous,
    days,
    campaigns,
  };
}
