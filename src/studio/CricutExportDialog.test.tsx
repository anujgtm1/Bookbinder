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
});
