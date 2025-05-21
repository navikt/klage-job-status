import { ApiKeys } from '@app/components/api-keys/ApiKeys';
import { useApiKeys } from '@app/components/api-keys/use-api-keys';
import { NAMESPACE_MAX_LENGTH, NAMESPACE_MIN_LENGTH, NAMESPACE_REGEX } from '@common/common';
import { PlusIcon } from '@navikt/aksel-icons';
import { Alert, BodyShort, Button, List, Modal, TextField } from '@navikt/ds-react';
import { useRef, useState } from 'react';

export const CreateApiKeys = () => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [namespace, setNamespace] = useState<string>('');
  const { readKey, writeKey, isLoading } = useApiKeys(namespace);

  return (
    <>
      <Button variant="primary" onClick={() => modalRef.current?.showModal()} icon={<PlusIcon aria-hidden />}>
        Get Namespace API Keys
      </Button>

      <Modal header={{ heading: 'Get Namespace API Keys' }} ref={modalRef} closeOnBackdropClick width="medium">
        <Modal.Body>
          <Alert variant="info" size="small" className="mb-4">
            <BodyShort spacing>Enter the namespace you want to get the API keys for.</BodyShort>
            <BodyShort spacing>The namespace should be your Nais team name or use that as a prefix.</BodyShort>
            <BodyShort>
              Example:{' '}
              <span className="bg-ax-bg-sunken px-2 py-1 font-mono text-ax-small text-ax-text-warning-subtle">
                klage-e2e
              </span>
            </BodyShort>
          </Alert>

          <TextField
            label="Namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            onBlur={() => {
              setNamespace(namespace);
            }}
            className="mb-4 w-full"
            autoFocus
            pattern={NAMESPACE_REGEX.source}
            minLength={NAMESPACE_MIN_LENGTH}
            maxLength={NAMESPACE_MAX_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            autoCapitalize="off"
          />

          <List size="small" className="mb-8 italic">
            <List.Item>
              Namespace must be between {NAMESPACE_MIN_LENGTH} and {NAMESPACE_MAX_LENGTH} characters.
            </List.Item>
            <List.Item>Namespace can only contain lowercase letters, numbers, dashes, and underscores.</List.Item>
          </List>

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
