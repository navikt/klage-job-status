import { ApiKey } from '@app/components/api-keys/ApiKey';
import { BodyShort } from '@navikt/ds-react';

interface ApiKeysProps {
  readKey: string | null;
  writeKey: string | null;
  isLoading: boolean;
}

export const ApiKeys = ({ readKey, writeKey, isLoading }: ApiKeysProps) => (
  <>
    <BodyShort spacing>Use the READ API Key to read the job statuses from GitHub or other places.</BodyShort>
    <ApiKey isLoading={isLoading}>{readKey}</ApiKey>

    <BodyShort spacing>Use the WRITE API Key to write the job statuses from jobs.</BodyShort>
    <ApiKey isLoading={isLoading}>{writeKey}</ApiKey>
  </>
);
