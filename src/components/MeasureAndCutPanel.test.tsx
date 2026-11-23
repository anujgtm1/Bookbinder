import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { MeasureAndCutPanel } from './MeasureAndCutPanel';

describe('MeasureAndCutPanel', () => {
  it('renders the full CutListCard, 1:1 mm blueprint canvas with CAD dimensions, and export buttons', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onDownloadOuterSvg = vi.fn();
    const onDownloadOuterPdf = vi.fn();

    render(
      <MeasureAndCutPanel
        geometry={geom}
        splitMode="single"
        unit="mm"
        onDownloadOuterSvg={onDownloadOuterSvg}
        onDownloadOuterPdf={onDownloadOuterPdf}
      />,
    );

    expect(screen.getByTestId('measure-and-cut-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cut-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('143.0 × 223.0 mm');
    expect(screen.getByTestId('outer-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByTestId('outer-blueprint-dimensions')).toBeInTheDocument();

    await user.click(screen.getByTestId('measure-download-svg-btn'));
    expect(onDownloadOuterSvg).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('measure-download-pdf-btn'));
    expect(onDownloadOuterPdf).toHaveBeenCalledTimes(1);
  });

  it('toggles CAD dimensions and updates zoom level via the Floating HUD toolbar', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <MeasureAndCutPanel
        geometry={geom}
        splitMode="single"
        unit="mm"
        onDownloadOuterSvg={vi.fn()}
        onDownloadOuterPdf={vi.fn()}
      />,
    );

    const dimsBtn = screen.getByTestId('measure-dimensions-btn');
    expect(dimsBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('outer-blueprint-dimensions')).toBeInTheDocument();

    await user.click(dimsBtn);
    expect(dimsBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('outer-blueprint-dimensions')).not.toBeInTheDocument();

    await user.click(dimsBtn);
    expect(screen.getByTestId('outer-blueprint-dimensions')).toBeInTheDocument();

    expect(screen.getByTestId('measure-zoom-readout')).toHaveTextContent('100%');
    await user.click(screen.getByTestId('measure-zoom-in-btn'));
    expect(screen.getByTestId('measure-zoom-readout')).toHaveTextContent('125%');

    await user.click(screen.getByTestId('measure-zoom-out-btn'));
    expect(screen.getByTestId('measure-zoom-readout')).toHaveTextContent('100%');

    await user.click(screen.getByTestId('measure-zoom-in-btn'));
    await user.click(screen.getByTestId('measure-zoom-reset-btn'));
    expect(screen.getByTestId('measure-zoom-readout')).toHaveTextContent('100%');
  });

  it('renders 3-piece split panels when splitMode is three-piece', () => {
    const splitParams = { ...DEFAULT_BOOK_PARAMETERS, splitMode: 'three-piece' as const };
    const geom = calculateCaseGeometry(splitParams);

    render(
      <MeasureAndCutPanel
        geometry={geom}
        splitMode="three-piece"
        unit="mm"
        onDownloadOuterSvg={vi.fn()}
        onDownloadOuterPdf={vi.fn()}
      />,
    );

    expect(screen.getByTestId('blueprint-split-panels')).toBeInTheDocument();
  });
});
