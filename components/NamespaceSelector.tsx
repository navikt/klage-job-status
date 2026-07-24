'use client';

import { HStack, UNSAFE_Combobox } from '@navikt/ds-react';
import { useState } from 'react';
import { useNamespaces } from '@/context/NamespaceContext';

export const NamespaceSelector = () => {
  const { namespaces, namespace, setNamespace } = useNamespaces();
  const [value, setValue] = useState<string>(namespace ?? '');

  return (
    <HStack
      as="section"
      paddingBlock="space-8"
      paddingInline="space-16"
      gap="space-8"
      align="center"
      className="text-small text-text-subtle"
    >
      <span role="presentation" className="font-bold text-text-subtle">
        Namespace
      </span>

      <UNSAFE_Combobox
        size="small"
        label="Namespace"
        hideLabel
        options={namespaces}
        value={value}
        onChange={setValue}
        onBlur={() => {
          setValue(namespace ?? '');
        }}
        onToggleSelected={(option) => {
          setNamespace(option);
        }}
        className="w-48"
      />
    </HStack>
  );
};
