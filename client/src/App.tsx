import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const StockDetail = lazy(() => import("@/pages/StockDetail"));
const SectorDetail = lazy(() => import("@/pages/SectorDetail"));
const IndustryDetail = lazy(() => import("@/pages/IndustryDetail"));
const Megatrends = lazy(() => import("@/pages/Megatrends"));
const MegatrendDetail = lazy(() => import("@/pages/MegatrendDetail"));
const News = lazy(() => import("@/pages/News"));
const Leaders = lazy(() => import("@/pages/Leaders"));
const Earnings = lazy(() => import("@/pages/Earnings"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const Payment = lazy(() => import("@/pages/Payment"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const Admin = lazy(() => import("@/pages/Admin"));
const Landing = lazy(() => import("@/pages/Landing"));

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

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
    </div>
  );
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
    return <PageLoader />;
  }

  if (!user) {
    if (isProduction) {
      return <Suspense fallback={<PageLoader />}><Landing /></Suspense>;
    }
    return <Redirect to="/landing" />;
  }

  if (!paymentStatus?.hasPaid) {
    return <Suspense fallback={<PageLoader />}><Payment /></Suspense>;
  }

  return <>{children}</>;
}

function ProtectedDashboard() { return <PaymentGate><Dashboard /></PaymentGate>; }
function ProtectedStockDetail() { return <PaymentGate><Suspense fallback={<PageLoader />}><StockDetail /></Suspense></PaymentGate>; }
function ProtectedSectorDetail() { return <PaymentGate><Suspense fallback={<PageLoader />}><SectorDetail /></Suspense></PaymentGate>; }
function ProtectedIndustryDetail() { return <PaymentGate><Suspense fallback={<PageLoader />}><IndustryDetail /></Suspense></PaymentGate>; }
function ProtectedMegatrends() { return <PaymentGate><Suspense fallback={<PageLoader />}><Megatrends /></Suspense></PaymentGate>; }
function ProtectedMegatrendDetail() { return <PaymentGate><Suspense fallback={<PageLoader />}><MegatrendDetail /></Suspense></PaymentGate>; }
function ProtectedNews() { return <PaymentGate><Suspense fallback={<PageLoader />}><News /></Suspense></PaymentGate>; }
function ProtectedLeaders() { return <PaymentGate><Suspense fallback={<PageLoader />}><Leaders /></Suspense></PaymentGate>; }
function ProtectedEarnings() { return <PaymentGate><Suspense fallback={<PageLoader />}><Earnings /></Suspense></PaymentGate>; }
function ProtectedPortfolio() { return <PaymentGate><Suspense fallback={<PageLoader />}><Portfolio /></Suspense></PaymentGate>; }

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/landing" component={Landing} />
        <Route path="/waitlist" component={Landing} />
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
        <Route path="/markets" component={ProtectedMegatrends} />
        <Route path="/leaders" component={ProtectedLeaders} />
        <Route path="/earnings" component={ProtectedEarnings} />
        <Route path="/news" component={ProtectedNews} />
        <Route path="/portfolio" component={ProtectedPortfolio} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
