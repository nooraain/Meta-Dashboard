type AmplitudePoint = number | { value?: number };

export type DemoSeries = {
  byDate: Record<string, number>;
  total: number | null;
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function credential(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
    if (value) return value;
  }
  return "";
}

type Segmentation = {
  error?: string;
  data?: {
    series?: AmplitudePoint[][];
    xValues?: string[];
    seriesCollapsed?: AmplitudePoint[][];
  };
};

async function segment(since: string, until: string): Promise<Segmentation | null> {
  const key = credential("AMPLITUDE_API_KEY");
  const secret = credential("AMPLITUDE_SECRET", "AMPLITUDE_SECRET_KEY");
  if (!key || !secret) return null;

  const event = {
    event_type: "demo_booked",
    filters: [
      {
        subprop_type: "user",
        subprop_key: "gp:initial_utm_source",
        subprop_op: "is",
        subprop_value: ["facebook"],
      },
    ],
    group_by: [],
  };
  const filters = [
    { prop: "userdata_cohort", op: "is not", values: ["lwhxmcen"] },
    { prop: "gp:email", op: "is not", values: ["taxgpt"] },
  ];
  const url = new URL("https://amplitude.com/api/2/events/segmentation");
  url.searchParams.set("e", JSON.stringify(event));
  url.searchParams.set("s", JSON.stringify(filters));
  url.searchParams.set("start", since.replace(/-/g, ""));
  url.searchParams.set("end", until.replace(/-/g, ""));
  url.searchParams.set("m", "uniques");
  url.searchParams.set("i", "1");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
  });
  const body = (await response.json()) as Segmentation;
  if (!response.ok) {
    const detail = typeof body.error === "string" ? body.error.replace(/\s+/g, " ").slice(0, 160) : "";
    throw new Error(detail ? `Amplitude rejected the key (${response.status}): ${detail}` : `Amplitude rejected the key (${response.status})`);
  }
  return body;
}

export async function facebookUniques(since: string, until: string): Promise<DemoSeries | null> {
  const body = await segment(since, until);
  if (!body) return null;

  const series = body.data?.series?.[0] ?? [];
  const dates = body.data?.xValues ?? [];
  const collapsed = body.data?.seriesCollapsed?.[0]?.[0];
  const byDate: Record<string, number> = {};
  dates.forEach((value, index) => {
    const point = series[index];
    const count = point && typeof point === "object" ? point.value : point;
    byDate[String(value).slice(0, 10)] = num(count);
  });
  const total =
    collapsed && typeof collapsed === "object" && collapsed.value !== undefined
      ? num(collapsed.value)
      : collapsed !== undefined
        ? num(collapsed)
        : null;
  return { byDate, total };
}

const META_LEAD_SIGNUP_SOURCES = [
  "meta_ad_leads_ai_compliance_playbook",
  "meta_ad_leads_ai_checklist_for_tax_firms",
  "meta_lead_ad_agentic_tax_firms",
  "meta_lead_ad_guide_for_cpas",
  "meta_lead_ad_adopting_ai_agents",
  "meta_lead_ad_PDF",
  "meta_lead_ad",
];

const FUNNEL_CONVERSION_SECONDS = 2_592_000;

export type MetaLeadFunnel = {
  leadEmails: number;
  demosBooked: number;
};

function funnelSteps(body: { data?: { cumulativeRaw?: number[] }[] }) {
  const raw = body.data?.[0]?.cumulativeRaw;
  if (!raw?.length) return null;
  return {
    leadEmails: num(raw[0]),
    demosBooked: num(raw[raw.length - 1]),
  };
}

export async function metaLeadFunnel(since: string, until: string): Promise<MetaLeadFunnel | null> {
  const key = credential("AMPLITUDE_API_KEY");
  const secret = credential("AMPLITUDE_SECRET", "AMPLITUDE_SECRET_KEY");
  if (!key || !secret) return null;

  const events = [
    {
      event_type: "Lead Email Collected",
      filters: [
        {
          subprop_type: "event",
          subprop_key: "signup_source",
          subprop_op: "is",
          subprop_value: META_LEAD_SIGNUP_SOURCES,
        },
      ],
      group_by: [],
    },
    { event_type: "demo_booked", filters: [], group_by: [] },
  ];
  const segment = [{ prop: "gp:email", op: "does not contain", values: ["taxgpt", "usemomentic"] }];

  const url = new URL("https://amplitude.com/api/2/funnels");
  for (const event of events) url.searchParams.append("e", JSON.stringify(event));
  url.searchParams.set("start", since.replace(/-/g, ""));
  url.searchParams.set("end", until.replace(/-/g, ""));
  url.searchParams.set("mode", "ordered");
  url.searchParams.set("n", "active");
  url.searchParams.set("cs", String(FUNNEL_CONVERSION_SECONDS));
  url.searchParams.set("s", JSON.stringify(segment));

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
  });
  const body = (await response.json()) as {
    error?: string | { message?: string };
    data?: { cumulativeRaw?: number[] }[];
  };
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : typeof body.error === "object" && body.error?.message
          ? body.error.message
          : "";
    const detail = message.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(detail ? `Amplitude rejected the key (${response.status}): ${detail}` : `Amplitude rejected the key (${response.status})`);
  }
  return funnelSteps(body);
}