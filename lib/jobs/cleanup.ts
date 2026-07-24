import { isJob, type JobEvent, JobEventType } from '@common/common';
import type { GlideClient } from '@valkey/valkey-glide';
import { toStr } from '@/lib/jobs/valkey-utils';
import { parseJson } from '@/lib/json';
import { LOGS } from '@/lib/logging';
import { withSpan } from '@/lib/tracer';

/**
 * Scans all job keys in Valkey and deletes any whose value fails `isJob` validation, publishing
 * a `DELETED` event for each one removed. Keys that no longer have a value at all (`mget`
 * returned `null` - e.g. the key expired between the initial `KEYS` scan and this `mget` call)
 * are skipped: there's nothing left to delete, and the key's own expiry/delete already published
 * (or will publish) its own `DELETED` event, so there's no need to publish a second one here.
 *
 * Intended to be run once, right after connecting, to recover from jobs that were
 * left behind in an invalid state (e.g. after a schema change).
 */
export const cleanInvalidJobs = async (
  valkey: GlideClient,
  keys: (pattern: string) => Promise<string[]>,
  publish: (event: JobEvent) => Promise<void>,
): Promise<void> => withSpan('jobs.cleanup', {}, () => doCleanup(valkey, keys, publish));

const doCleanup = async (
  valkey: GlideClient,
  keys: (pattern: string) => Promise<string[]>,
  publish: (event: JobEvent) => Promise<void>,
): Promise<void> => {
  const allKeys = await keys('*');

  if (allKeys.length === 0) {
    LOGS.debug('No jobs to clean up', 'clean');
    return;
  }

  const jobs = await valkey.mget(allKeys);

  let index = -1;
  const keysToDelete: string[] = [];

  for (const job of jobs) {
    index++;

    if (job === null) {
      continue;
    }

    const parsedJob = parseJson(toStr(job));

    if (isJob(parsedJob)) {
      // Job is valid. Nothing to clean up.
      continue;
    }

    const key = allKeys[index];

    if (key === undefined) {
      LOGS.error(`Missing key for invalid job ${toStr(job)}`, 'clean');
      continue;
    }

    // Add the key to the list of keys to delete.
    keysToDelete.push(key);
  }

  if (keysToDelete.length === 0) {
    LOGS.debug('No invalid jobs found', 'clean');
    return;
  }

  LOGS.warn(`Deleting invalid jobs: ${keysToDelete.join(', ')}`, 'clean');
  // Delete all invalid jobs.
  await valkey.del(keysToDelete);

  // Publish delete events for all invalid jobs.
  const publishPromises: Promise<void>[] = [];

  for (const key of keysToDelete) {
    const [namespace, id] = key.split(':');

    if (namespace === undefined || id === undefined) {
      LOGS.error(`Invalid key format: "${key}"`, 'clean');
      continue;
    }

    publishPromises.push(publish({ eventType: JobEventType.DELETED, job: { id, namespace } }));
  }

  await Promise.all(publishPromises);

  LOGS.debug(`Deleted ${keysToDelete.length} invalid jobs`, 'clean');
};

/**
 * Scans all job keys in Valkey and, for every job that has already ended (`ended !== null`),
 * sets its TTL to expire `deleteJobAfter` seconds after `modified` rather than from "now".
 *
 * This corrects jobs whose TTL doesn't reflect how long ago they actually finished - e.g. jobs
 * left over from before this TTL behavior existed. If a job's TTL should already have expired,
 * it's deleted immediately.
 *
 * Intended to be run once, right after connecting, since ended jobs are given a correct TTL
 * relative to `modified` every time they're updated afterwards.
 */
export const setTTLForEndedJobs = async (
  valkey: GlideClient,
  keys: (pattern: string) => Promise<string[]>,
  deleteJobAfter: number,
): Promise<void> => withSpan('jobs.fix-ttl', {}, () => doSetTTLForEndedJobs(valkey, keys, deleteJobAfter));

const doSetTTLForEndedJobs = async (
  valkey: GlideClient,
  keys: (pattern: string) => Promise<string[]>,
  deleteJobAfter: number,
): Promise<void> => {
  const allKeys = await keys('*');

  if (allKeys.length === 0) {
    LOGS.debug('No jobs to set TTL for', 'ttl');
    return;
  }

  const jobs = await valkey.mget(allKeys);

  const expireAtPromises: Promise<number>[] = [];

  let index = -1;

  for (const job of jobs) {
    index++;

    if (job === null) {
      continue;
    }

    const key = allKeys[index];

    if (key === undefined) {
      LOGS.error(`Missing key for job ${toStr(job)}`, 'ttl');
      continue;
    }

    const parsedJob = parseJson(toStr(job));

    if (!isJob(parsedJob) || parsedJob.ended === null) {
      // Invalid jobs are handled by `cleanInvalidJobs`, and running jobs already get a fresh
      // TTL on every update - only ended jobs need their TTL corrected here.
      continue;
    }

    const expireAtMs = parsedJob.modified + deleteJobAfter * 1000;

    expireAtPromises.push(valkey.pexpireAt(key, expireAtMs));
  }

  if (expireAtPromises.length === 0) {
    LOGS.debug('No ended jobs to set TTL for', 'ttl');
    return;
  }

  await Promise.all(expireAtPromises);

  LOGS.debug(`Set TTL for ${expireAtPromises.length} ended job(s)`, 'ttl');
};
