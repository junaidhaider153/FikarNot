import { useCallback, useEffect, useState } from "react";

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });

    Promise.resolve()
      .then(() => fn())
      .then((data) => { if (alive) setState({ loading: false, error: null, data }); })
      .catch((error) => { if (alive) setState({ loading: false, error, data: null }); });

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, retry };
}
