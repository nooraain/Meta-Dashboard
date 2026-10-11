import { facebookUniques } from "@/lib/amplitude";
import { ACCOUNT_ID, TIME_ZONE } from "@/lib/constants";
import { inclusiveDays, ymdInZone } from "@/lib/dates";
import { db, ensureSchema } from "@/lib/db";
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
};

export type DashboardRange = ResolvedRange & {
  spanDays: number;
  storedDays: number;
  fromSnapshot: boolean;
};

export type DashboardModel = {
  status: "unconfigured" | "empty" | "ready";
  range: DashboardRange | null;
  hasTotals: boolean;
  current: Period | null;
  previous: Period | null;
  days: DayPoint[];
  campaigns: CampaignTotal[];
};

const empty: DashboardModel = {
  status: "empty",
  range: null,
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
  const currentSnapshot = periods.find((row) => row.since === range.since && row.until === range.until);
  const currentTotals = currentSnapshot ? null : await totals(range.since, range.until);
  const storedDays = currentSnapshot ? spanDays : (currentTotals?.days ?? 0);
  const hasTotals = Boolean(currentSnapshot) || storedDays > 0;
  const currency = currentSnapshot?.currency ?? currentTotals?.currency ?? latest?.currency ?? "USD";
  const refreshedAt =
    currentSnapshot?.refreshed_at.toISOString() ??
    currentTotals?.refreshed_at?.toISOString() ??
    latest?.refreshed_at.toISOString() ??
    new Date().toISOString();
  const current: Period = currentSnapshot
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
        demos: await windowDemos(range.since, range.until, periods, storedDays === spanDays),
        leadForms: currentTotals?.lead_forms ?? 0,
        currency,
        refreshedAt,
      };

  const previousSpan = inclusiveDays(range.previousSince, range.previousUntil);
  const previousSnapshot = periods.find(
    (row) => row.since === range.previousSince && row.until === range.previousUntil,
  );
  const previousTotals = previousSnapshot ? null : await totals(range.previousSince, range.previousUntil);
  const previousStored = previousSnapshot ? previousSpan : (previousTotals?.days ?? 0);
  const previous: Period | null =
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
            currency: previousTotals?.currency ?? currency,
            refreshedAt: previousTotals?.refreshed_at?.toISOString() ?? refreshedAt,
          }
      : null;

  const days = await sql<DayPoint[]>`
    SELECT day::text AS day, spend::float8 AS spend
    FROM account_days
    WHERE account_id = ${ACCOUNT_ID}
      AND day BETWEEN ${range.since} AND ${range.until}
    ORDER BY day
  `;
  const campaigns = await sql<
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

  return {
    status: "ready",
    range: {
      ...range,
      spanDays,
      storedDays,
      fromSnapshot: Boolean(currentSnapshot),
    },
    hasTotals,
    current,
    previous,
    days,
    campaigns: campaigns.map((row) => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      linkClicks: row.link_clicks,
      leadForms: row.lead_forms,
    })),
  };
}
