import { ApiKeys } from '@app/components/api-keys/ApiKeys';
import { useApiKeys } from '@app/components/api-keys/use-api-keys';
import { useNamespaces } from '@app/context/NamespaceContext';
import { isValidNamespace } from '@common/common';
import { KeyHorizontalIcon } from '@navikt/aksel-icons';
import { Button, Modal } from '@navikt/ds-react';
import { useRef } from 'react';

export const ShowApiKeys = () => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const { namespace } = useNamespaces();
  const { readKey, writeKey, isLoading } = useApiKeys(namespace ?? '');

  if (namespace === null || !isValidNamespace(namespace)) {
    return null;
  }

  return (
    <>
      <Button
        variant="secondary"
        icon={<KeyHorizontalIcon aria-hidden />}
        size="small"
        onClick={() => modalRef.current?.showModal()}
      >
        Show API keys
      </Button>

      <Modal
        ref={modalRef}
        onClose={() => modalRef.current?.close()}
        header={{ heading: `API Keys for namespace "${namespace}"`, closeButton: true }}
        closeOnBackdropClick
      >
        <Modal.Body>
          <ApiKeys readKey={readKey} writeKey={writeKey} isLoading={isLoading} />
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={() => modalRef.current?.close()}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
