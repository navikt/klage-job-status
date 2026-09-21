'use client';

import { isValidNamespace } from '@common/common';
import { KeyHorizontalIcon } from '@navikt/aksel-icons';
import { Button, Dialog } from '@navikt/ds-react';
import { ApiKeys } from '@/components/api-keys/ApiKeys';
import { useNamespaces } from '@/context/NamespaceContext';

export const ShowApiKeys = () => {
  const { namespace } = useNamespaces();

  if (namespace === null || !isValidNamespace(namespace)) {
    return null;
  }

  return (
    <Dialog>
      <Dialog.Trigger>
        <Button variant="secondary" icon={<KeyHorizontalIcon aria-hidden />} size="small">
          Show API keys
        </Button>
      </Dialog.Trigger>

      <Dialog.Popup>
        <Dialog.Header>
          <Dialog.Title>{`API Keys for namespace "${namespace}"`}</Dialog.Title>
        </Dialog.Header>

        <Dialog.Body>
          <ApiKeys namespace={namespace} />
        </Dialog.Body>

        <Dialog.Footer>
          <Dialog.CloseTrigger>
            <Button variant="secondary">Close</Button>
          </Dialog.CloseTrigger>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog>
  );
};
