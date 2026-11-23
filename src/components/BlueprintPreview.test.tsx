import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { BlueprintPreview } from './BlueprintPreview';

describe('BlueprintPreview', () => {
  it('renders outer wrap blueprint and triggers all four 2x2 SVG/PDF downloads', async () => {
    const user = userEvent.setup();
    const onDownloadOuterSvg = vi.fn();
    const onDownloadOuterPdf = vi.fn();
    const onDownloadInnerSvg = vi.fn();
    const onDownloadInnerPdf = vi.fn();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <BlueprintPreview
        geometry={geom}
        splitMode="single"
        pdfPageSize="letter"
        unit="mm"
        onDownloadOuterSvg={onDownloadOuterSvg}
        onDownloadOuterPdf={onDownloadOuterPdf}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
      />,
    );

    expect(screen.getByTestId('outer-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-cut-polygon')).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-bleed-rect')).toBeInTheDocument();

    await user.click(screen.getByTestId('download-outer-svg-btn'));
    expect(onDownloadOuterSvg).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('download-outer-pdf-btn'));
    expect(onDownloadOuterPdf).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('download-inner-svg-btn'));
    expect(onDownloadInnerSvg).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    expect(onDownloadInnerPdf).toHaveBeenCalledTimes(1);
  });

  it('switches to Inner Pockets & Spine Liner tab and supports 3-piece split mode', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, splitMode: 'three-piece' });

    render(
      <BlueprintPreview
        geometry={geom}
        splitMode="three-piece"
        pdfPageSize="tabloid"
        unit="mm"
        onDownloadOuterSvg={vi.fn()}
        onDownloadOuterPdf={vi.fn()}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
      />,
    );

    expect(screen.getByTestId('blueprint-split-panels')).toBeInTheDocument();

    await user.click(screen.getByTestId('blueprint-tab-inner'));
    expect(screen.getByTestId('inner-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByText(/1 page • TABLOID/i)).toBeInTheDocument();
  });
});
