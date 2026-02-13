import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import StockDetail from "@/pages/StockDetail";
import SectorDetail from "@/pages/SectorDetail";
import IndustryDetail from "@/pages/IndustryDetail";
import Login from "@/pages/Login";
import Market from "@/pages/Market";
import MegatrendDetail from "@/pages/MegatrendDetail";
import News from "@/pages/News";
import Leaders from "@/pages/Leaders";
import Earnings from "@/pages/Earnings";
import Payment from "@/pages/Payment";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import Admin from "@/pages/Admin";
import Landing from "@/pages/Landing";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const isProduction = import.meta.env.PROD;
const PREVIEW_KEY = "__td_preview";

function usePreviewMode() {
  const path = window.location.pathname;
  if (path === "/test") {
    try { sessionStorage.setItem(PREVIEW_KEY, "1"); } catch {}
  }
  try { return sessionStorage.getItem(PREVIEW_KEY) === "1"; } catch { return false; }
}

function PaymentGate({ children }: { children: React.ReactNode }) {
  const preview = usePreviewMode();
  const { user, isLoading: authLoading } = useAuth();

  const { data: paymentStatus, isLoading: paymentLoading } = useQuery<{ hasPaid: boolean }>({
    queryKey: ["/api/payment/status"],
    enabled: !!user,
    retry: false,
  });

  if (preview) {
    return <>{children}</>;
  }

  if (authLoading || (user && paymentLoading)) {
    return null;
  }

  if (!user) {
    if (isProduction) {
      return <Landing />;
    }
    return <Redirect to="/landing" />;
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
function ProtectedMegatrendDetail() { return <PaymentGate><MegatrendDetail /></PaymentGate>; }
function ProtectedNews() { return <PaymentGate><News /></PaymentGate>; }
function ProtectedLeaders() { return <PaymentGate><Leaders /></PaymentGate>; }
function ProtectedEarnings() { return <PaymentGate><Earnings /></PaymentGate>; }

function Router() {
  return (
    <Switch>
      <Route path="/landing" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/payment" component={Payment} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      <Route path="/admin" component={Admin} />
      <Route path="/test">{() => { return <Redirect to="/" />; }}</Route>
      <Route path="/" component={ProtectedDashboard} />
      <Route path="/stocks/:symbol" component={ProtectedStockDetail} />
      <Route path="/sectors/:sectorName/industries/:industryName" component={ProtectedIndustryDetail} />
      <Route path="/sectors/:sectorName" component={ProtectedSectorDetail} />
      <Route path="/megatrends/:id" component={ProtectedMegatrendDetail} />
      <Route path="/markets" component={ProtectedMarket} />
      <Route path="/leaders" component={ProtectedLeaders} />
      <Route path="/earnings" component={ProtectedEarnings} />
      <Route path="/news" component={ProtectedNews} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
