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
import Payment from "@/pages/Payment";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

function PaymentGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();

  const { data: paymentStatus, isLoading: paymentLoading } = useQuery<{ hasPaid: boolean }>({
    queryKey: ["/api/payment/status"],
    enabled: !!user,
    retry: false,
  });

  if (authLoading || (user && paymentLoading)) {
    return null;
  }

  if (!user) {
    return <Payment />;
  }

  if (!paymentStatus?.hasPaid) {
    return <Payment />;
  }

  return <>{children}</>;
}

function ProtectedDashboard() { return <PaymentGate><Dashboard /></PaymentGate>; }
function ProtectedStockDetail() { return <PaymentGate><StockDetail /></PaymentGate>; }
function ProtectedSectorDetail() { return <PaymentGate><SectorDetail /></PaymentGate>; }
function ProtectedIndustryDetail() { return <PaymentGate><IndustryDetail /></PaymentGate>; }
function ProtectedMarket() { return <PaymentGate><Market /></PaymentGate>; }

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/payment" component={Payment} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      <Route path="/" component={ProtectedDashboard} />
      <Route path="/stocks/:symbol" component={ProtectedStockDetail} />
      <Route path="/sectors/:sectorName/industries/:industryName" component={ProtectedIndustryDetail} />
      <Route path="/sectors/:sectorName" component={ProtectedSectorDetail} />
      <Route path="/markets" component={ProtectedMarket} />
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
