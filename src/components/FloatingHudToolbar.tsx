import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FloatingHudToolbarProps {
  readonly label: string;
  readonly controlsId?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly children: ReactNode;
}

/**
 * Accessible floating HUD pill toolbar following modern-web-guidance (`toolbar`):
 * - Uses native `focusgroup="toolbar wrap"` when supported by the browser
 * - Installs a roving-tabindex + ArrowLeft/ArrowRight/Home/End fallback only when
 *   `'focusGroup' in HTMLElement.prototype` is false.
 */
export function FloatingHudToolbar({
  label,
  controlsId,
  className,
  testId,
  children,
}: FloatingHudToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if ('focusGroup' in HTMLElement.prototype) return;

    const getItems = () => Array.from(bar.querySelectorAll<HTMLButtonElement>('button.hud-toolbar-btn'));
    const items = getItems();
    if (items.length > 0 && !items.some((el) => el.tabIndex === 0)) {
      items.forEach((btn, idx) => {
        btn.tabIndex = idx === 0 ? 0 : -1;
      });
    }

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const currentItems = getItems();
      if (!(target instanceof HTMLButtonElement) || !currentItems.includes(target)) return;
      currentItems.forEach((btn) => {
        btn.tabIndex = btn === target ? 0 : -1;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const currentItems = getItems();
      if (currentItems.length === 0) return;
      const activeIdx = currentItems.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIdx === -1) return;

      const rtl = getComputedStyle(bar).direction === 'rtl';
      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIdx = (activeIdx + (rtl ? -1 : 1) + currentItems.length) % currentItems.length;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = (activeIdx + (rtl ? 1 : -1) + currentItems.length) % currentItems.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = currentItems.length - 1;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        currentItems.forEach((btn, idx) => {
          btn.tabIndex = idx === nextIdx ? 0 : -1;
        });
        currentItems[nextIdx].focus();
      }
    };

    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, [children]);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={label}
      aria-controls={controlsId}
      data-testid={testId}
      {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className={cn('hud-toolbar', className)}
    >
      {children}
    </div>
  );
}

export interface HudGroupProps {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function HudGroup({ label, className, children }: HudGroupProps) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-0.5', className)}>
      {children}
    </div>
  );
}

export function HudSeparator() {
  return <span role="separator" aria-orientation="vertical" className="hud-toolbar-separator" />;
}

export interface HudButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled'> {
  /** Omit for action buttons; set boolean for stateful toggle buttons. */
  readonly pressed?: boolean;
  /** Uses aria-disabled so toolbar items stay keyboard-reachable. */
  readonly isDisabled?: boolean;
}

export function HudButton({
  pressed,
  isDisabled = false,
  className,
  onClick,
  children,
  ...rest
}: HudButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-disabled={isDisabled ? 'true' : undefined}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn('hud-toolbar-btn', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
