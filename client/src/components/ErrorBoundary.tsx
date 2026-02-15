import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function clearCachesAndReload() {
  const doReload = () => window.location.reload();
  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(doReload)
      .catch(doReload);
  } else {
    doReload();
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);

    const msg = error?.message || "";
    if (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("error loading dynamically imported module") ||
      msg.includes("Loading chunk") ||
      msg.includes("Loading CSS chunk")
    ) {
      clearCachesAndReload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "#0a0a0a" }} data-testid="error-boundary-fallback">
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#e5e5e5", marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#737373", marginBottom: "1rem", fontSize: "0.875rem" }}>
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={clearCachesAndReload}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#262626",
                color: "#e5e5e5",
                border: "1px solid #404040",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
              data-testid="button-reload"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
