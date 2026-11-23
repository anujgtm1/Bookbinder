import { useCallback, useEffect, useState } from 'react';

export const FULL_PAGE_STAGE_EXPANDED_CLASS =
  'fixed inset-0 z-50 h-dvh w-screen border-0 rounded-none';

export const FULL_PAGE_STAGE_DEFAULT_CLASS =
  'relative h-[470px] w-full border-y sm:h-[510px]';

export const FULL_PAGE_EXIT_BUTTON_CLASS =
  'pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brass-bright/45 bg-[#12211d]/92 px-3 py-1.5 text-xs font-medium text-[#f6efe2] shadow-lg backdrop-blur-md transition-colors hover:border-brass-bright/80 hover:bg-[#19302a]';

export function getFullPageStageClass(isExpanded: boolean): string {
  return isExpanded ? FULL_PAGE_STAGE_EXPANDED_CLASS : FULL_PAGE_STAGE_DEFAULT_CLASS;
}

export interface FullPageCanvasState {
  readonly isExpanded: boolean;
  readonly enterExpanded: () => void;
  readonly exitExpanded: () => void;
  readonly toggleExpanded: () => void;
}

/**
 * Manages full-page canvas focus mode for cutting-mat stages:
 * - Locks `document.body.style.overflow` while expanded and restores the prior value on exit/unmount.
 * - Listens for `Escape` on `window` to exit focus mode unless a native `<dialog open>` is active.
 */
export function useFullPageCanvas(): FullPageCanvasState {
  const [isExpanded, setIsExpanded] = useState(false);

  const enterExpanded = useCallback(() => setIsExpanded(true), []);
  const exitExpanded = useCallback(() => setIsExpanded(false), []);
  const toggleExpanded = useCallback(() => setIsExpanded((prev) => !prev), []);

  useEffect(() => {
    if (!isExpanded || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return;
      setIsExpanded(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded]);

  return {
    isExpanded,
    enterExpanded,
    exitExpanded,
    toggleExpanded,
  };
}
