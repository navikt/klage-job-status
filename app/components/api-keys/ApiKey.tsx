import { CopyButton, HGrid, Loader } from '@navikt/ds-react';

interface ApiKeyProps {
  children: string | null;
  isLoading?: boolean;
}

export const ApiKey = ({ children, isLoading }: ApiKeyProps) => (
  <HGrid
    columns="1fr min-content"
    gap="space-8"
    align="start"
    marginBlock="space-0 space-32"
    width="100%"
    overflow="hidden"
  >
    <span className="inline break-all rounded-sm bg-ax-bg-sunken px-2 py-1 font-mono text-ax-small text-ax-text-warning-subtle">
      {children ?? '*****-***:****.*******************************************'}
    </span>

    <CopyButton
      size="xsmall"
      icon={isLoading ? <Loader size="small" aria-hidden /> : undefined}
      variant="action"
      text="Copy key"
      className="shrink-0 overflow-hidden text-nowrap"
      copyText={children ?? ''}
      disabled={isLoading || children === null}
    />
  </HGrid>
);
