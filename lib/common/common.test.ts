import { describe, expect, test } from 'bun:test';
import { isValidNamespace, NAMESPACE_MAX_LENGTH, NAMESPACE_MIN_LENGTH, validateLength } from '@common/common';

describe('Common', () => {
  describe('validateLength', () => {
    test('Should accept a value exactly at the minimum length', () => {
      expect(validateLength('a'.repeat(1), 1, 128)).toBe(true);
    });

    test('Should accept a value exactly at the maximum length', () => {
      expect(validateLength('a'.repeat(128), 1, 128)).toBe(true);
    });

    test('Should reject a value one below the minimum length', () => {
      expect(validateLength('a'.repeat(0), 1, 128)).toBe(false);
    });

    test('Should reject a value one above the maximum length', () => {
      expect(validateLength('a'.repeat(129), 1, 128)).toBe(false);
    });
  });

  describe('Validate namespace', () => {
    test('Should accept namespace with only letters', () => {
      expect(isValidNamespace('validnamespace')).toBe(true);
    });

    test('Should accept a namespace exactly at the minimum length', () => {
      expect(isValidNamespace('a'.repeat(NAMESPACE_MIN_LENGTH))).toBe(true);
    });

    test('Should accept a namespace exactly at the maximum length', () => {
      expect(isValidNamespace('a'.repeat(NAMESPACE_MAX_LENGTH))).toBe(true);
    });

    test('Should reject a namespace one below the minimum length', () => {
      expect(isValidNamespace('a'.repeat(NAMESPACE_MIN_LENGTH - 1))).toBe(false);
    });

    test('Should reject a namespace one above the maximum length', () => {
      expect(isValidNamespace('a'.repeat(NAMESPACE_MAX_LENGTH + 1))).toBe(false);
    });

    test('Should accept namespace with underscores', () => {
      expect(isValidNamespace('valid_namespace')).toBe(true);
    });

    test('Should accept namespace with dashes', () => {
      expect(isValidNamespace('valid-namespace')).toBe(true);
    });

    test('Should accept namespace with numbers', () => {
      expect(isValidNamespace('valid-namespace-123')).toBe(true);
    });

    test('Should reject namespace with special characters', () => {
      expect(isValidNamespace('valid-namespace!')).toBe(false);
    });

    test('Should reject namespace with spaces', () => {
      expect(isValidNamespace('valid namespace')).toBe(false);
    });

    test('Should reject namespace with leading or trailing spaces', () => {
      expect(isValidNamespace(' valid-namespace')).toBe(false);
      expect(isValidNamespace('valid-namespace ')).toBe(false);
    });
  });
});
