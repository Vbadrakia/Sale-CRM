import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/api/client';

/** Small data-loading hook: handles loading, error and refetch consistently. */
export function useApiResource<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loader();
      if (isMounted.current) {
        setData(res);
      }
    } catch (err) {
      if (isMounted.current) {
        if (err instanceof ApiRequestError && err.code === 'CANCELLED') return;
        setError(err instanceof ApiRequestError ? err.message : 'Could not load this data.');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
