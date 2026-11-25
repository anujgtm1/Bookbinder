import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument } from 'pdf-lib';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import * as storageModule from '@/core/storage';
import type { CoverPdfLayerMode } from '@/studio/renderEngine';
import {
  DEFAULT_BOOK_PARAMETERS,
  type PageSizeId,
  type PrintMediaId,
  type SplitMode,
} from '@/types/bookParams';
import { UnitConverter } from '@/types/units';
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
  defaultExportLayerMode = 'full',
  onReduceFlapWidth,
  onDetachSlipFlaps,
  onConfirmExport,
  onClose = vi.fn(),
}: {
  readonly target: PdfExportTarget;
  readonly geometry: ReturnType<typeof calculateCaseGeometry>;
  readonly initialMedia?: PrintMediaId;
  readonly initialPageSize?: PageSizeId;
  readonly initialSplitMode?: SplitMode;
  readonly defaultExportLayerMode?: CoverPdfLayerMode;
  readonly onReduceFlapWidth?: (widthMm: number) => void;
  readonly onDetachSlipFlaps?: () => void;
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
      onDetachSlipFlaps={onDetachSlipFlaps}
      defaultExportLayerMode={defaultExportLayerMode}
      onConfirmExport={onConfirmExport}
      onClose={onClose}
    />
  );
}

