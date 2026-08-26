import { useCallback, useEffect, useState } from "react";

/**
 * Improved async hook with request cancellation support.
 * Automatically cancels in-flight requests when unmounting or dependencies change.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let controller = new AbortController();
    
    setState({ loading: true, error: null, data: null });

    Promise.resolve()
      .then(() => {
        // Pass abort signal to fn if it supports it
        return typeof fn === "function" ? fn(controller.signal) : fn;
      })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        // Don't update state if request was aborted or component unmounted
        if (alive && error?.name !== "AbortError") {
          setState({ loading: false, error, data: null });
        }
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, retry };
}
