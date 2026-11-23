import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import {
  DEFAULT_BOOK_PARAMETERS,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import {
  PdfExportDialog,
  type PdfExportSelection,
  type PdfExportTarget,
} from './PdfExportDialog';

function StatefulPdfExportDialog({
  target,
  geometry,
  initialMedia = 'letter',
  initialPageSize = 'letter',
  initialSplitMode = 'single',
  onReduceFlapWidth,
  onConfirmExport,
  onClose = vi.fn(),
}: {
  readonly target: PdfExportTarget;
  readonly geometry: ReturnType<typeof calculateCaseGeometry>;
  readonly initialMedia?: PrintMediaId;
  readonly initialPageSize?: PageSizeId;
  readonly initialSplitMode?: SplitMode;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
  readonly onConfirmExport: (selection: PdfExportSelection) => void;
  readonly onClose?: () => void;
}) {
  const [media, setMedia] = useState<PrintMediaId>(initialMedia);
  const [pageSize, setPageSize] = useState<PageSizeId>(initialPageSize);
  const [splitMode, setSplitMode] = useState<SplitMode>(initialSplitMode);

  return (
    <PdfExportDialog
      open={true}
      target={target}
      geometry={geometry}
      unit="mm"
      printMediaId={media}
      onChangePrintMedia={setMedia}
      pageSizeId={pageSize}
      onChangePageSize={setPageSize}
      splitMode={splitMode}
      onChangeSplitMode={setSplitMode}
      onReduceFlapWidth={onReduceFlapWidth}
      onConfirmExport={onConfirmExport}
      onClose={onClose}
    />
  );
}

describe('PdfExportDialog', () => {
  it('opens native modal dialog for cover-styled A6 slip cover, compares Legal vs tiled Letter, toggles options, and confirms exact selection', async () => {
    const user = userEvent.setup();
    // A6 Slip Cover with 52.5 mm flaps: wrapW = (106*2 + 15) + 52.5*2 = 332 mm, wrapH = 150 + 20 = 170 mm
    // -> fits 1x US Legal Landscape (345.6 x 205.9 printable) and 2x US Letter tiled
    const a6SlipParams = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 14,
      jacketFlapWidthMm: 52.5,
      printMedia: 'letter' as const,
    };
    const geom = calculateCaseGeometry(a6SlipParams);
    const onConfirmExport = vi.fn();
    const onClose = vi.fn();

    render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={geom}
        initialMedia="letter"
        onConfirmExport={onConfirmExport}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByTestId('pdf-export-dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('closedby', 'any');
    expect(dialog).not.toHaveAttribute('role');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();

    // Live fit badges on media cards
    expect(screen.getByTestId('pdf-media-option-legal')).toHaveTextContent('1 sheet');
    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent('2 sheets (tiled)');

    // Initially on US Letter (tiled): Tile Overlap controls are visible
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/2 pages • US Letter/i);
    expect(screen.getByTestId('pdf-opt-overlap-10')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-opt-overlap-15')).toBeInTheDocument();

    // Switch to US Legal -> 1 sheet centered, overlap selector hides
    await user.click(screen.getByTestId('pdf-media-option-legal'));
    expect(screen.getByTestId('pdf-media-option-legal')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/1 page • US Legal/i);
    expect(screen.queryByTestId('pdf-opt-overlap-10')).not.toBeInTheDocument();

    // Switch back to US Letter -> overlap selector returns; pick 15 mm overlap
    await user.click(screen.getByTestId('pdf-media-option-letter'));
    await user.click(screen.getByTestId('pdf-opt-overlap-15'));
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('15 mm overlap');

    // Toggle 600 DPI, toggle guides off, toggle scale bar off
    await user.click(screen.getByTestId('pdf-opt-dpi-600'));
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('600 DPI');
    await user.click(screen.getByTestId('pdf-opt-guides'));
    await user.click(screen.getByTestId('pdf-opt-scale-bar'));

    // Confirm download
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledTimes(1);
    expect(onConfirmExport).toHaveBeenCalledWith({
      target: 'cover-styled',
      printMediaId: 'letter',
      pageSizeId: 'letter',
      splitMode: 'single',
      includeGuides: false,
      includeScaleBar: false,
      includeLegend: false,
      dpi: 600,
      tileOverlapMm: 15,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Download PDF when cover does not fit selected sheet and offers 1-click switch to Tabloid, 3-Piece Split, or Exact 1:1', async () => {
    const user = userEvent.setup();
    // 164 x 220 x 28 mm rigid hardcover -> wrap 418 x 263 mm:
    // exceeds US Letter even as 2 tiled sheets, but fits cleanly on 1x Tabloid
    const largeHardcover = {
      ...DEFAULT_BOOK_PARAMETERS,
      pbWidthMm: 164,
      pbHeightMm: 220,
      pbThicknessMm: 28,
      printMedia: 'letter' as const,
    };
    const geom = calculateCaseGeometry(largeHardcover);
    const onConfirmExport = vi.fn();

    render(
      <StatefulPdfExportDialog
        target="outer-blueprint"
        geometry={geom}
        initialMedia="letter"
        onConfirmExport={onConfirmExport}
      />,
    );

    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent("Doesn't fit");
    expect(screen.getByTestId('pdf-media-option-tabloid')).toHaveTextContent('1 sheet');

    const confirmBtn = screen.getByTestId('pdf-export-confirm-btn');
    expect(confirmBtn).toBeDisabled();

    // 1-click quick-switch buttons are rendered
    expect(screen.getByTestId('pdf-quick-switch-tabloid')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-quick-switch-three-piece')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-quick-switch-exact-auto')).toBeInTheDocument();

    // Clicking "Switch to 1x Tabloid" resolves the block and enables Download PDF
    await user.click(screen.getByTestId('pdf-quick-switch-tabloid'));
    expect(confirmBtn).not.toBeDisabled();
    expect(screen.getByTestId('pdf-media-option-tabloid')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/1 page • Tabloid/i);

    // Selecting a wide-format roll via the compact roll selector also works
    await user.selectOptions(screen.getByTestId('pdf-export-roll-select'), 'roll-17');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/17" Roll/i);

    await user.click(confirmBtn);
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'outer-blueprint',
        printMediaId: 'roll-17',
        splitMode: 'single',
        includeScaleBar: true,
      }),
    );
  });

  it('renders inner-styled Letter/A4/Legal/Tabloid cards with live page counts and updates when toggling Calibration & Legend', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onConfirmExport = vi.fn();

    render(
      <StatefulPdfExportDialog
        target="inner-styled"
        geometry={geom}
        initialPageSize="letter"
        onConfirmExport={onConfirmExport}
      />,
    );

    expect(screen.getByTestId('pdf-page-option-letter')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-option-a4')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-option-legal')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-option-tabloid')).toHaveTextContent('1 page');

    // Switch to Tabloid (1 page)
    await user.click(screen.getByTestId('pdf-page-option-tabloid'));
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/1 page • Tabloid/i);
    expect(screen.getByTestId('pdf-export-summary')).not.toHaveTextContent(/with 50 mm legend/i);

    // Toggle Calibration & Legend ON -> summary and SVG preview update live
    await user.click(screen.getByTestId('pdf-opt-legend'));
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/with 50 mm legend/i);
    expect(screen.getByTestId('pdf-export-sheet-preview')).toHaveTextContent('50 mm Legend');

    // Toggle Cut & Fold Lines OFF and confirm
    await user.click(screen.getByTestId('pdf-opt-guides'));
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));

    expect(onConfirmExport).toHaveBeenCalledWith({
      target: 'inner-styled',
      printMediaId: 'letter',
      pageSizeId: 'tabloid',
      splitMode: 'single',
      includeGuides: false,
      includeScaleBar: true,
      includeLegend: true,
      dpi: 300,
      tileOverlapMm: 10,
    });
  });

  it('fits A6 paperback-wrap onto 1x US Letter without 3-piece split toggle and offers shrink-flap quick-fix for oversized dust-jacket', async () => {
    const user = userEvent.setup();
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      printMedia: 'letter',
    });

    const onConfirmExport = vi.fn();
    const { rerender } = render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={pbGeom}
        initialMedia="letter"
        onConfirmExport={onConfirmExport}
      />,
    );

    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent('1 sheet');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/1 page • US Letter/i);
    expect(screen.queryByTestId('pdf-opt-split-three')).not.toBeInTheDocument();

    // Dust jacket on A6 with 70 mm flaps (363.5 x 148 mm) -> 2 tiled sheets on Letter with 1-click shrink-flap fix to 22.9 mm
    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 70,
      printMedia: 'letter',
    });
    const onReduceFlapWidth = vi.fn();
    rerender(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={djGeom}
        initialMedia="letter"
        onReduceFlapWidth={onReduceFlapWidth}
        onConfirmExport={onConfirmExport}
      />,
    );

    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent('2 sheets (tiled)');
    expect(screen.queryByTestId('pdf-opt-split-three')).not.toBeInTheDocument();

    const reduceBtn = screen.getByTestId('pdf-quick-reduce-flap');
    expect(reduceBtn).toHaveTextContent('22.9 mm');
    await user.click(reduceBtn);
    expect(onReduceFlapWidth).toHaveBeenCalledWith(22.9);
  });
});
