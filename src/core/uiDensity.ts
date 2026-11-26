export type UiDensity = 'clean' | 'all';

export const UI_DENSITY_STORAGE_KEY = 'bookbinder-ui-density';

export function parseStoredUiDensity(raw: string | null): UiDensity {
  if (raw === 'all' || raw === 'clean') return raw;
  return 'clean';
}

export function readStoredUiDensity(): UiDensity {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'clean';
    }
    return parseStoredUiDensity(window.localStorage.getItem(UI_DENSITY_STORAGE_KEY));
  } catch {
    return 'clean';
  }
}

export function saveUiDensity(density: UiDensity): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, density);
  } catch {
    // Ignore storage quota or privacy-mode errors gracefully
  }
}
