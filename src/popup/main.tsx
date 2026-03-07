import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 space-y-2">
          <p className="text-xs font-medium text-destructive">Something went wrong</p>
          <p className="text-[10px] text-muted-foreground break-all">{this.state.error}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
