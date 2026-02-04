import { Navbar } from "@/components/layout/Navbar";
import { MarketIndices } from "@/components/dashboard/MarketIndices";
import { SectorPerformance } from "@/components/dashboard/SectorPerformance";
import { useMarketStatus } from "@/hooks/use-market";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Clock, Globe } from "lucide-react";
import { format } from "date-fns";

export default function Market() {
  const { data: status } = useMarketStatus();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8 flex-1">
        <h1 className="text-3xl font-bold mb-8">Markets</h1>

        {/* Status Bar */}
        <div className="mb-8 p-4 rounded-xl bg-card border border-border flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${status?.isOpen ? 'bg-up animate-pulse' : 'bg-destructive'}`} />
            <span className="font-medium">Market is {status?.isOpen ? 'Open' : 'Closed'}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Clock className="w-4 h-4" />
            <span>Next Open: {status ? format(new Date(status.nextOpen), "MMM d, h:mm a") : '-'}</span>
          </div>
        </div>

        <MarketIndices />
        
        <div className="grid md:grid-cols-2 gap-8 mt-8">
          <SectorPerformance />
          
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Global Markets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Global indices data integration coming soon.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
