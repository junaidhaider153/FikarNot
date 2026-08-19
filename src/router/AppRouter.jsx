import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "./routes";
import { Layout } from "../components/layout/Layout";

function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search]);

  return null;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout>
        <AppRoutes />
      </Layout>
    </BrowserRouter>
  );
}
