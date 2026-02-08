import { useRoute } from "wouter";
import { useIndustryStocks } from "@/hooks/use-market";
import StockListPage from "@/components/StockListPage";

export default function IndustryDetail() {
  const [, params] = useRoute("/sectors/:sectorName/industries/:industryName");
  const sectorName = params?.sectorName ? decodeURIComponent(params.sectorName) : "";
  const industryName = params?.industryName ? decodeURIComponent(params.industryName) : "";
  const { data, isLoading } = useIndustryStocks(sectorName, industryName);

  const headerStats = data ? [
    { label: 'Daily', value: data.industry.changePercent, testId: 'text-stat-daily' },
    { label: 'Weekly', value: data.industry.weeklyChange ?? 0, testId: 'text-stat-weekly' },
    { label: 'Monthly', value: data.industry.monthlyChange ?? 0, testId: 'text-stat-monthly' },
    { label: 'YTD', value: data.industry.ytdChange ?? 0, testId: 'text-stat-ytd' },
  ] : [];

  return (
    <StockListPage
      title={data?.industry?.name || industryName}
      subtitle={data ? `${data.industry.sector} · ${data.industry.totalStocks || data.stocks?.length || 0} stocks` : ''}
      breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: sectorName, href: `/sectors/${encodeURIComponent(sectorName)}` },
      ]}
      headerStats={headerStats}
      rs={data?.industry?.rs}
      stocks={data?.stocks || []}
      isLoading={isLoading}
      hasData={!!data}
      notFoundMessage="Industry Not Found"
    />
  );
}
