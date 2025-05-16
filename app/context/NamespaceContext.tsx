import { useSearchParams } from '@app/hooks/query-state';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface NamespacesContextType {
  namespaces: string[];
  namespace: string | null;
  setNamespace: (namespace: string) => void;
  isLoading: boolean;
  error: string | null;
}

const NamespacesContext = createContext<NamespacesContextType>({
  namespaces: [],
  namespace: null,
  setNamespace: () => {},
  isLoading: false,
  error: null,
});

export const useNamespaces = () => useContext(NamespacesContext);

interface NamespaceProviderProps {
  children: React.ReactNode;
}

export const NamespaceProvider = ({ children }: NamespaceProviderProps) => {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { namespace, setNamespace } = useSearchParams();

  const updateNamespaces = useCallback(async () => {
    const res = await fetch('/api/namespaces', { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      setError('Failed to fetch namespaces');
      setIsLoading(false);
      return;
    }

    const namespaces = (await res.json()).sort((a: string, b: string) => a.localeCompare(b));

    setNamespaces(namespaces);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    updateNamespaces();
  }, [updateNamespaces]);

  return (
    <NamespacesContext.Provider value={{ namespaces, isLoading, error, namespace, setNamespace }}>
      {children}
    </NamespacesContext.Provider>
  );
};
