import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FloatingHudToolbar,
  HudButton,
  HudGroup,
  HudSeparator,
} from './FloatingHudToolbar';

describe('FloatingHudToolbar', () => {
  it('renders ARIA toolbar semantics, roving keyboard navigation, and toggle pressed state', () => {
    const onSelect = vi.fn();
    const onDisabledClick = vi.fn();

    render(
      <FloatingHudToolbar label="Workbench controls" testId="hud">
        <HudGroup label="View">
          <HudButton pressed={true} onClick={() => onSelect('2d')}>
            2D Wrap
          </HudButton>
          <HudButton pressed={false} onClick={() => onSelect('3d')}>
            3D Book
          </HudButton>
        </HudGroup>
        <HudSeparator />
        <HudGroup label="Actions">
          <HudButton isDisabled onClick={onDisabledClick} aria-label="Reset">
            Reset
          </HudButton>
        </HudGroup>
      </FloatingHudToolbar>,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Workbench controls' });
    expect(toolbar.getAttribute('focusgroup')).toBe('toolbar wrap');
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');

    const btn2d = screen.getByRole('button', { name: '2D Wrap' });
    const btn3d = screen.getByRole('button', { name: '3D Book' });
    const btnReset = screen.getByRole('button', { name: 'Reset' });

    expect(btn2d).toHaveAttribute('aria-pressed', 'true');
    expect(btn3d).toHaveAttribute('aria-pressed', 'false');
    expect(btnReset).toHaveAttribute('aria-disabled', 'true');
    expect(btnReset).not.toHaveAttribute('aria-pressed');

    // Clicking a disabled toolbar button does not invoke handler (remains focusable per toolbar guide)
    fireEvent.click(btnReset);
    expect(onDisabledClick).not.toHaveBeenCalled();

    // Roving keyboard navigation fallback (jsdom does not implement native focusGroup)
    btn2d.focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(btn3d);

    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(document.activeElement).toBe(btnReset);

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(btn2d);

    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(btnReset);

    fireEvent.keyDown(toolbar, { key: 'Home' });
    expect(document.activeElement).toBe(btn2d);
  });
});
