import { Status, isStatus } from '@common/common';
import { Search, ToggleGroup } from '@navikt/ds-react';
import { useEffect, useState } from 'react';

interface SearchFilterProps {
  statusFilter: Status | 'ALL';
  setStatusFilter: (status: Status | 'ALL') => void;
  onSearch: (searchText: string) => void;
}

export const SearchFilter = ({ statusFilter, setStatusFilter, onSearch }: SearchFilterProps) => {
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearch(searchText);
    }, 200); // Debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [searchText, onSearch]);

  return (
    <>
      <ToggleGroup
        size="small"
        value={statusFilter}
        onChange={(status) => setStatusFilter(isStatus(status) ? status : 'ALL')}
        className="bg-bg-default"
      >
        <ToggleGroup.Item value="ALL">All</ToggleGroup.Item>
        <ToggleGroup.Item value={Status.RUNNING} className="capitalize">
          {Status.RUNNING.toLowerCase()}
        </ToggleGroup.Item>
        <ToggleGroup.Item value={Status.SUCCESS} className="capitalize">
          {Status.SUCCESS.toLowerCase()}
        </ToggleGroup.Item>
        <ToggleGroup.Item value={Status.FAILED} className="capitalize">
          {Status.FAILED.toLowerCase()}
        </ToggleGroup.Item>
      </ToggleGroup>

      <Search
        variant="simple"
        size="small"
        hideLabel
        label="Filter jobs by name..."
        placeholder="Filter jobs by name..."
        value={searchText}
        onChange={setSearchText}
        className="w-100 grow-0"
      />
    </>
  );
};
