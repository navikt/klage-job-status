import { useNamespaces } from '@app/context/NamespaceContext';
import { HStack, UNSAFE_Combobox } from '@navikt/ds-react';
import { useState } from 'react';

export const NamespaceSelector = () => {
  const { namespaces, namespace, setNamespace, isLoading } = useNamespaces();
  const [value, setValue] = useState<string>(namespace ?? '');

  return (
    <HStack
      as="section"
      paddingBlock="2"
      paddingInline="4"
      gap="2"
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
        isLoading={isLoading}
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
