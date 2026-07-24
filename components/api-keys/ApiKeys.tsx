'use client';

import { Alert, BodyShort, Button, VStack } from '@navikt/ds-react';
import { ApiKey } from '@/components/api-keys/ApiKey';
import { useApiKeys } from '@/components/api-keys/use-api-keys';

interface ApiKeysProps {
  namespace: string;
}

export const ApiKeys = ({ namespace }: ApiKeysProps) => {
  const { readKey, writeKey, isLoading, error, retry } = useApiKeys(namespace);

  if (error !== null) {
    return (
      <VStack gap="space-16">
        <Alert variant="error" size="small">
          {error}
        </Alert>

        <Button variant="secondary" size="small" onClick={retry} className="self-start">
          Try again
        </Button>
      </VStack>
    );
  }

  return (
    <>
      <BodyShort spacing>Use the READ API Key to read the job statuses from GitHub or other places.</BodyShort>
      <ApiKey isLoading={isLoading}>{readKey}</ApiKey>

      <BodyShort spacing>Use the WRITE API Key to write the job statuses from jobs.</BodyShort>
      <ApiKey isLoading={isLoading}>{writeKey}</ApiKey>
    </>
  );
};
