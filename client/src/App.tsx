import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import Landing from "@/pages/Landing";
import Payment from "@/pages/Payment";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const StockDetail = lazy(() => import("@/pages/StockDetail"));
const SectorDetail = lazy(() => import("@/pages/SectorDetail"));
const IndustryDetail = lazy(() => import("@/pages/IndustryDetail"));
const Login = lazy(() => import("@/pages/Login"));
const Market = lazy(() => import("@/pages/Market"));
const MegatrendDetail = lazy(() => import("@/pages/MegatrendDetail"));
const News = lazy(() => import("@/pages/News"));
const Leaders = lazy(() => import("@/pages/Leaders"));
const Earnings = lazy(() => import("@/pages/Earnings"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const Admin = lazy(() => import("@/pages/Admin"));

const isProduction = import.meta.env.PROD;
const PREVIEW_KEY = "__td_preview";

(function initPreview() {
  try {
    const p = window.location.pathname.replace(/\/+$/, "");
    if (p === "/test") {
      localStorage.setItem(PREVIEW_KEY, "1");
      window.history.replaceState(null, "", "/");
    }
  } catch {}
})();

function isPreviewMode() {
  try { return localStorage.getItem(PREVIEW_KEY) === "1"; } catch { return false; }
}

function PaymentGate({ children }: { children: React.ReactNode }) {
  const preview = isPreviewMode();
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
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
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
          <Suspense fallback={
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          }>
            <Router />
          </Suspense>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
