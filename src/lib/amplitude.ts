export type DemoSeries = {
  byDate: Record<string, number>;
  total: number | null;
};

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

function funnelEvents() {
  return [
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
}

function funnelSegment() {
  return [{ prop: "gp:email", op: "does not contain", values: ["taxgpt", "usemomentic"] }];
}

function funnelConverted(body: { data?: { cumulativeRaw?: number[] }[] }) {
  const raw = body.data?.[0]?.cumulativeRaw;
  if (!raw?.length) return null;
  return num(raw[raw.length - 1]);
}

export async function metaLeadDemos(since: string, until: string): Promise<DemoSeries | null> {
  const key = credential("AMPLITUDE_API_KEY");
  const secret = credential("AMPLITUDE_SECRET", "AMPLITUDE_SECRET_KEY");
  if (!key || !secret) return null;

  const url = new URL("https://amplitude.com/api/2/funnels");
  for (const event of funnelEvents()) url.searchParams.append("e", JSON.stringify(event));
  url.searchParams.set("start", since.replace(/-/g, ""));
  url.searchParams.set("end", until.replace(/-/g, ""));
  url.searchParams.set("mode", "ordered");
  url.searchParams.set("n", "active");
  url.searchParams.set("cs", String(FUNNEL_CONVERSION_SECONDS));
  url.searchParams.set("s", JSON.stringify(funnelSegment()));

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

  return { byDate: {}, total: funnelConverted(body) };
}

export const facebookUniques = metaLeadDemos;