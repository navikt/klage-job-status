import { isValidNamespace } from '@common/common';
import { useCallback, useEffect, useState } from 'react';

/** Automatic attempts before giving up and surfacing `error` for a manual retry. */
const MAX_ATTEMPTS = 3;

/** Delay in ms before retry attempt `n` (0-indexed): 500, 1_000, 2_000, ... - doubling each time. */
const getBackoffDelay = (attempt: number): number => 500 * 2 ** attempt;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const useApiKeys = (namespace: string) => {
  const validNamespace = isValidNamespace(namespace);
  const [isLoading, setIsLoading] = useState(validNamespace);
  const [readKey, setReadKey] = useState<string | null>(null);
  const [writeKey, setWriteKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the returned `retry()` to manually re-run the effect below after all automatic
  // attempts have been exhausted - `namespace` alone wouldn't change in that case.
  const [manualRetryCount, setManualRetryCount] = useState(0);

  const fetchKeysOnce = useCallback(async (namespace: string): Promise<[ApiKeys, null] | [null, string]> => {
    try {
      const res = await fetch(`/api/namespaces/${namespace}/keys`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        return [null, `Failed to fetch API keys (${res.status})`];
      }

      const keys = await res.json();

      if (!isKeys(keys)) {
        return [null, 'Received an unexpected response while fetching API keys'];
      }

      return [keys, null];
    } catch {
      return [null, 'Failed to fetch API keys'];
    }
  }, []);

  const getKeys = useCallback(
    async (namespace: string, isCancelled: () => boolean) => {
      // The fetch itself is a plain, idempotent `GET` - safe to retry freely. A handful of
      // automatic attempts with a short backoff absorbs one-off blips (a cold route, a dropped
      // connection, ...) without the user ever seeing an error; only if every attempt fails does
      // this surface `error` for the manual "Try again" button in `ApiKeys.tsx`.
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const [keys, fetchError] = await fetchKeysOnce(namespace);

        if (isCancelled()) {
          return;
        }

        if (fetchError === null) {
          setReadKey(keys.readKey);
          setWriteKey(keys.writeKey);
          setError(null);
          setIsLoading(false);
          return;
        }

        const isLastAttempt = attempt === MAX_ATTEMPTS - 1;

        if (isLastAttempt) {
          setError(fetchError);
          setIsLoading(false);
          return;
        }

        await delay(getBackoffDelay(attempt));

        if (isCancelled()) {
          return;
        }
      }
    },
    [fetchKeysOnce],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    if (!isValidNamespace(namespace)) {
      setReadKey(null);
      setWriteKey(null);
      setIsLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      getKeys(namespace, () => cancelled);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [namespace, getKeys, manualRetryCount]);

  const retry = useCallback(() => {
    setManualRetryCount((count) => count + 1);
  }, []);

  return { readKey, writeKey, isLoading, error, retry };
};

interface ApiKeys {
  readKey: string;
  writeKey: string;
}

const isKeys = (keys: unknown): keys is ApiKeys => {
  if (typeof keys !== 'object' || keys === null) {
    return false;
  }

  return (
    'readKey' in keys && typeof keys.readKey === 'string' && 'writeKey' in keys && typeof keys.writeKey === 'string'
  );
};
