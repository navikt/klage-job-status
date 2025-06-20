import { Sorting } from '@app/components/JobsList/Sorting';
import { StatItem } from '@app/components/JobsList/StatItem';
import { SearchFilter } from '@app/components/SearchFilter';
import { JobCard } from '@app/components/job-card/JobCard';
import { useJobs } from '@app/context/JobsContext';
import { SortBy, SortOrder, useSearchParams } from '@app/hooks/query-state';
import { Status } from '@common/common';
import { Box, HGrid, HStack, Heading, VStack } from '@navikt/ds-react';
import { useMemo } from 'react';

const ALL_STATUS = 'ALL';

export const JobsList = () => {
  const { jobs, isLoading, error } = useJobs();
  const { status, setStatus, sortBy, setSortBy, sortOrder, setSortOrder, searchText, setSearchText } =
    useSearchParams();

  const filteredAndSortedJobs = useMemo(() => {
    let filtered = jobs;

    // Apply status filter
    if (status !== ALL_STATUS) {
      filtered = filtered.filter((job) => job.status === status);
    }

    const trimmedSearchText = searchText.trim();

    // Apply search filter (case insensitive)
    if (trimmedSearchText.length > 0) {
      const searchLower = trimmedSearchText.toLowerCase();
      filtered = filtered.filter((job) => job.name?.toLowerCase().includes(searchLower) || false);
    }

    // Apply sorting
    filtered = filtered.toSorted((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle null values for ended
      if (sortBy === SortBy.Ended) {
        aValue = aValue === null ? Number.MAX_SAFE_INTEGER : aValue;
        bValue = bValue === null ? Number.MAX_SAFE_INTEGER : bValue;
      }

      if (sortOrder === SortOrder.Ascending) {
        return (aValue ?? 0) - (bValue ?? 0);
      }

      return (bValue ?? 0) - (aValue ?? 0);
    });

    return filtered;
  }, [jobs, status, searchText, sortBy, sortOrder]);

  if (isLoading && jobs.length === 0) {
    return (
      <HStack align="center" justify="center" height="50" className="text-text-subtle">
        Loading jobs...
      </HStack>
    );
  }

  if (error !== null) {
    return (
      <Box.New
        padding="4"
        borderRadius="medium"
        marginBlock="0 6"
        borderWidth="1"
        borderColor="danger"
        className="bg-[#f8d7da] text-[#721c24]"
      >
        <Heading level="3" size="xsmall">
          Error loading jobs
        </Heading>
        <p>{error}</p>
      </Box.New>
    );
  }

  return (
    <VStack as="section" minHeight="100%" flexGrow="1">
      <HGrid marginBlock="0 6" gap="4" columns={{ '2xl': 5, xl: 5, lg: 5, md: 5, sm: 5, xs: 2 }}>
        <StatItem jobs={jobs}>Total Jobs</StatItem>
        <StatItem jobs={jobs} status={Status.RUNNING}>
          Running
        </StatItem>
        <StatItem jobs={jobs} status={Status.SUCCESS}>
          Successful
        </StatItem>
        <StatItem jobs={jobs} status={Status.FAILED}>
          Failed
        </StatItem>
        <StatItem jobs={jobs} status={Status.TIMEOUT}>
          Timeout
        </StatItem>
      </HGrid>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <SearchFilter statusFilter={status} setStatusFilter={setStatus} onSearch={setSearchText} />

        <Sorting sortBy={sortBy} sortOrder={sortOrder} setSortBy={setSortBy} setSortOrder={setSortOrder} />
      </div>

      {filteredAndSortedJobs.length === 0 ? (
        <div className="mb-auto flex flex-col items-center justify-center rounded-medium bg-bg-subtle p-8 text-center text-text-subtle">
          <p>No jobs found matching your filters.</p>
          {searchText && <p>Try adjusting your search terms.</p>}
        </div>
      ) : (
        <ol className="mb-auto grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4">
          {filteredAndSortedJobs.map((job) => (
            <JobCard key={`${job.namespace}:${job.id}`} job={job} />
          ))}
        </ol>
      )}

      <p className="mt-4 w-full self-end text-center text-ax-small text-ax-text-neutral-subtle italic">
        Jobs are stored for 30 days after creation.
      </p>
    </VStack>
  );
};
