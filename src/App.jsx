import { useEffect } from "react";
import { appActions, useApp } from "./store/appStore";
import { AppRouter } from "./router/AppRouter";
import { Boot } from "./router/routes";
import { ErrorCard } from "./components/common";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./styles.css";

export default function App() {
  const state = useApp();

  useEffect(() => {
    void appActions.bootstrap();
  }, []);

  if (state.bootError) {
    return (
      <div className="container page-pad">
        <ErrorCard message={state.bootError} onRetry={() => void appActions.bootstrap()} />
      </div>
    );
  }

  if (!state.ready) return <Boot />;

  return (
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  );
}
