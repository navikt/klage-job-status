import { NAMESPACE_MAX_LENGTH, NAMESPACE_MIN_LENGTH, NAMESPACE_REGEX, isValidNamespace } from '@common/common';
import { PlusIcon } from '@navikt/aksel-icons';
import { Alert, BodyShort, Button, CopyButton, HGrid, List, Loader, Modal, TextField } from '@navikt/ds-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export const GetNamespaceApiKeys = () => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [namespace, setNamespace] = useState<string>('');
  const [readKey, setReadKey] = useState<string | null>(null);
  const [writeKey, setWriteKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getKeys = useCallback(async (namespace: string) => {
    const res = await fetch(`/api/namespaces/${namespace}/keys`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return;
    }

    const keys = await res.json();

    if (!isKeys(keys)) {
      setIsLoading(false);
      return;
    }

    setReadKey(keys.readKey);
    setWriteKey(keys.writeKey);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setIsLoading(true);

    if (!isValidNamespace(namespace)) {
      setReadKey(null);
      setWriteKey(null);
      setIsLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      getKeys(namespace);
    }, 200);

    return () => {
      clearTimeout(timeout);
    };
  }, [namespace, getKeys]);

  const openModal = () => {
    modalRef.current?.showModal();
  };

  const closeModal = () => {
    modalRef.current?.close();
  };

  return (
    <>
      <Button variant="primary" onClick={openModal} icon={<PlusIcon aria-hidden />}>
        Get Namespace API Keys
      </Button>

      <Modal
        header={{ heading: 'Get Namespace API Keys' }}
        ref={modalRef}
        onClose={closeModal}
        closeOnBackdropClick
        width="medium"
      >
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

          <BodyShort spacing>Use the READ API Key to read the job statuses from GitHub or other places.</BodyShort>
          <ApiKey isLoading={isLoading} namespace={namespace}>
            {readKey}
          </ApiKey>

          <BodyShort spacing>Use the WRITE API Key to write the job statuses from jobs.</BodyShort>
          <ApiKey isLoading={isLoading} namespace={namespace}>
            {writeKey}
          </ApiKey>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

interface ApiKeyProps {
  children: string | null;
  isLoading: boolean;
  namespace: string;
}

const ApiKey = ({ children, isLoading, namespace }: ApiKeyProps) => (
  <HGrid columns="1fr min-content" gap="2" align="start" marginBlock="0 8" width="100%" overflow="hidden">
    <span className="inline break-all rounded-sm bg-ax-bg-sunken px-2 py-1 font-mono text-ax-small text-ax-text-warning-subtle">
      {children ?? '*****-***:****.*******************************************'}
    </span>

    <CopyButton
      size="xsmall"
      icon={isLoading && namespace.length > 0 ? <Loader size="small" aria-hidden /> : undefined}
      variant="action"
      text="Copy key"
      className="shrink-0 overflow-hidden text-nowrap"
      copyText={children ?? ''}
      disabled={isLoading || children === null}
    />
  </HGrid>
);

interface ApiKeys {
  readKey: string;
  writeKey: string;
}

const isKeys = (keys: unknown): keys is ApiKeys => {
  if (typeof keys !== 'object' || keys === null) {
    return false;
  }

  return (
    'readKey' in keys && typeof keys.readKey === 'string' && 'writeKey' in keys && typeof keys.writeKey === 'string'
  );
};
