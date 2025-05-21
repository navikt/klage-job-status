import { ApiKeys } from '@app/components/api-keys/ApiKeys';
import { useNamespaces } from '@app/context/NamespaceContext';
import { isValidNamespace } from '@common/common';
import { KeyHorizontalIcon } from '@navikt/aksel-icons';
import { Button, Modal } from '@navikt/ds-react';
import { useRef, useState } from 'react';

export const ShowApiKeys = () => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { namespace } = useNamespaces();

  if (namespace === null || !isValidNamespace(namespace)) {
    return null;
  }

  const openModal = () => {
    setIsOpen(true);
    modalRef.current?.showModal();
  };

  const closeModal = () => {
    setIsOpen(false);
    modalRef.current?.close();
  };

  return (
    <>
      <Button variant="secondary" icon={<KeyHorizontalIcon aria-hidden />} size="small" onClick={openModal}>
        Show API keys
      </Button>

      <Modal
        ref={modalRef}
        onClose={closeModal}
        header={{ heading: `API Keys for namespace "${namespace}"`, closeButton: true }}
        closeOnBackdropClick
      >
        <Modal.Body>{isOpen ? <ApiKeys namespace={namespace} /> : null}</Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
