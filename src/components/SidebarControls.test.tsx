import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS, type BookParameters } from '@/types/bookParams';
import { SidebarControls } from './SidebarControls';

describe('SidebarControls', () => {
  it('toggles units between mm and in and updates paperback dimensions', async () => {
    const user = userEvent.setup();
    let latest: BookParameters = { ...DEFAULT_BOOK_PARAMETERS };
    const onChange = vi.fn((next: BookParameters) => {
      latest = next;
    });

    const { rerender } = render(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('unit-toggle-in'));
    expect(latest.unit).toBe('in');

    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );

    const heightInput = screen.getByTestId('input-pb-height') as HTMLInputElement;
    // 216.0 mm => 8.50 in
    expect(heightInput.value).toBe('8.50');
  });

  it('expands collapsible construction settings and toggles 3-piece split mode', async () => {
    const user = userEvent.setup();
    let latest: BookParameters = { ...DEFAULT_BOOK_PARAMETERS };
    const onChange = vi.fn((next: BookParameters) => {
      latest = next;
    });

    render(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('split-mode-toggle')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('construction-settings-toggle'));
    const splitToggle = screen.getByTestId('split-mode-toggle');
    expect(splitToggle).toBeInTheDocument();

    await user.click(splitToggle);
    expect(latest.splitMode).toBe('three-piece');
  });

  it('invokes export and reset callbacks', async () => {
    const user = userEvent.setup();
    const onExportJson = vi.fn();
    const onResetDefaults = vi.fn();

    render(
      <SidebarControls
        params={DEFAULT_BOOK_PARAMETERS}
        onChange={vi.fn()}
        onExportJson={onExportJson}
        onImportJson={vi.fn()}
        onResetDefaults={onResetDefaults}
      />,
    );

    await user.click(screen.getByTestId('export-json-btn'));
    expect(onExportJson).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('reset-defaults-btn'));
    expect(onResetDefaults).toHaveBeenCalledTimes(1);
  });
});
