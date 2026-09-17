import { useCallback, useEffect, useRef, useState } from "react";

export interface Loadable<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Loads data, optionally refreshing on an interval while the page is visible. */
export function useApi<T>(load: (() => Promise<T>) | null, deps: unknown[], refreshMs?: number): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(Boolean(load));
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    if (!loader.current) return;
    try {
      setData(await loader.current());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(Boolean(load));
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, refreshMs);
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshMs, reload]);

  return { data, error, loading, reload };
}
