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
      <RouteResetErrorBoundary>
        <Layout>
          <AppRoutes />
        </Layout>
      </RouteResetErrorBoundary>
    </BrowserRouter>
  );
}
