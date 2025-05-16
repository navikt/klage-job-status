import { describe, expect, test } from 'bun:test';
import { isValidNamespace } from '@common/common';

describe('Common', () => {
  describe('Validate namespace', () => {
    test('Should accept namespace with only letters', () => {
      expect(isValidNamespace('validnamespace')).toBe(true);
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
