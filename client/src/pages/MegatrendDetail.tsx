import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import StockListPage from "@/components/StockListPage";

export default function MegatrendDetail() {
  const [, params] = useRoute("/megatrends/:id");
  const id = params?.id ? params.id : "";

  const { data, isLoading } = useQuery({
    queryKey: ['/api/megatrends', id, 'stocks'],
    queryFn: async () => {
      const res = await fetch(`/api/megatrends/${id}/stocks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch megatrend stocks");
      return res.json();
    },
    enabled: !!id,
  });

  const headerStats = data ? [
    { label: 'Daily', value: data.megatrend.dailyChange, testId: 'text-stat-daily' },
    { label: 'Weekly', value: data.megatrend.weeklyChange, testId: 'text-stat-weekly' },
    { label: 'Monthly', value: data.megatrend.monthlyChange, testId: 'text-stat-monthly' },
    { label: 'YTD', value: data.megatrend.ytdChange ?? 0, testId: 'text-stat-ytd' },
  ] : [];

  return (
    <StockListPage
      title={data?.megatrend?.name || 'Loading...'}
      subtitle={data ? `Megatrend Basket · ${data.megatrend.totalStocks} stocks` : ''}
      breadcrumbs={[
        { label: 'Megatrends', href: '/markets' },
      ]}
      headerStats={headerStats}
      rs={data?.megatrend?.rsRating}
      stocks={data?.stocks || []}
      isLoading={isLoading}
      hasData={!!data}
      notFoundMessage="Basket Not Found"
    />
  );
}
