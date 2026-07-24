'use client';

import { BodyShort, Box, Button, Heading, HStack, VStack } from '@navikt/ds-react';
import { CreateNamespace } from '@/components/CreateNamespace';
import { useNamespaces } from '@/context/NamespaceContext';

export default function Page() {
  const { namespaces, setNamespace } = useNamespaces();

  return (
    <VStack align="center" justify="center" height="50" gap="space-24" className="text-text-subtle">
      <Heading level="2" size="small" className="text-text-subtle" spacing>
        Select or create a namespace to view jobs
      </Heading>

      {namespaces.length === 0 ? (
        <BodyShort className="text-text-subtle italic">No namespaces yet.</BodyShort>
      ) : (
        <HStack gap="space-16" justify="center">
          {namespaces.map((ns) => (
            <Button variant="primary" key={ns} onClick={() => setNamespace(ns)}>
              {ns}
            </Button>
          ))}
        </HStack>
      )}

      <HStack align="center" gap="space-12" width="100%" className="max-w-64">
        <Box flexGrow="1" borderWidth="1 0 0 0" borderColor="neutral-subtle" />
        <span className="text-small">or</span>
        <Box flexGrow="1" borderWidth="1 0 0 0" borderColor="neutral-subtle" />
      </HStack>

      <CreateNamespace />
    </VStack>
  );
}
