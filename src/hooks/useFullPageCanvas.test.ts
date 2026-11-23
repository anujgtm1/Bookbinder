import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FULL_PAGE_STAGE_DEFAULT_CLASS,
  FULL_PAGE_STAGE_EXPANDED_CLASS,
  getFullPageStageClass,
  useFullPageCanvas,
} from './useFullPageCanvas';

describe('useFullPageCanvas', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    document.querySelectorAll('dialog').forEach((d) => d.remove());
  });

  it('toggles, enters, and exits expanded mode and locks/restores body overflow', () => {
    document.body.style.overflow = 'auto';

    const { result, unmount } = renderHook(() => useFullPageCanvas());
    expect(result.current.isExpanded).toBe(false);
    expect(document.body.style.overflow).toBe('auto');

    act(() => {
      result.current.enterExpanded();
    });
    expect(result.current.isExpanded).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      result.current.exitExpanded();
    });
    expect(result.current.isExpanded).toBe(false);
    expect(document.body.style.overflow).toBe('auto');

    act(() => {
      result.current.toggleExpanded();
    });
    expect(result.current.isExpanded).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Unmounting while expanded restores previous body overflow cleanly
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('exits expanded mode when Escape is pressed unless a native <dialog open> is active', () => {
    const { result } = renderHook(() => useFullPageCanvas());

    act(() => {
      result.current.enterExpanded();
    });
    expect(result.current.isExpanded).toBe(true);

    // An open native <dialog> blocks Escape from collapsing the canvas underneath it
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isExpanded).toBe(true);

    // Once the dialog closes, Escape exits expanded mode
    dialog.removeAttribute('open');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isExpanded).toBe(false);
  });

  it('returns the expected stage layout classes for default and expanded states', () => {
    expect(getFullPageStageClass(false)).toBe(FULL_PAGE_STAGE_DEFAULT_CLASS);
    expect(getFullPageStageClass(true)).toBe(FULL_PAGE_STAGE_EXPANDED_CLASS);
    expect(FULL_PAGE_STAGE_EXPANDED_CLASS).toContain('fixed inset-0 z-50 h-dvh w-screen');
  });
});
