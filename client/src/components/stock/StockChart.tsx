import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card } from "@/components/ui/card";
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
  
  const color = isPositive ? "hsl(var(--up))" : "hsl(var(--down))";

  if (isLoading) {
    return (
      <div className="h-[400px] w-full flex items-center justify-center bg-card/50 rounded-xl border border-border/50">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="p-6 bg-card/50 backdrop-blur-sm border-border/50 shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-muted-foreground">Price History</h3>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as any)} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-6 w-full sm:w-auto bg-secondary/50">
            {['1D', '1W', '1M', '3M', '1Y', '5Y'].map((r) => (
              <TabsTrigger 
                key={r} 
                value={r}
                className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                {r}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.3} />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(str) => {
                const date = new Date(str);
                if (range === '1D') return format(date, 'HH:mm');
                if (range === '1W' || range === '1M') return format(date, 'MMM d');
                return format(date, 'MMM yyyy');
              }}
            />
            <YAxis 
              domain={['auto', 'auto']}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `$${val.toFixed(2)}`}
              width={60}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-popover border border-border p-3 rounded-lg shadow-xl">
                      <p className="text-sm text-muted-foreground mb-1">
                        {range === '1D' ? format(new Date(label), 'MMM d, HH:mm') : format(new Date(label), 'MMM d, yyyy')}
                      </p>
                      <p className="text-lg font-bold font-mono">
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
              fill="url(#colorPrice)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
