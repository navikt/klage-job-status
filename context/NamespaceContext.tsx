'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext } from 'react';

interface NamespacesContextType {
  namespaces: string[];
  namespace: string | null;
  setNamespace: (namespace: string | null) => void;
}

const NamespacesContext = createContext<NamespacesContextType>({
  namespaces: [],
  namespace: null,
  setNamespace: () => {},
});

export const useNamespaces = () => useContext(NamespacesContext);

interface NamespaceProviderProps {
  /** The current namespace, from the route (`/` -> `null`, `/namespace/[namespace]` -> its value). */
  namespace: string | null;
  /** Resolved server-side, streamed in via Suspense - see `components/NamespacesServer.tsx`. */
  initialNamespaces: string[];
  children: React.ReactNode;
}

export const NamespaceProvider = ({ namespace, initialNamespaces, children }: NamespaceProviderProps) => {
  const router = useRouter();

  const setNamespace = useCallback(
    (newNamespace: string | null) => {
      router.push(newNamespace === null ? '/' : `/namespace/${newNamespace}`);
    },
    [router],
  );

  return (
    <NamespacesContext.Provider value={{ namespaces: initialNamespaces, namespace, setNamespace }}>
      {children}
    </NamespacesContext.Provider>
  );
};
