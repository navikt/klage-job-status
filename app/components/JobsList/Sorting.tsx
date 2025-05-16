import { SortButton } from '@app/components/JobsList/SortButton';
import { SortBy, SortOrder } from '@app/hooks/query-state';

interface SortingProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  setSortBy: (sortBy: SortBy) => void;
  setSortOrder: (sortOrder: SortOrder) => void;
}

export const Sorting = ({ sortBy, sortOrder, setSortBy, setSortOrder }: SortingProps) => {
  const toggleSortOrder = () => {
    setSortOrder(sortOrder === SortOrder.Ascending ? SortOrder.Descending : SortOrder.Ascending);
  };

  const handleSortChange = (newSortBy: SortBy) => {
    if (sortBy === newSortBy) {
      toggleSortOrder();
    } else {
      setSortBy(newSortBy);
      setSortOrder(SortOrder.Descending); // Default to descending for new sort field
    }
  };

  return (
    <div className="flex gap-2">
      <SortButton
        isActive={sortBy === SortBy.Created}
        sortOrder={sortOrder}
        onClick={() => handleSortChange(SortBy.Created)}
      >
        Created
      </SortButton>

      <SortButton
        isActive={sortBy === SortBy.Modified}
        sortOrder={sortOrder}
        onClick={() => handleSortChange(SortBy.Modified)}
      >
        Modified
      </SortButton>

      <SortButton
        isActive={sortBy === SortBy.Ended}
        sortOrder={sortOrder}
        onClick={() => handleSortChange(SortBy.Ended)}
      >
        Ended
      </SortButton>
    </div>
  );
};
