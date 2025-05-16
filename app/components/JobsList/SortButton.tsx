import { SortOrder } from '@app/hooks/query-state';
import { ArrowDownIcon, ArrowUpIcon, ArrowsUpDownIcon } from '@navikt/aksel-icons';
import { Button } from '@navikt/ds-react';

interface SortButtonProps {
  children: React.ReactNode;
  isActive: boolean;
  sortOrder: SortOrder;
  onClick: () => void;
}

export const SortButton = ({ children, isActive, sortOrder, onClick }: SortButtonProps) => (
  <Button
    type="button"
    size="small"
    variant={isActive ? 'tertiary' : 'tertiary-neutral'}
    onClick={onClick}
    icon={<Icon isActive={isActive} sortOrder={sortOrder} />}
  >
    {children}
  </Button>
);

interface IconProps {
  isActive: boolean;
  sortOrder: SortOrder;
}

const Icon = ({ isActive, sortOrder }: IconProps) => {
  if (!isActive) {
    return <ArrowsUpDownIcon aria-hidden />;
  }

  return sortOrder === SortOrder.Ascending ? <ArrowUpIcon aria-hidden /> : <ArrowDownIcon aria-hidden />;
};
