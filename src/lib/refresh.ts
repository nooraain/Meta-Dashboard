import { facebookUniques } from "@/lib/amplitude";
import { ACCOUNT_ID } from "@/lib/constants";
import { addDays, ymdInZone } from "@/lib/dates";
import { db, ensureSchema } from "@/lib/db";
import { accountInfo, insights, metrics } from "@/lib/meta";
import { planWindows, type Window } from "@/lib/windows";

type AccountDay = {
  day: string;
  account_id: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  lead_forms: number;
  reach: number;
  demos: number | null;
  currency: string;
  refreshed_at: string;
};

type CampaignDay = {
  day: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  lead_forms: number;
  currency: string;
  refreshed_at: string;
};

async function earliestDay() {
  const sql = db();
  if (!sql) return null;
  const rows = await sql<{ day: string | null }[]>`
    SELECT min(day)::text AS day FROM account_days WHERE account_id = ${ACCOUNT_ID}
  `;
  return rows[0]?.day ?? null;
}

async function saveDays(window: Window, currency: string, refreshedAt: string) {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  const [accountRows, campaignRows, uniques] = await Promise.all([
    insights({ level: "account", since: window.since, until: window.until, timeIncrement: 1 }),
    insights({ level: "campaign", since: window.since, until: window.until, timeIncrement: 1 }),
    facebookUniques(window.since, window.until).catch(() => null),
  ]);

  const days: AccountDay[] = accountRows
    .filter((row) => row.date_start)
    .map((row) => {
      const counted = metrics(row);
      return {
        day: row.date_start as string,
        account_id: ACCOUNT_ID,
        spend: counted.spend,
        impressions: counted.impressions,
        clicks: counted.clicks,
        link_clicks: counted.linkClicks,
        lead_forms: counted.leadForms,
        reach: counted.reach,
        demos: uniques?.byDate[row.date_start as string] ?? null,
        currency,
        refreshed_at: refreshedAt,
      };
    });

  const campaigns: CampaignDay[] = campaignRows
    .filter((row) => row.date_start && row.campaign_id)
    .map((row) => {
      const counted = metrics(row);
      return {
        day: row.date_start as string,
        account_id: ACCOUNT_ID,
        campaign_id: row.campaign_id as string,
        campaign_name: row.campaign_name || "",
        spend: counted.spend,
        impressions: counted.impressions,
        clicks: counted.clicks,
        link_clicks: counted.linkClicks,
        lead_forms: counted.leadForms,
        currency,
        refreshed_at: refreshedAt,
      };
    });

  if (days.length) {
    await sql`
      INSERT INTO account_days ${sql(days)}
      ON CONFLICT (day, account_id) DO UPDATE SET
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        link_clicks = EXCLUDED.link_clicks,
        lead_forms = EXCLUDED.lead_forms,
        reach = EXCLUDED.reach,
        demos = COALESCE(EXCLUDED.demos, account_days.demos),
        currency = EXCLUDED.currency,
        refreshed_at = EXCLUDED.refreshed_at
    `;
  }

  if (campaigns.length) {
    await sql`
      INSERT INTO campaign_days ${sql(campaigns)}
      ON CONFLICT (day, campaign_id) DO UPDATE SET
        account_id = EXCLUDED.account_id,
        campaign_name = EXCLUDED.campaign_name,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        link_clicks = EXCLUDED.link_clicks,
        lead_forms = EXCLUDED.lead_forms,
        currency = EXCLUDED.currency,
        refreshed_at = EXCLUDED.refreshed_at
    `;
  }

  return { days: days.length, campaigns: campaigns.length };
}

async function savePeriod(period: string, window: Window, currency: string, refreshedAt: string) {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  const [rows, uniques] = await Promise.all([
    insights({ level: "account", since: window.since, until: window.until }),
    facebookUniques(window.since, window.until).catch(() => null),
  ]);
  const counted = metrics(rows[0] ?? {});
  const snapshot = {
    period,
    account_id: ACCOUNT_ID,
    since: window.since,
    until: window.until,
    spend: counted.spend,
    impressions: counted.impressions,
    clicks: counted.clicks,
    link_clicks: counted.linkClicks,
    reach: counted.reach,
    demos: uniques?.total ?? null,
    lead_forms: counted.leadForms,
    currency,
    refreshed_at: refreshedAt,
  };
  await sql`
    INSERT INTO period_snapshots ${sql([snapshot])}
    ON CONFLICT (period, account_id) DO UPDATE SET
      since = EXCLUDED.since,
      until = EXCLUDED.until,
      spend = EXCLUDED.spend,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      link_clicks = EXCLUDED.link_clicks,
      reach = EXCLUDED.reach,
      demos = COALESCE(EXCLUDED.demos, period_snapshots.demos),
      lead_forms = EXCLUDED.lead_forms,
      currency = EXCLUDED.currency,
      refreshed_at = EXCLUDED.refreshed_at
  `;
}

export async function refreshAds() {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL is not set");
  if (!process.env.META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN is not set");
  await ensureSchema(sql);

  const [{ locked }] = await sql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(984644083020099) AS locked
  `;
  if (!locked) return { skipped: true as const };

  try {
    const account = await accountInfo();
    const today = ymdInZone(new Date(), account.timezone);
    const until = addDays(today, -1);
    const plan = planWindows(until, await earliestDay());
    const refreshedAt = new Date().toISOString();
    for (const period of plan.periods) {
      await savePeriod(period.period, period, account.currency, refreshedAt);
    }
    const recent = await saveDays(plan.recent, account.currency, refreshedAt);
    const backfill = plan.backfill
      ? await saveDays(plan.backfill, account.currency, refreshedAt)
      : null;
    return {
      skipped: false as const,
      accountId: account.id,
      today,
      until,
      recent,
      backfill,
      amplitude: Boolean(process.env.AMPLITUDE_API_KEY && process.env.AMPLITUDE_SECRET),
    };
  } finally {
    await sql`SELECT pg_advisory_unlock(984644083020099)`;
  }
}
