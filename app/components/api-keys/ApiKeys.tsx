import { ApiKey } from '@app/components/api-keys/ApiKey';
import { useApiKeys } from '@app/components/api-keys/use-api-keys';
import { BodyShort } from '@navikt/ds-react';

interface ApiKeysProps {
  namespace: string;
}

export const ApiKeys = ({ namespace }: ApiKeysProps) => {
  const { readKey, writeKey, isLoading } = useApiKeys(namespace);

  return (
    <>
      <BodyShort spacing>Use the READ API Key to read the job statuses from GitHub or other places.</BodyShort>
      <ApiKey isLoading={isLoading}>{readKey}</ApiKey>

      <BodyShort spacing>Use the WRITE API Key to write the job statuses from jobs.</BodyShort>
      <ApiKey isLoading={isLoading}>{writeKey}</ApiKey>
    </>
  );
};
