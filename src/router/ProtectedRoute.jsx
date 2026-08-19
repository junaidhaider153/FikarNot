import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "../store/appStore";
import ForbiddenPage from "../pages/ForbiddenPage";

export function ProtectedRoute({ roles, children }) {
  const { session } = useApp();
  const location = useLocation();

  if (!session) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (roles?.length && !roles.includes(session.role)) {
    return <ForbiddenPage />;
  }

  return children;
}
