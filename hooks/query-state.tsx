'use client';

import { isStatus, type Status } from '@common/common';
import { useEffect, useState } from 'react';

export const ALL_STATUS = 'ALL';
const getStatusQuery = (status: string | null): Status | typeof ALL_STATUS => (isStatus(status) ? status : ALL_STATUS);

export enum SortOrder {
  Ascending = 'asc',
  Descending = 'desc',
}

const SORT_ORDER_VALUES: readonly string[] = Object.values(SortOrder);
const isSortOrder = (value: string | null): value is SortOrder => value !== null && SORT_ORDER_VALUES.includes(value);

export enum SortBy {
  Created = 'created',
  Modified = 'modified',
  Ended = 'ended',
}

const SORT_BY_VALUES: readonly string[] = Object.values(SortBy);
const isSortBy = (value: string | null): value is SortBy => value !== null && SORT_BY_VALUES.includes(value);

const DEFAULT_SORT_BY = SortBy.Created;
const getSortByQuery = (sortBy: string | null): SortBy => (isSortBy(sortBy) ? sortBy : DEFAULT_SORT_BY);

const DEFAULT_SORT_ORDER = SortOrder.Descending;
const getSortOrderQuery = (sortOrder: string | null): SortOrder =>
  isSortOrder(sortOrder) ? sortOrder : DEFAULT_SORT_ORDER;

const getSearchText = (query: URLSearchParams): string => query.get('name') ?? '';
const getStatus = (query: URLSearchParams): Status | typeof ALL_STATUS => getStatusQuery(query.get('status'));
const getSortBy = (query: URLSearchParams): SortBy => getSortByQuery(query.get('sortBy'));
const getSortOrder = (query: URLSearchParams): SortOrder => getSortOrderQuery(query.get('sortOrder'));

/**
 * `window` doesn't exist during SSR - this only ever matters for the very first render though,
 * since every other read of `window.location.search` in this hook happens later, from event
 * handlers or `useEffect`, which never run on the server. An SSR pass therefore always starts
 * from "no filters", which the client then corrects (if the URL actually had any) as part of its
 * own first render - a harmless, one-time correction, same as `hooks/theme.ts` does for the
 * theme it can't otherwise resolve server-side.
 */
const getCurrentQuery = (): URLSearchParams =>
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const useSearchParams = () => {
  const [searchText, setSearchText] = useState<string>(() => getSearchText(getCurrentQuery()));
  const [status, setStatus] = useState<Status | typeof ALL_STATUS>(() => getStatus(getCurrentQuery()));
  const [sortBy, setSortBy] = useState<SortBy>(() => getSortBy(getCurrentQuery()));
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => getSortOrder(getCurrentQuery()));

  useEffect(() => {
    const handlePopState = () => {
      const query = getCurrentQuery();
      setSearchText(getSearchText(query));
      setStatus(getStatus(query));
      setSortBy(getSortBy(query));
      setSortOrder(getSortOrder(query));
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
      const query = getCurrentQuery();

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
      const query = getCurrentQuery();

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
      const query = getCurrentQuery();

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
      const query = getCurrentQuery();

      if (newSortOrder === DEFAULT_SORT_ORDER) {
        query.delete('sortOrder');
      } else {
        query.set('sortOrder', newSortOrder);
      }

      window.history.pushState({}, '', `?${query.toString()}`);
    },
  };
};
