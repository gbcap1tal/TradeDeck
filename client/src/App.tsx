import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import StockDetail from "@/pages/StockDetail";
import SectorDetail from "@/pages/SectorDetail";
import IndustryDetail from "@/pages/IndustryDetail";
import Login from "@/pages/Login";
import Market from "@/pages/Market";
import News from "@/pages/News";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/stocks/:symbol" component={StockDetail} />
      <Route path="/sectors/:sectorName/industries/:industryName" component={IndustryDetail} />
      <Route path="/sectors/:sectorName" component={SectorDetail} />
      <Route path="/markets" component={Market} />
      <Route path="/news" component={News} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
