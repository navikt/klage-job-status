import { type Status, isStatus } from '@common/common';
import { useEffect, useState } from 'react';

export const ALL_STATUS = 'ALL';
const getStatusQuery = (status: string | null): Status | typeof ALL_STATUS => (isStatus(status) ? status : ALL_STATUS);

export enum SortOrder {
  Ascending = 'asc',
  Descending = 'desc',
}

const SORT_ORDER_VALUES = Object.values(SortOrder);
export const isSortOrder = (value: unknown): value is SortOrder => SORT_ORDER_VALUES.includes(value as SortOrder);

export enum SortBy {
  Created = 'created',
  Modified = 'modified',
  Ended = 'ended',
}

const SORT_BY_VALUES = Object.values(SortBy);
export const isSortBy = (value: unknown): value is SortBy => SORT_BY_VALUES.includes(value as SortBy);

export const DEFAULT_SORT_BY = SortBy.Modified;
const getSortByQuery = (sortBy: string | null): SortBy => (isSortBy(sortBy) ? sortBy : DEFAULT_SORT_BY);

const DEFAULT_SORT_ORDER = SortOrder.Descending;
const getSortOrderQuery = (sortOrder: string | null): SortOrder =>
  isSortOrder(sortOrder) ? sortOrder : DEFAULT_SORT_ORDER;

const getNamespace = (query: URLSearchParams): string | null => query.get('namespace');
const getSearchText = (query: URLSearchParams): string => query.get('name') ?? '';
const getStatus = (query: URLSearchParams): Status | typeof ALL_STATUS => getStatusQuery(query.get('status'));
const getSortBy = (query: URLSearchParams): SortBy => getSortByQuery(query.get('sortBy'));
const getSortOrder = (query: URLSearchParams): SortOrder => getSortOrderQuery(query.get('sortOrder'));

export const useSearchParams = () => {
  const query = new URLSearchParams(window.location.search);
  const [searchText, setSearchText] = useState<string>(getSearchText(query));
  const [status, setStatus] = useState<Status | typeof ALL_STATUS>(getStatus(query));
  const [sortBy, setSortBy] = useState<SortBy>(getSortBy(query));
  const [sortOrder, setSortOrder] = useState<SortOrder>(getSortOrder(query));
  const [namespace, setNamespace] = useState<string | null>(getNamespace(query));

  useEffect(() => {
    const handlePopState = () => {
      const query = new URLSearchParams(window.location.search);
      setSearchText(getSearchText(query));
      setStatus(getStatus(query));
      setSortBy(getSortBy(query));
      setSortOrder(getSortOrder(query));
      setNamespace(getNamespace(query));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return {
    searchText,
    setSearchText: (text: string) => {
      const trimmedText = text.trim();
      if (trimmedText === searchText) {
        return;
      }

      setSearchText(trimmedText);
      const query = new URLSearchParams(window.location.search);

      if (query.get('name') === trimmedText) {
        return;
      }

      if (trimmedText.length === 0) {
        query.delete('name');
      } else {
        query.set('name', trimmedText);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
    status,
    setStatus: (newStatus: Status | typeof ALL_STATUS) => {
      if (newStatus === status) {
        return;
      }

      setStatus(newStatus);
      const query = new URLSearchParams(window.location.search);

      if (newStatus === ALL_STATUS) {
        query.delete('status');
      } else {
        query.set('status', newStatus);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
    sortBy,
    setSortBy: (newSortBy: SortBy) => {
      if (newSortBy === sortBy) {
        return;
      }

      setSortBy(newSortBy);
      const query = new URLSearchParams(window.location.search);

      if (newSortBy === DEFAULT_SORT_BY) {
        query.delete('sortBy');
      } else {
        query.set('sortBy', newSortBy);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
    sortOrder,
    setSortOrder: (newSortOrder: SortOrder) => {
      if (newSortOrder === sortOrder) {
        return;
      }

      setSortOrder(newSortOrder);
      const query = new URLSearchParams(window.location.search);

      if (newSortOrder === DEFAULT_SORT_ORDER) {
        query.delete('sortOrder');
      } else {
        query.set('sortOrder', newSortOrder);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
    namespace,
    setNamespace: (newNamespace: string | null) => {
      if (newNamespace === namespace) {
        return;
      }

      setNamespace(newNamespace);
      const query = new URLSearchParams(window.location.search);

      if (newNamespace === null || newNamespace.length === 0) {
        query.delete('namespace');
      } else {
        query.set('namespace', newNamespace);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
  };
};
