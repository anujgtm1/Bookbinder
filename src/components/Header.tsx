import {
  ChevronDown,
  Library,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { QuickSizePopover } from '@/components/QuickSizePopover';
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
import type { UiDensity } from '@/core/uiDensity';
import type { BookParameters } from '@/types/bookParams';

export interface HeaderProps {
  readonly statusMessage: string | null;
  readonly sidebarOpen?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly onLoadSampleBook?: () => void;
  readonly activeBookName?: string;
  readonly activeBookSwatchColor?: string;
  readonly savedBookCount?: number;
  readonly onOpenMyBooks?: () => void;
  readonly params?: BookParameters;
  readonly onChangeParams?: (next: BookParameters) => void;
  readonly onOpenMeasureBench?: () => void;
  readonly uiDensity?: UiDensity;
  readonly onToggleUiDensity?: () => void;
}

export function Header({
  statusMessage,
  sidebarOpen = false,
  onToggleSidebar,
  onLoadSampleBook,
  activeBookName,
  activeBookSwatchColor = '#1e293b',
  savedBookCount,
  onOpenMyBooks,
  params,
  onChangeParams,
  onOpenMeasureBench,
  uiDensity = 'clean',
  onToggleUiDensity,
}: HeaderProps) {
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

  const displayBookName = activeBookName?.trim() || 'Untitled Book';

  return (
    <header className="washi-header sticky top-0 z-30 border-t-2 border-t-vermilion border-b border-border">
      <a
        href="#main-workspace"
        className="visually-hidden fixed left-3 top-3 z-50 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md"
      >
        Skip to workspace
      </a>

      <div className="mx-auto flex max-w-[1760px] items-start justify-between gap-4 px-3 py-2 sm:px-5">
        {/* Left Cluster: Active Book Switcher, Quick Size Popover, Sample Book, Spec Rail Toggle & Status */}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          {onOpenMyBooks && (
            <button
              type="button"
              onClick={onOpenMyBooks}
              data-testid="open-my-books-btn"
              aria-label={`My Books — ${displayBookName}`}
              title={`Editing Book: ${displayBookName} — Click to open My Books`}
              className="inline-flex h-9 max-w-64 cursor-pointer items-center gap-2 rounded-[3px] border border-brass/60 bg-card/90 px-2.5 text-left text-foreground motion-safe:transition-colors hover:border-brass hover:bg-brass/10 sm:max-w-80"
            >
              <span
                aria-hidden="true"
                className="h-5 w-3.5 shrink-0 rounded-[2px] border border-black/25 shadow-2xs"
                style={{ backgroundColor: activeBookSwatchColor }}
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  <Library className="h-2.5 w-2.5 shrink-0 text-brass" aria-hidden="true" />
                  <span>Editing Book · My Books</span>
                </span>
                <span
                  data-testid="active-book-name"
                  className="truncate font-serif text-sm font-semibold leading-tight text-foreground"
                >
                  {displayBookName}
                </span>
              </span>
              {typeof savedBookCount === 'number' && savedBookCount > 0 && (
                <span
                  data-testid="my-books-count-badge"
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border/80 bg-secondary px-1 font-mono text-[10px] leading-none text-foreground"
                >
                  {savedBookCount}
                </span>
              )}
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          )}

          {params && onChangeParams && onOpenMeasureBench && (
            <QuickSizePopover
              params={params}
              onChange={onChangeParams}
              onOpenMeasureBench={onOpenMeasureBench}
            />
          )}

          {onLoadSampleBook && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-vermilion/45 bg-card/80 px-2.5 text-xs font-medium text-foreground hover:border-vermilion hover:bg-vermilion/10"
              onClick={onLoadSampleBook}
              data-testid="load-sample-book-btn"
              aria-label="Load sample book project"
              title="Load sample classic hardcover with marbled endpapers"
            >
              <Sparkles className="h-3.5 w-3.5 text-vermilion" aria-hidden="true" />
              <span className="hidden sm:inline">Sample Book</span>
            </Button>
          )}

          {onToggleSidebar && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onToggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="book-spec-rail"
              aria-label={
                sidebarOpen ? 'Collapse book dimensions rail' : 'Expand book dimensions rail'
              }
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

          <div
            role="status"
            aria-live="polite"
            data-testid="status-message"
            className="hidden max-w-56 items-center gap-1.5 border-l border-border/80 pl-2.5 font-mono text-[11px] text-muted-foreground xl:inline-flex"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-vermilion"
            />
            <span className="truncate">{statusMessage ?? 'Auto-saved locally'}</span>
          </div>
        </div>

        {/* Very Top-Right Corner: Isolated Static Icon Controls (UI Density + Theme) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 self-start pl-3">
          {onToggleUiDensity && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`h-8 w-8 ${
                uiDensity === 'all'
                  ? 'border-vermilion bg-vermilion/12 text-vermilion ring-1 ring-vermilion/35 hover:bg-vermilion/20'
                  : ''
              }`}
              onClick={onToggleUiDensity}
              aria-pressed={uiDensity === 'all'}
              data-testid="ui-density-toggle-btn"
              aria-label={
                uiDensity === 'all' ? 'Switch to Clean Mode' : 'Switch to All Controls'
              }
              title={uiDensity === 'all' ? 'Switch to Clean Mode' : 'Switch to All Controls'}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleToggleTheme}
            data-testid="theme-toggle-btn"
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {resolved === 'dark' ? (
              <Sun className="h-4 w-4 text-brass-bright" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
