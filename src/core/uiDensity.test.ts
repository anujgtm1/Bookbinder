import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UI_DENSITY_STORAGE_KEY,
  parseStoredUiDensity,
  readStoredUiDensity,
  saveUiDensity,
} from './uiDensity';

describe('uiDensity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseStoredUiDensity', () => {
    it('accepts valid density values', () => {
      expect(parseStoredUiDensity('clean')).toBe('clean');
      expect(parseStoredUiDensity('all')).toBe('all');
    });

    it('falls back to clean for null or invalid strings', () => {
      expect(parseStoredUiDensity(null)).toBe('clean');
      expect(parseStoredUiDensity('')).toBe('clean');
      expect(parseStoredUiDensity('compact')).toBe('clean');
      expect(parseStoredUiDensity('ALL')).toBe('clean');
    });
  });

  describe('readStoredUiDensity & saveUiDensity', () => {
    it('defaults to clean when nothing is stored', () => {
      expect(readStoredUiDensity()).toBe('clean');
    });

    it('persists and reads back clean and all density values', () => {
      saveUiDensity('all');
      expect(window.localStorage.getItem(UI_DENSITY_STORAGE_KEY)).toBe('all');
      expect(readStoredUiDensity()).toBe('all');

      saveUiDensity('clean');
      expect(window.localStorage.getItem(UI_DENSITY_STORAGE_KEY)).toBe('clean');
      expect(readStoredUiDensity()).toBe('clean');
    });

    it('falls back to clean when stored value is corrupted', () => {
      window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, 'unexpected-value');
      expect(readStoredUiDensity()).toBe('clean');
    });

    it('handles localStorage access errors gracefully', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(readStoredUiDensity()).toBe('clean');
      expect(() => saveUiDensity('all')).not.toThrow();
    });
  });
});
