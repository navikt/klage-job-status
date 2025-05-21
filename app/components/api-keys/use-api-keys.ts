import { isValidNamespace } from '@common/common';
import { useCallback, useEffect, useState } from 'react';

export const useApiKeys = (namespace: string) => {
  const validNamespace = isValidNamespace(namespace);
  const [isLoading, setIsLoading] = useState(validNamespace);
  const [readKey, setReadKey] = useState<string | null>(null);
  const [writeKey, setWriteKey] = useState<string | null>(null);

  const getKeys = useCallback(async (namespace: string) => {
    const res = await fetch(`/api/namespaces/${namespace}/keys`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return;
    }

    const keys = await res.json();

    if (!isKeys(keys)) {
      setIsLoading(false);
      return;
    }

    setReadKey(keys.readKey);
    setWriteKey(keys.writeKey);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setIsLoading(true);

    if (!isValidNamespace(namespace)) {
      setReadKey(null);
      setWriteKey(null);
      setIsLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      getKeys(namespace);
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [namespace, getKeys]);

  return { readKey, writeKey, isLoading };
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
