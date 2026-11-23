import { BookOpen, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  COLOR_SCHEME_STORAGE_KEY,
  applyColorSchemeOverride,
  computeNextColorSchemeOverride,
  getSystemColorScheme,
  parseStoredColorScheme,
  readStoredColorScheme,
  resolveColorScheme,
  type ColorSchemeOverride,
  type ResolvedColorScheme,
} from '@/core/theme';

export interface HeaderProps {
  readonly statusMessage: string | null;
  readonly sidebarOpen?: boolean;
  readonly onToggleSidebar?: () => void;
}

export function Header({ statusMessage, sidebarOpen = true, onToggleSidebar }: HeaderProps) {
  const [override, setOverride] = useState<ColorSchemeOverride>(() => readStoredColorScheme());
  const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(() =>
    getSystemColorScheme(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = (e: MediaQueryListEvent) => {
      // Never remove stored override when OS changes (per modern-web-guidance)
      setSystemScheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', onMediaChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key === COLOR_SCHEME_STORAGE_KEY) {
        const next = parseStoredColorScheme(e.newValue);
        setOverride(next);
        applyColorSchemeOverride(next);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      mq.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const resolved = resolveColorScheme(override, systemScheme);

  const handleToggleTheme = () => {
    const next = computeNextColorSchemeOverride(override, systemScheme);
    setOverride(next);
    applyColorSchemeOverride(next);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xs">
      <a
        href="#main-workspace"
        className="visually-hidden fixed left-3 top-3 z-50 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md"
      >
        Skip to workspace
      </a>

      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3 px-3 py-2 sm:px-5">
        <div className="flex items-center gap-2.5">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onToggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="book-spec-rail"
              aria-label={sidebarOpen ? 'Collapse book dimensions rail' : 'Expand book dimensions rail'}
              title={sidebarOpen ? 'Hide Book Spec Rail' : 'Show Book Spec Rail'}
              data-testid="toggle-sidebar-btn"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          )}

          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-mat text-brass-bright ring-1 ring-brass-bright/45 shadow-xs">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2.5">
            <h1 className="font-serif text-lg font-semibold leading-none tracking-tight text-foreground sm:text-xl">
              Bookbinder Studio
            </h1>
            <span className="hidden text-[11px] font-medium tracking-wide text-muted-foreground md:inline">
              1:1 mm Hardcover Case &amp; Pocket Workbench
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            data-testid="status-message"
            className="hidden max-w-72 truncate rounded-full border border-border/80 bg-secondary/70 px-2.5 py-1 text-[11px] text-muted-foreground sm:block"
          >
            {statusMessage ?? 'Auto-saved locally'}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleToggleTheme}
            data-testid="theme-toggle-btn"
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {resolved === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
