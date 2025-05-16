import { GetNamespaceApiKeys } from '@app/components/ApiKeys';
import { JobsList } from '@app/components/JobsList/JobsList';
import { JobsProvider } from '@app/context/JobsContext';
import { useNamespaces } from '@app/context/NamespaceContext';
import { Button, HStack, Heading, VStack } from '@navikt/ds-react';

export const MainContent = () => {
  const { isLoading, namespaces, namespace, setNamespace } = useNamespaces();

  if (isLoading) {
    return (
      <HStack align="center" justify="center" height="50" className="text-text-subtle">
        Loading namespaces...
      </HStack>
    );
  }

  if (namespace === null) {
    return (
      <VStack align="center" justify="center" height="50" className="text-text-subtle">
        <Heading level="2" size="small" className="text-text-subtle" spacing>
          Select or create a namespace to view jobs
        </Heading>

        <HStack gap="4">
          {namespaces.map((ns) => (
            <Button variant="primary" key={ns} onClick={() => setNamespace(ns)}>
              {ns}
            </Button>
          ))}

          <GetNamespaceApiKeys />
        </HStack>
      </VStack>
    );
  }

  return (
    <JobsProvider namespace={namespace}>
      <JobsList />
    </JobsProvider>
  );
};
