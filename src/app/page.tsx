import { Dashboard } from "@/components/dashboard";
import { loadDashboard } from "@/lib/dashboard";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    range?: string;
    month?: string;
    week?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const data = await loadDashboard({
    range: params.range,
    month: params.month,
    week: params.week,
    from: params.from,
    to: params.to,
  });
  return <Dashboard data={data} email={user.email} error={params.error} />;
}
