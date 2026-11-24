import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { CricutExportDialog } from './CricutExportDialog';
import * as cricutPrintThenCut from './cricutPrintThenCut';
import type { CustomFontAsset } from './fonts';

const TEST_CUSTOM_FONT: CustomFontAsset = {
  familyName: 'TestGaramond',
  fileName: 'eb-garamond.woff',
  bytes: new Uint8Array(
    readFileSync(
      resolve(
        process.cwd(),
        'node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff',
      ),
    ),
  ),
  pdfEmbeddable: true,
};

describe('CricutExportDialog', () => {
  it('renders native modal dialog, toggles scope & HTV mirror, and triggers SVG download', async () => {
    const user = userEvent.setup();
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-cricut-svg');
    URL.revokeObjectURL = vi.fn();

    try {
      const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
      const studio = {
        ...CoverStudioModel.createDefault(),
        spineText: {
          ...CoverStudioModel.createDefault().spineText,
          title: 'DUNE',
          author: 'FRANK HERBERT',
        },
      };
      const onOpenChange = vi.fn();
      const onStatusMessage = vi.fn();

      render(
        <CricutExportDialog
          open={true}
          geometry={geom}
          studio={studio}
          customFont={null}
          unit="mm"
          onOpenChange={onOpenChange}
          onStatusMessage={onStatusMessage}
        />,
      );

      const dialog = screen.getByTestId('cricut-export-dialog');
      expect(dialog).toHaveAttribute('closedby', 'any');
      expect(dialog).not.toHaveAttribute('role');
      expect(dialog).not.toHaveAttribute('aria-modal');

      await waitFor(() => {
        expect(screen.getByTestId('cricut-svg-preview-img')).toBeInTheDocument();
      });
      expect(screen.getByTestId('cricut-preview-mat')).toHaveClass('cricut-mat-surface');

      // Switch scope to Full Cover Wrap -> outer cut switch appears
      await user.click(screen.getByTestId('cricut-scope-fullwrap'));
      expect(screen.getByTestId('cricut-outer-cut-switch')).toBeInTheDocument();

      // Toggle Mirror Horizontally (HTV)
      await user.click(screen.getByTestId('cricut-mirror-switch'));
      expect(screen.getByText('Mirrored')).toBeInTheDocument();

      // Wait for regenerated mirrored preview before downloading
      await waitFor(() => {
        expect(screen.getByTestId('cricut-download-btn')).not.toBeDisabled();
      });

      // Download button triggers export status message
      await user.click(screen.getByTestId('cricut-download-btn'));
      expect(onStatusMessage).toHaveBeenCalledWith(
        expect.stringContaining('_cricut_htv_fullwrap_mirrored.svg'),
      );
    } finally {
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });

  it('supports Split Mats by Foil Color with color dots and hands off cleanly to Export Printed Base PDF', async () => {
    const user = userEvent.setup();
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-cricut-multicolor');
    URL.revokeObjectURL = vi.fn();

    try {
      const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
      const bleed = geom.outerWrap.bleedMm;
      const frontRect = {
        x: geom.outerWrap.frontBoardRect.x + bleed,
        y: geom.outerWrap.frontBoardRect.y + bleed,
        width: geom.outerWrap.frontBoardRect.width,
        height: geom.outerWrap.frontBoardRect.height,
      };
      const studio = {
        ...CoverStudioModel.createDefault(),
        textLayers: [
          {
            ...CoverTextLayerModel.createPreset('front-title', frontRect),
            text: 'ODYSSEY',
            fontId: 'custom' as const,
            color: '#d4af37',
          },
        ],
        ornaments: [
          CoverOrnamentLayerModel.createForZone(
            'frame-double-rule',
            frontRect,
            'front',
            '#f5efe2',
          ),
        ],
      };
      const onOpenChange = vi.fn();
      const onStatusMessage = vi.fn();
      const onOpenBasePdfForHtv = vi.fn();

      render(
        <CricutExportDialog
          open={true}
          geometry={geom}
          studio={studio}
          customFont={TEST_CUSTOM_FONT}
          unit="mm"
          onOpenChange={onOpenChange}
          onStatusMessage={onStatusMessage}
          onOpenBasePdfForHtv={onOpenBasePdfForHtv}
        />,
      );

      // Smart default selects Front Cover and detects both Gold & Cream foil colors
      await waitFor(() => {
        expect(screen.getByTestId('cricut-foil-color-dots')).toBeInTheDocument();
      });
      expect(screen.getByText(/2 foil colors detected/i)).toBeInTheDocument();

      // Enable Split Mats by Foil Color
      await user.click(screen.getByTestId('cricut-group-by-color-switch'));
      await waitFor(() => {
        expect(screen.getByText('Foil Mats (2)')).toBeInTheDocument();
        expect(screen.getByTestId('cricut-download-btn')).not.toBeDisabled();
      });

      // Download exports multicolor SVG
      await user.click(screen.getByTestId('cricut-download-btn'));
      expect(onStatusMessage).toHaveBeenCalledWith(
        expect.stringContaining('_cricut_htv_front_multicolor.svg'),
      );

      // Export Printed Base PDF handoff closes Cricut dialog & invokes callback
      await user.click(screen.getByTestId('cricut-open-base-pdf-btn'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onOpenBasePdfForHtv).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });

  it('defaults geometrically to Back Cover even with stale zone metadata and shows empty-scope hint on empty panels', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const backRect = {
      x: geom.outerWrap.backBoardRect.x + bleed,
      y: geom.outerWrap.backBoardRect.y + bleed,
      width: geom.outerWrap.backBoardRect.width,
      height: geom.outerWrap.backBoardRect.height,
    };
    // Text sits geometrically on Back Cover with stale zone: 'front'
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [
        {
          ...CoverTextLayerModel.createPreset('front-title', backRect),
          zone: 'front' as const,
          text: 'EX LIBRIS',
          fontId: 'custom' as const,
        },
      ],
    };

    render(
      <CricutExportDialog
        open={true}
        geometry={geom}
        studio={studio}
        customFont={TEST_CUSTOM_FONT}
        unit="mm"
        onOpenChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    // Smart default selects Back Cover geometrically
    await waitFor(() => {
      expect(screen.getByTestId('cricut-scope-back')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('cricut-svg-preview-img')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cricut-empty-scope-hint')).not.toBeInTheDocument();

    // Switching to Front Cover (empty) shows helpful .status-warning-surface hint pointing to Back Cover
    await user.click(screen.getByTestId('cricut-scope-front'));
    await waitFor(() => {
      const hint = screen.getByTestId('cricut-empty-scope-hint');
      expect(hint).toHaveTextContent(/No vector cut paths in this scope/i);
      expect(hint).toHaveTextContent(/Back Cover/i);
      expect(hint).toHaveClass('status-warning-surface');
      expect(hint.className).not.toContain('dark:');
    });
  });

  it('explains raster-only covers print via Printed Base PDF when no vector designs exist', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio = {
      ...CoverStudioModel.createDefault(),
      layers: [
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,abc',
          fileName: 'art.png',
          naturalWidth: 1200,
          naturalHeight: 1800,
          xMm: 10,
          yMm: 10,
          widthMm: 150,
          heightMm: 220,
          clipZone: 'front' as const,
        },
      ],
    };

    render(
      <CricutExportDialog
        open={true}
        geometry={geom}
        studio={studio}
        customFont={TEST_CUSTOM_FONT}
        unit="mm"
        onOpenChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    await waitFor(() => {
      const hint = screen.getByTestId('cricut-empty-scope-hint');
      expect(hint).toHaveTextContent(/Export Printed Base PDF/i);
      expect(hint).toHaveClass('status-warning-surface');
      expect(hint.className).not.toContain('dark:');
    });
  });

  it('offers 1-click switch to Print Then Cut (.PNG) for raster artwork, displays live sheet bounds & trims, and downloads 300 DPI PNG', async () => {
    const user = userEvent.setup();
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-cricut-ptc-png');
    URL.revokeObjectURL = vi.fn();

    const exportSpy = vi.spyOn(cricutPrintThenCut, 'exportCricutPrintThenCutPng').mockResolvedValue({
      blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
      summary: cricutPrintThenCut.evaluatePrintThenCutBounds(64, 74, {
        dpi: 300,
        options: { scope: 'front-cover', trimToDesignBounds: true, mirrorForHtv: true },
      }),
    });

    try {
      const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
      const bleed = geom.outerWrap.bleedMm;
      const frontBoard = {
        x: geom.outerWrap.frontBoardRect.x + bleed,
        y: geom.outerWrap.frontBoardRect.y + bleed,
        width: geom.outerWrap.frontBoardRect.width,
        height: geom.outerWrap.frontBoardRect.height,
      };
      const studio = {
        ...CoverStudioModel.createDefault(),
        layers: [
          {
            id: 'img-front',
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
            fileName: 'cover-emblem.png',
            naturalWidth: 1200,
            naturalHeight: 1400,
            xMm: frontBoard.x + 30,
            yMm: frontBoard.y + 50,
            widthMm: 60,
            heightMm: 70,
            clipZone: 'front' as const,
          },
        ],
      };
      const onStatusMessage = vi.fn();

      render(
        <CricutExportDialog
          open={true}
          geometry={geom}
          studio={studio}
          customFont={TEST_CUSTOM_FONT}
          unit="mm"
          onOpenChange={vi.fn()}
          onStatusMessage={onStatusMessage}
          onOpenBasePdfForHtv={vi.fn()}
        />,
      );

      // Default tab is Basic Cut (.SVG), and Print Then Cut tab shows raster artwork badge
      expect(screen.getByTestId('cricut-mode-basic-cut')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('cricut-mode-print-then-cut')).toHaveAttribute(
        'aria-selected',
        'false',
      );
      expect(screen.getByTestId('cricut-ptc-raster-badge')).toBeInTheDocument();

      // 1-click switch from raster warning banner into Print Then Cut (.PNG)
      await user.click(screen.getByTestId('cricut-switch-to-ptc-btn'));
      expect(screen.getByTestId('cricut-mode-print-then-cut')).toHaveAttribute(
        'aria-selected',
        'true',
      );

      // Preview uses always-light alpha checkerboard mat
      const ptcMat = screen.getByTestId('cricut-ptc-preview-mat');
      expect(ptcMat).toHaveClass('cricut-mat-surface');
      expect(ptcMat).toHaveClass('cricut-alpha-checkerboard');

      // Exact physical dimensions & US Letter fit badge (status-success-surface, no dark: utilities)
      expect(screen.getByTestId('cricut-ptc-dimensions')).toHaveTextContent(/143\.0 × 223\.0 mm/);
      const letterBadge = screen.getByTestId('cricut-ptc-fit-letter');
      expect(letterBadge).toHaveAttribute('data-fits', 'true');
      expect(letterBadge.className).toContain('status-success-surface');
      expect(letterBadge.className).not.toContain('dark:');

      // Solid base fill defaults to Off (transparent alpha)
      expect(screen.getByTestId('cricut-ptc-base-fill-switch')).toHaveAttribute(
        'aria-checked',
        'false',
      );

      // Full Cover Wrap exceeds Tabloid and displays warning banner
      await user.click(screen.getByTestId('cricut-ptc-scope-fullwrap'));
      const overflowWarn = screen.getByTestId('cricut-ptc-overflow-warning');
      expect(overflowWarn).toHaveClass('status-warning-surface');
      expect(overflowWarn.className).not.toContain('dark:');

      // Switch back to Front Cover, enable Trim to Design Bounds & Mirror -> dimensions shrink tightly
      await user.click(screen.getByTestId('cricut-ptc-scope-front'));
      await user.click(screen.getByTestId('cricut-ptc-trim-switch'));
      expect(screen.getByTestId('cricut-ptc-dimensions')).toHaveTextContent(/64\.0 × 74\.0 mm/);

      await user.click(screen.getByTestId('cricut-ptc-mirror-switch'));
      expect(screen.getByText('Mirrored')).toBeInTheDocument();

      // Download 300 DPI PNG invokes exportCricutPrintThenCutPng and reports status
      await user.click(screen.getByTestId('cricut-download-ptc-png-btn'));
      await waitFor(() => {
        expect(exportSpy).toHaveBeenCalledTimes(1);
        expect(onStatusMessage).toHaveBeenCalledWith(
          expect.stringContaining('_cricut_ptc_front_trimmed_mirrored.png'),
        );
      });
    } finally {
      exportSpy.mockRestore();
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });

  it('shows Uploaded SVG Artwork toggle in Basic Cut mode for uploaded .svg layers without flagging raster-only warning', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const bleed = geom.outerWrap.bleedMm;
    const frontBoard = {
      x: geom.outerWrap.frontBoardRect.x + bleed,
      y: geom.outerWrap.frontBoardRect.y + bleed,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };
    const svgMarkup =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#d4af37"/></svg>';
    const studio = {
      ...CoverStudioModel.createDefault(),
      layers: [
        {
          id: 'svg-art-1',
          dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
          fileName: 'crest.svg',
          naturalWidth: 100,
          naturalHeight: 100,
          xMm: frontBoard.x + 25,
          yMm: frontBoard.y + 40,
          widthMm: 60,
          heightMm: 60,
          clipZone: 'front' as const,
        },
      ],
    };

    render(
      <CricutExportDialog
        open={true}
        geometry={geom}
        studio={studio}
        customFont={TEST_CUSTOM_FONT}
        unit="mm"
        onOpenChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('cricut-scope-front')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('cricut-svg-artwork-switch')).toBeInTheDocument();
      expect(screen.getByTestId('cricut-svg-preview-img')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cricut-empty-scope-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cricut-ptc-raster-badge')).not.toBeInTheDocument();
  });
});
