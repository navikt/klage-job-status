import { describe, expect, test } from 'bun:test';
import { isValidJobId, JOB_ID_MAX_LENGTH, JOB_ID_MIN_LENGTH } from '@/lib/jobs/key';

describe('Validate job ID', () => {
  test('Should accept a job ID with letters, numbers, dashes and underscores', () => {
    expect(isValidJobId('valid-job_id123')).toBe(true);
  });

  test('Should accept a job ID exactly at the minimum length', () => {
    expect(isValidJobId('a'.repeat(JOB_ID_MIN_LENGTH))).toBe(true);
  });

  test('Should accept a job ID exactly at the maximum length', () => {
    expect(isValidJobId('a'.repeat(JOB_ID_MAX_LENGTH))).toBe(true);
  });

  test('Should reject a job ID one below the minimum length', () => {
    expect(isValidJobId('a'.repeat(JOB_ID_MIN_LENGTH - 1))).toBe(false);
  });

  test('Should reject a job ID one above the maximum length', () => {
    expect(isValidJobId('a'.repeat(JOB_ID_MAX_LENGTH + 1))).toBe(false);
  });

  test('Should reject a job ID with special characters', () => {
    expect(isValidJobId('invalid-job-id!')).toBe(false);
  });

  test('Should reject a job ID with spaces', () => {
    expect(isValidJobId('invalid job id')).toBe(false);
  });
});
