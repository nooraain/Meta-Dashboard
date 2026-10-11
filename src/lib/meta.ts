import { ACCOUNT_ID, GRAPH_VERSION } from "@/lib/constants";

type Action = { action_type?: string; value?: string };

type Insight = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Action[];
  conversions?: Action[];
};

export type Metrics = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  leadForms: number;
  reach: number;
};

function redact(message: string) {
  return message.replace(/access_token=[^&\s"']+/gi, "access_token=redacted");
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumActions(list: Action[] | undefined, predicate: (type: string) => boolean) {
  return (list ?? []).reduce((total, item) => {
    return predicate(item.action_type ?? "") ? total + num(item.value) : total;
  }, 0);
}

function actionValue(row: Insight, predicate: (type: string) => boolean) {
  const fromConversions = sumActions(row.conversions, predicate);
  if (fromConversions) return fromConversions;
  return sumActions(row.actions, predicate);
}

export function metrics(row: Insight): Metrics {
  return {
    spend: Math.round(num(row.spend) * 100) / 100,
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    linkClicks: actionValue(row, (type) => type === "link_click"),
    leadForms: actionValue(
      row,
      (type) => type === "leadgen.other" || type === "onsite_conversion.lead_grouped",
    ),
    reach: num(row.reach),
  };
}

async function graph(path: string, params: Record<string, string>) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN is not set");
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const rows: Insight[] = [];
  let next: string | null = url.toString();
  while (next) {
    const response = await fetch(next, { cache: "no-store" });
    const body = (await response.json()) as {
      data?: Insight[];
      paging?: { next?: string };
      error?: { message?: string };
      name?: string;
      timezone_name?: string;
      currency?: string;
    };
    if (!response.ok) {
      throw new Error(redact(body.error?.message || "Meta request failed"));
    }
    if (Array.isArray(body.data)) {
      rows.push(...body.data);
      next = body.paging?.next || null;
      if (next) await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }
    return body;
  }
  return rows;
}

export async function accountInfo() {
  const body = (await graph(`act_${ACCOUNT_ID}`, {
    fields: "name,timezone_name,currency",
  })) as { name?: string; timezone_name?: string; currency?: string };
  return {
    id: ACCOUNT_ID,
    name: body.name || ACCOUNT_ID,
    timezone: body.timezone_name || "America/Los_Angeles",
    currency: body.currency || "USD",
  };
}

export async function insights(options: {
  level: "account" | "campaign";
  since: string;
  until: string;
  timeIncrement?: number;
}) {
  const params: Record<string, string> = {
    fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,actions,conversions",
    level: options.level,
    time_range: JSON.stringify({ since: options.since, until: options.until }),
    use_unified_attribution_setting: "true",
    limit: "500",
  };
  if (options.timeIncrement) params.time_increment = String(options.timeIncrement);
  return (await graph(`act_${ACCOUNT_ID}/insights`, params)) as Insight[];
}
