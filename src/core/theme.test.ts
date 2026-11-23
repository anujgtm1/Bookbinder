import { beforeEach, describe, expect, it } from 'vitest';
import {
  COLOR_SCHEME_STORAGE_KEY,
  applyColorSchemeOverride,
  computeNextColorSchemeOverride,
  readStoredColorScheme,
  resolveColorScheme,
} from './theme';

describe('theme color-scheme engine', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = '<meta name="color-scheme" content="light dark">';
  });

  it('implements divergence-at-toggle-time two-state logic cleanly', () => {
    // Starting with OS = light, no override -> toggle pins 'dark'
    const step1 = computeNextColorSchemeOverride(null, 'light');
    expect(step1).toBe('dark');

    // If OS switches to dark while pinned to 'dark', resolved stays 'dark'
    expect(resolveColorScheme(step1, 'dark')).toBe('dark');

    // If OS switches back to light, toggling again chooses light (matches OS) -> clears override
    const step4 = computeNextColorSchemeOverride(step1, 'light');
    expect(step4).toBeNull();

    // Starting with OS = dark, no override -> toggle pins 'light'
    expect(computeNextColorSchemeOverride(null, 'dark')).toBe('light');
    // Toggling again when OS = dark clears override back to system
    expect(computeNextColorSchemeOverride('light', 'dark')).toBeNull();
  });

  it('updates meta[name="color-scheme"] and localStorage accurately', () => {
    applyColorSchemeOverride('dark');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    expect(meta?.content).toBe('dark');
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredColorScheme()).toBe('dark');

    applyColorSchemeOverride(null);
    expect(meta?.content).toBe('light dark');
    expect(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBeNull();
    expect(readStoredColorScheme()).toBeNull();
  });
});
