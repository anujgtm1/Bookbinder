import { Moon, PanelLeftClose, PanelLeftOpen, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import atelierColophonImg from '@/assets/atelier/atelier-colophon.jpg';
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
  readonly onLoadSampleBook?: () => void;
  readonly navSlot?: ReactNode;
}

export function Header({
  statusMessage,
  sidebarOpen = true,
  onToggleSidebar,
  onLoadSampleBook,
  navSlot,
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

  return (
    <header className="washi-header sticky top-0 z-30 border-t-2 border-t-vermilion border-b border-border">
      <a
        href="#main-workspace"
        className="visually-hidden fixed left-3 top-3 z-50 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md"
      >
        Skip to workspace
      </a>

      <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-x-4 px-3 sm:px-5">
        {/* Editorial Press Masthead Mark */}
        <div className="order-1 flex items-center gap-2.5 py-2">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
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

          <span className="colophon-frame h-9 w-9 sm:h-10 sm:w-10" aria-hidden="true">
            <img
              src={atelierColophonImg}
              alt=""
              width={40}
              height={40}
              className="colophon-emblem h-full w-full object-contain"
            />
          </span>

          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <h1 className="font-serif text-lg font-semibold leading-none tracking-tight text-foreground sm:text-xl">
                  Bookbinder Studio
                </h1>
                <span
                  aria-hidden="true"
                  title="Tokyo Bindery Press Mark"
                  className="hanko-seal h-[18px] w-[18px] text-[10px]"
                >
                  印
                </span>
              </div>
              <span className="mt-0.5 hidden font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground 2xl:inline">
                Folio Case &amp; Cover Workbench
              </span>
            </div>
          </div>
        </div>

        {/* Centered Integrated 3-Mode Editorial Navigation */}
        {navSlot && (
          <nav
            aria-label="Workbench modes"
            className="order-3 flex w-full items-stretch justify-center border-t border-border/70 md:order-2 md:w-auto md:self-stretch md:border-t-0"
          >
            {navSlot}
          </nav>
        )}

        {/* Right Editorial Press Controls */}
        <div className="order-2 flex items-center gap-2 py-2 md:order-3">
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
