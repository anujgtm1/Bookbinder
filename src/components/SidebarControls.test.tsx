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

  it('renders slip flap controls only for softcover-jacket and applies Deep (38 mm) and Fit Letter presets', async () => {
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

    // Not rendered for rigid-case or flexible-spine
    expect(screen.queryByTestId('softcover-flap-controls')).not.toBeInTheDocument();

    latest = { ...DEFAULT_BOOK_PARAMETERS, bindingStyle: 'flexible-spine' };
    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('softcover-flap-controls')).not.toBeInTheDocument();

    // Rendered for softcover-jacket (5 mm A6 notebook)
    latest = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    };
    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );

    expect(screen.getByTestId('softcover-flap-controls')).toBeInTheDocument();
    expect(screen.getByTestId('slider-jacket-flap-width')).toBeInTheDocument();

    await user.click(screen.getByTestId('flap-preset-deep'));
    expect(latest.jacketFlapWidthMm).toBe(38);

    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );
    expect(screen.getByTestId('jacket-flap-width-value')).toHaveTextContent('38.0 mm');

    await user.click(screen.getByTestId('flap-preset-letter'));
    expect(latest.jacketFlapWidthMm).toBeCloseTo(25.7, 1);

    await user.click(screen.getByTestId('flap-preset-a4'));
    expect(latest.jacketFlapWidthMm).toBeCloseTo(34.5, 1);
  });

  it('renders Jacket Flap Width (up to 100 mm) + Classic (70 mm) / Fit Letter presets for dust-jacket and hides chipboard controls', async () => {
    const user = userEvent.setup();
    let latest: BookParameters = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    };
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

    const flapControls = screen.getByTestId('softcover-flap-controls');
    expect(flapControls).toHaveTextContent('Jacket Flap Width');
    const slider = screen.getByTestId('slider-jacket-flap-width') as HTMLInputElement;
    expect(slider.max).toBe('100');
    expect(screen.getByTestId('flap-preset-deep')).toHaveTextContent('Classic (70 mm)');

    await user.click(screen.getByTestId('flap-preset-deep'));
    expect(latest.jacketFlapWidthMm).toBe(70);

    await user.click(screen.getByTestId('flap-preset-letter'));
    // innerW = 106*2 + 11.5 = 223.5; printable Letter long = 269.4 -> floor((45.9/2)*10)/10 = 22.9 mm
    expect(latest.jacketFlapWidthMm).toBeCloseTo(22.9, 1);

    // Chipboard, 3-piece split, and Inner Envelopes PDF sheet size are hidden on dust-jacket
    expect(screen.queryByTestId('pdf-page-size-select')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('construction-settings-toggle'));
    expect(screen.queryByTestId('input-board-thickness')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-turn-in')).not.toBeInTheDocument();
    expect(screen.queryByTestId('split-mode-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('bleed-toggle')).toBeInTheDocument();

    // Switch to paperback-wrap -> hides flap controls as well as chipboard & inner pocket controls
    latest = { ...latest, bindingStyle: 'paperback-wrap' };
    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('softcover-flap-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-board-thickness')).not.toBeInTheDocument();
    expect(screen.queryByTestId('split-mode-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-page-size-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('bleed-toggle')).toBeInTheDocument();
  });

  it('shows live inline shallow-flap warning with 1-click recommended fix for softcover-jacket and dust-jacket', async () => {
    const user = userEvent.setup();
    let latest: BookParameters = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 140,
      jacketFlapWidthMm: 24,
    };
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

    // 1. Softcover slip cover: 24 mm < 35.0 mm recommended -> shows warning & Use 35.0 mm button
    expect(screen.getByTestId('flap-recommended-min')).toHaveTextContent('Rec. ≥ 35.0 mm');
    const slipWarning = screen.getByTestId('flap-shallow-warning');
    expect(slipWarning).toHaveTextContent('17% of page width');
    expect(slipWarning).toHaveTextContent('≥ 35.0 mm');
    expect(screen.queryByTestId('flap-depth-ok')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flap-set-recommended-btn'));
    expect(latest.jacketFlapWidthMm).toBe(35);

    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('flap-shallow-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('flap-depth-ok')).toHaveTextContent('25% of page width');
    expect(screen.getByTestId('flap-depth-ok')).toHaveTextContent('meets ≥ 35.0 mm recommendation');

    // 2. Classic dust jacket: 140 mm width with 35 mm flap -> below 53.2 mm recommendation
    latest = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 140,
      jacketFlapWidthMm: 35,
    };
    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );

    expect(screen.getByTestId('flap-recommended-min')).toHaveTextContent('Rec. ≥ 53.2 mm');
    const djWarning = screen.getByTestId('flap-shallow-warning');
    expect(djWarning).toHaveTextContent('25% of page width');
    expect(djWarning).toHaveTextContent('≥ 53.2 mm');

    await user.click(screen.getByTestId('flap-set-recommended-btn'));
    expect(latest.jacketFlapWidthMm).toBe(53.2);

    rerender(
      <SidebarControls
        params={latest}
        onChange={onChange}
        onExportJson={vi.fn()}
        onImportJson={vi.fn()}
        onResetDefaults={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('flap-shallow-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('flap-depth-ok')).toHaveTextContent('38% of page width');
    expect(screen.getByTestId('flap-depth-ok')).toHaveTextContent('meets ≥ 53.2 mm recommendation');
  });
});
