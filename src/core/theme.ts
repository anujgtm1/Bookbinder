export type ColorSchemeOverride = 'light' | 'dark' | null;
export type ResolvedColorScheme = 'light' | 'dark';

export const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

export function parseStoredColorScheme(raw: string | null): ColorSchemeOverride {
  if (raw === 'light' || raw === 'dark') return raw;
  return null;
}

export function resolveColorScheme(
  override: ColorSchemeOverride,
  systemScheme: ResolvedColorScheme,
): ResolvedColorScheme {
  return override ?? systemScheme;
}

/**
 * Two-state toggle logic per modern-web-guidance `dark-mode-toggle`:
 * - Target is the opposite of the currently *rendered* scheme.
 * - If target matches the current system preference, clear the override so the site
 *   reverts to following system preference (`light dark`).
 * - Divergence is evaluated only at toggle time, never retroactively on OS changes.
 */
export function computeNextColorSchemeOverride(
  currentOverride: ColorSchemeOverride,
  systemScheme: ResolvedColorScheme,
): ColorSchemeOverride {
  const rendered = resolveColorScheme(currentOverride, systemScheme);
  const target: ResolvedColorScheme = rendered === 'dark' ? 'light' : 'dark';
  return target === systemScheme ? null : target;
}

export function getSystemColorScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function readStoredColorScheme(): ColorSchemeOverride {
  try {
    return parseStoredColorScheme(window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function applyColorSchemeOverride(override: ColorSchemeOverride): void {
  if (typeof document !== 'undefined') {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'color-scheme';
      document.head.appendChild(meta);
    }
    meta.content = override ?? 'light dark';
  }

  try {
    if (override === null) {
      window.localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, override);
    }
  } catch {
    // Still apply theme to document even when storage is blocked
  }
}
