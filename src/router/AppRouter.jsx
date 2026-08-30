import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "./routes";
import { Layout } from "../components/layout/Layout";
import { ErrorBoundary } from "../components/common/ErrorBoundary";

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search]);

  return null;
}
function RouteResetErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      {/* The error boundary is keyed by pathname so a crash on one page doesn't
          linger when you navigate away — but it must only wrap the routed
          page content, not the whole shell. Previously Layout (header, the
          marquee, footer, WhatsApp button, toasts) was *inside* this keyed
          boundary, which meant every single navigation fully unmounted and
          remounted the entire page, not just the content area. That's both
          wasteful and a much larger surface for an unmount/remount race to
          misfire on. */}
      <Layout>
        <RouteResetErrorBoundary>
          <AppRoutes />
        </RouteResetErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}
