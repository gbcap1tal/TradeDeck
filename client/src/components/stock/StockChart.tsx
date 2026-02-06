import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStockHistory } from "@/hooks/use-stocks";
import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from "lucide-react";

interface StockChartProps {
  symbol: string;
  currentPrice?: number;
}

export function StockChart({ symbol, currentPrice }: StockChartProps) {
  const [range, setRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | '5Y'>('1M');
  const { data: history, isLoading } = useStockHistory(symbol, range);

  const isPositive = history && history.length > 0
    ? (history[history.length - 1].value >= history[0].value)
    : true;

  const color = isPositive ? "#30d158" : "#ff453a";

  if (isLoading) {
    return (
      <div className="h-[380px] w-full flex items-center justify-center glass-card rounded-xl">
        <Loader2 className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5" data-testid="card-stock-chart">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
        <h3 className="text-[15px] font-semibold text-white/60">Price History</h3>
        <Tabs value={range} onValueChange={(v) => setRange(v as any)} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-6 w-full sm:w-auto bg-white/5 h-8 rounded-lg">
            {['1D', '1W', '1M', '3M', '1Y', '5Y'].map((r) => (
              <TabsTrigger
                key={r}
                value={r}
                className="text-[11px] text-white/40 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none rounded-md h-6"
                data-testid={`tab-range-${r}`}
              >
                {r}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(str) => {
                const date = new Date(str);
                if (range === '1D') return format(date, 'HH:mm');
                if (range === '1W' || range === '1M') return format(date, 'MMM d');
                return format(date, "MMM ''yy");
              }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.25)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `$${val.toFixed(0)}`}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-[#1a1a1a] border border-white/10 p-3 rounded-lg shadow-xl">
                      <p className="text-[11px] text-white/40 mb-1">
                        {range === '1D' ? format(new Date(label), 'MMM d, HH:mm') : format(new Date(label), 'MMM d, yyyy')}
                      </p>
                      <p className="text-lg font-bold font-mono-nums text-white">
                        ${Number(payload[0].value).toFixed(2)}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#gradient-${symbol})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
