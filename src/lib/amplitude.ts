type AmplitudePoint = number | { value?: number };

export type UniqueSeries = {
  byDate: Record<string, number>;
  total: number | null;
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function facebookUniques(since: string, until: string): Promise<UniqueSeries | null> {
  const key = process.env.AMPLITUDE_API_KEY;
  const secret = process.env.AMPLITUDE_SECRET;
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
  const segment = [
    { prop: "userdata_cohort", op: "is not", values: ["lwhxmcen"] },
    { prop: "gp:email", op: "is not", values: ["taxgpt"] },
  ];
  const url = new URL("https://amplitude.com/api/2/events/segmentation");
  url.searchParams.set("e", JSON.stringify(event));
  url.searchParams.set("s", JSON.stringify(segment));
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
  const body = (await response.json()) as {
    error?: string;
    data?: {
      series?: AmplitudePoint[][];
      xValues?: string[];
      seriesCollapsed?: AmplitudePoint[][];
    };
  };
  if (!response.ok) {
    throw new Error("Amplitude request failed");
  }

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