describe('PdfExportDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

    // Print defaults on cover-styled: Cut Lines ON, External Fold Guides ON, Fold Lines OFF
    expect(screen.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'false');

    // Toggle 600 DPI, toggle cut lines off, toggle fold lines on, toggle scale bar off
    await user.click(screen.getByTestId('pdf-opt-dpi-600'));
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('600 DPI');
    await user.click(screen.getByTestId('pdf-opt-cut-lines'));
    await user.click(screen.getByTestId('pdf-opt-fold-lines'));
    await user.click(screen.getByTestId('pdf-opt-scale-bar'));

    // Confirm download
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledTimes(1);
    expect(onConfirmExport).toHaveBeenCalledWith({
      target: 'cover-styled',
      printMediaId: 'letter',
      pageSizeId: 'letter',
      splitMode: 'single',
      includeCutLines: false,
      includeFoldLines: true,
      includeFoldGuideTicks: true,
      includeGuides: false,
      includeScaleBar: false,
      includeLegend: false,
      dpi: 600,
      tileOverlapMm: 15,
      exportLayerMode: 'full',
      appendInnerPocketsPage: false,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Download PDF when cover does not fit selected sheet and offers 1-click switch to Tabloid, 3-Piece Split, or Exact Wrap Size', async () => {
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

    // 1-click quick-switch buttons are rendered with canonical dimensions
    expect(screen.getByTestId('pdf-quick-switch-tabloid')).toHaveTextContent(
      'Switch to 1× Tabloid (11 × 17")',
    );
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

    // Print defaults on inner-styled: Cut Lines ON, External Fold Guides ON, Fold Lines OFF
    expect(screen.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'false');

    // Toggle Cut Lines OFF and External Fold Guides OFF and confirm
    await user.click(screen.getByTestId('pdf-opt-cut-lines'));
    await user.click(screen.getByTestId('pdf-opt-fold-ticks'));
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));

    expect(onConfirmExport).toHaveBeenCalledWith({
      target: 'inner-styled',
      printMediaId: 'letter',
      pageSizeId: 'tabloid',
      splitMode: 'single',
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: false,
      includeGuides: false,
      includeScaleBar: true,
      includeLegend: true,
      dpi: 300,
      tileOverlapMm: 10,
      exportLayerMode: 'full',
      appendInnerPocketsPage: false,
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

  it('supports Base Only (For HTV) print layer toggle and defaultExportLayerMode="base-only" for cover-styled target', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onConfirmExport = vi.fn();

    const { rerender } = render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={geom}
        initialMedia="exact-auto"
        onConfirmExport={onConfirmExport}
      />,
    );

    const fullBtn = screen.getByTestId('pdf-opt-layers-full');
    const baseOnlyBtn = screen.getByTestId('pdf-opt-layers-base-only');
    expect(fullBtn).toHaveAttribute('aria-pressed', 'true');
    expect(baseOnlyBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pdf-export-summary')).not.toHaveTextContent('Base Only (For HTV)');

    // Toggle to Base Only (For HTV) -> summary + helper caption update
    await user.click(baseOnlyBtn);
    expect(baseOnlyBtn).toHaveAttribute('aria-pressed', 'true');
    expect(fullBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('Base Only (For HTV)');
    expect(
      screen.getByText(/Omits text & ornaments so Cricut HTV \/ foil presses onto a clean printed base/i),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'cover-styled',
        exportLayerMode: 'base-only',
      }),
    );

    // Opening with defaultExportLayerMode="base-only" initializes Base Only active
    rerender(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={geom}
        initialMedia="exact-auto"
        defaultExportLayerMode="base-only"
        onConfirmExport={onConfirmExport}
      />,
    );
    expect(screen.getByTestId('pdf-opt-layers-base-only')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('Base Only (For HTV)');
  });

  it('offers 1-click Detach Flaps callout on tiled A6 slip cover and enables Include Detached Pockets (Page 2) toggle', async () => {
    const user = userEvent.setup();
    const baseA6 = {
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket' as const,
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      printMedia: 'letter' as const,
    };
    const integratedGeom = calculateCaseGeometry(baseA6);
    const separateGeom = calculateCaseGeometry({ ...baseA6, softcoverPocketMode: 'separate' });
    const onDetachSlipFlaps = vi.fn();
    const onConfirmExport = vi.fn();

    const { rerender } = render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={integratedGeom}
        initialMedia="letter"
        onDetachSlipFlaps={onDetachSlipFlaps}
        onConfirmExport={onConfirmExport}
      />,
    );

    // Tiled on US Letter with prominent 1-click Detach Flaps button
    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent('2 sheets (tiled)');
    const detachBtn = screen.getByTestId('pdf-detach-flaps-btn');
    expect(detachBtn).toHaveTextContent('Detach Flaps → 1× US Letter + Separate Pockets');
    expect(screen.queryByTestId('pdf-opt-append-pockets')).not.toBeInTheDocument();

    await user.click(detachBtn);
    expect(onDetachSlipFlaps).toHaveBeenCalledTimes(1);

    // Rerender with detached separate-pockets geometry -> flips to 1 sheet + Include Detached Pockets (Page 2) ON
    rerender(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={separateGeom}
        initialMedia="letter"
        onDetachSlipFlaps={onDetachSlipFlaps}
        onConfirmExport={onConfirmExport}
      />,
    );

    expect(screen.getByTestId('pdf-media-option-letter')).toHaveTextContent('1 sheet');
    expect(screen.queryByTestId('pdf-detach-flaps-btn')).not.toBeInTheDocument();
    const appendSwitch = screen.getByTestId('pdf-opt-append-pockets');
    expect(appendSwitch).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('+ Pockets');

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'cover-styled',
        printMediaId: 'letter',
        pageSizeId: 'letter',
        appendInnerPocketsPage: true,
      }),
    );
  });

  it('supports Custom Roll Width selection, live fit evaluation, and passes customRollWidthMm on confirm', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onConfirmExport = vi.fn();

    render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={geom}
        initialMedia="exact-auto"
        onConfirmExport={onConfirmExport}
      />,
    );

    await user.selectOptions(screen.getByTestId('pdf-export-roll-select'), 'roll-custom');
    const widthInput = screen.getByTestId('pdf-custom-roll-width-input');
    expect(widthInput).toBeInTheDocument();

    // Enter 610 mm (24") custom roll width
    await user.clear(widthInput);
    await user.type(widthInput, '610');
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent('Custom Roll (610 mm)');

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        printMediaId: 'roll-custom',
        customRollWidthMm: 610,
      }),
    );
  });

  it('expands Printer Margins & Calibration, applies asymmetric preset, downloads 1-click Margin Calibration Sheet PDF, and passes printerMargins on confirm', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(storageModule, 'triggerBytesDownload').mockImplementation(() => {});
    try {
      const a6Slip = calculateCaseGeometry({
        ...DEFAULT_BOOK_PARAMETERS,
        bindingStyle: 'softcover-jacket',
        pbWidthMm: 105,
        pbHeightMm: 148,
        pbThicknessMm: 5,
        printMedia: 'letter',
      });
      const onConfirmExport = vi.fn();

      render(
        <StatefulPdfExportDialog
          target="cover-styled"
          geometry={a6Slip}
          initialMedia="letter"
          onConfirmExport={onConfirmExport}
        />,
      );

      // Collapsed by default
      expect(screen.queryByTestId('pdf-margins-preset-select')).not.toBeInTheDocument();

      // Expand Printer Margins & Calibration
      await user.click(screen.getByTestId('pdf-margins-toggle'));
      const presetSelect = screen.getByTestId('pdf-margins-preset-select');
      expect(presetSelect).toBeInTheDocument();
      expect(screen.getByTestId('preview-unprintable-margin')).toBeInTheDocument();

      // Switch to Fine-Art / Heavy Sheet (Top 5, Bottom 20, Sides 5 mm)
      await user.selectOptions(presetSelect, 'fine-art-sheet');
      expect(screen.getByTestId('pdf-margin-bottom')).toHaveValue(20);

      // Download 1-click Margin Calibration Sheet PDF
      await user.click(screen.getByTestId('pdf-margin-test-sheet-btn'));
      await waitFor(() => {
        expect(downloadSpy).toHaveBeenCalledTimes(1);
      });
      const [pdfBytes, filename, mimeType] = downloadSpy.mock.calls[0];
      expect(filename).toBe('printer_margin_calibration_sheet.pdf');
      expect(mimeType).toBe('application/pdf');
      expect(pdfBytes.byteLength).toBeGreaterThan(500);
      expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe('%PDF-');

      // Confirm export passes asymmetric printerMargins
      await user.click(screen.getByTestId('pdf-export-confirm-btn'));
      expect(onConfirmExport).toHaveBeenCalledWith(
        expect.objectContaining({
          printMediaId: 'letter',
          printerMargins: expect.objectContaining({
            topMm: 5,
            bottomMm: 20,
            leftMm: 5,
            rightMm: 5,
            presetId: 'fine-art-sheet',
          }),
        }),
      );
    } finally {
      downloadSpy.mockRestore();
    }
  });

  it('enables Wide-Format Roll Multi-Up Nesting (2 across on 36" roll) with live strip preview and gang-sheet PDF queue', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onConfirmExport = vi.fn();

    render(
      <StatefulPdfExportDialog
        target="cover-styled"
        geometry={geom}
        initialMedia="exact-auto"
        onConfirmExport={onConfirmExport}
      />,
    );

    // Select 36" Roll -> Roll Nesting section appears with live capacity badge
    await user.selectOptions(screen.getByTestId('pdf-export-roll-select'), 'roll-36');
    expect(screen.getByTestId('pdf-roll-nesting-section')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-roll-capacity-badge')).toHaveTextContent(
      /Fits \d+ across on 36" roll/i,
    );

    // Enable Multi-Up / Roll Strip
    await user.click(screen.getByTestId('pdf-roll-nesting-toggle'));
    await user.click(screen.getByTestId('pdf-roll-copies-2'));

    // Live Roll Strip Preview renders 2 placed cover rectangles
    expect(screen.getByTestId('pdf-roll-strip-preview')).toBeInTheDocument();
    expect(screen.getAllByTestId('roll-nest-placed-item')).toHaveLength(2);
    expect(screen.getByTestId('pdf-export-summary')).toHaveTextContent(/1 roll strip • 36" Roll/i);

    // Upload another book cover PDF to the gang-sheet queue
    const extraDoc = await PDFDocument.create();
    extraDoc.addPage([UnitConverter.mmToPoints(320), UnitConverter.mmToPoints(220)]);
    const extraBytes = await extraDoc.save();
    const extraFile = new File([new Uint8Array(extraBytes)], 'second_book_cover.pdf', {
      type: 'application/pdf',
    });
    await user.upload(screen.getByTestId('pdf-roll-gang-upload'), extraFile);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-roll-gang-list')).toHaveTextContent('second_book_cover');
    });
    expect(screen.getAllByTestId('roll-nest-placed-item')).toHaveLength(3);

    // Also toggle Pack Inner Pockets beside cover
    await user.click(screen.getByTestId('pdf-roll-pack-pockets'));

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        printMediaId: 'roll-36',
        rollNesting: expect.objectContaining({
          enabled: true,
          copies: 2,
          gutterMm: 10,
          packInnerPockets: true,
          allowRotation: true,
          extraQueueItems: [
            expect.objectContaining({
              label: 'second_book_cover',
              copies: 1,
            }),
          ],
        }),
      }),
    );
  });

  it('shows all 3 independent Cut & Fold Marks switches across all 4 targets with exact print vs template defaults and updates the live SVG preview', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const onConfirmExport = vi.fn();

    // 1. outer-blueprint (template): all 3 ON by default
    const { rerender } = render(
      <StatefulPdfExportDialog
        target="outer-blueprint"
        geometry={geom}
        initialMedia="letter"
        onConfirmExport={onConfirmExport}
      />,
    );
    expect(screen.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('preview-fold-lines')).toBeInTheDocument();
    expect(screen.getByTestId('preview-fold-ticks')).toBeInTheDocument();

    // Toggle Fold Lines OFF -> preview hides dashed interior fold lines while keeping external ticks
    await user.click(screen.getByTestId('pdf-opt-fold-lines'));
    expect(screen.queryByTestId('preview-fold-lines')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-fold-ticks')).toBeInTheDocument();

    // Toggle External Fold Guides OFF -> preview hides external ticks
    await user.click(screen.getByTestId('pdf-opt-fold-ticks'));
    expect(screen.queryByTestId('preview-fold-ticks')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onConfirmExport).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'outer-blueprint',
        includeCutLines: true,
        includeFoldLines: false,
        includeFoldGuideTicks: false,
      }),
    );

    // 2. inner-blueprint (template): all 3 ON by default
    onConfirmExport.mockClear();
    const hcGeom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    rerender(
      <StatefulPdfExportDialog
        target="inner-blueprint"
        geometry={hcGeom}
        initialPageSize="tabloid"
        onConfirmExport={onConfirmExport}
      />,
    );
    expect(screen.getByTestId('pdf-opt-cut-lines')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-ticks')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pdf-opt-fold-lines')).toHaveAttribute('aria-checked', 'true');
  });
});
