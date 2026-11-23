import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { DEFAULT_POCKET_STYLE, type PocketStyleConfig } from '@/types/studio';
import { CoverImageLayerModel } from '@/types/studioLayer';
import { InnerPocketsStudio } from './InnerPocketsStudio';
import { computeInnerPocketsLayout } from './pocketRenderEngine';

describe('InnerPocketsStudio', () => {
  it('renders styled pockets, syncs color with cover, toggles Blueprint mode, and triggers cut exports', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    let pocketStyle: PocketStyleConfig = { ...DEFAULT_POCKET_STYLE };
    const onChangePocketStyle = vi.fn((next: PocketStyleConfig) => {
      pocketStyle = next;
    });
    const onDownloadInnerSvg = vi.fn();
    const onDownloadInnerPdf = vi.fn();

    const { rerender } = render(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('inner-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByText(/1 page • TABLOID/i)).toBeInTheDocument();
    expect(screen.getByTestId('styled-front-pocket-fill')).toHaveAttribute('fill', '#f4eee1');

    // Match cover color syncs pocket backgroundColor
    await user.click(screen.getByTestId('pocket-match-cover-btn'));
    expect(pocketStyle.backgroundColor).toBe('#08343f');

    rerender(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={onDownloadInnerSvg}
        onDownloadInnerPdf={onDownloadInnerPdf}
        onStatusMessage={vi.fn()}
      />,
    );
    expect(screen.getByTestId('styled-front-pocket-fill')).toHaveAttribute('fill', '#08343f');

    // Switch to Blueprint mode hides styled pocket fill and displays CAD labels
    await user.click(screen.getByTestId('pockets-view-blueprint-btn'));
    expect(screen.queryByTestId('styled-front-pocket-fill')).not.toBeInTheDocument();
    expect(screen.getByText('SPINE LINER')).toBeInTheDocument();

    // Download buttons invoke callbacks (PDF legend defaults to OFF for tighter sheet packing)
    await user.click(screen.getByTestId('download-inner-svg-btn'));
    expect(onDownloadInnerSvg).toHaveBeenCalledTimes(1);

    const guidesToggle = screen.getByTestId('pocket-pdf-guides-toggle');
    expect(guidesToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(guidesToggle);
    expect(guidesToggle).toHaveAttribute('aria-pressed', 'false');

    const legendToggle = screen.getByTestId('pocket-pdf-legend-toggle');
    expect(legendToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    expect(onDownloadInnerPdf).toHaveBeenLastCalledWith(false);

    // Opt in to printing legend -> passes includeLegend=true
    await user.click(legendToggle);
    expect(legendToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    expect(onDownloadInnerPdf).toHaveBeenLastCalledWith(true);
  });

  it('supports interactive multi-layer quick-fit, copy to opposite pocket, and removal', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const layout = computeInnerPocketsLayout(geom);

    const initialLayer = CoverImageLayerModel.createInRect({
      id: 'pocket-art-1',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'marbled.png',
      naturalWidth: 1200,
      naturalHeight: 1600,
      targetRect: layout.frontFaceRect,
      mode: 'cover',
    });

    let pocketStyle: PocketStyleConfig = {
      ...DEFAULT_POCKET_STYLE,
      layers: [initialLayer],
    };
    const onChangePocketStyle = vi.fn((next: PocketStyleConfig) => {
      pocketStyle = next;
    });

    const { rerender } = render(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('pocket-layer-0')).toBeInTheDocument();
    expect(screen.getByTestId('studio-selection-handles')).toBeInTheDocument();

    // Copy selected layer to the opposite pocket (Back Pocket)
    await user.click(screen.getByTestId('pocket-copy-other-btn'));
    expect(pocketStyle.layers).toHaveLength(2);
    expect(pocketStyle.layers[1].xMm).toBeLessThan(layout.linerX);

    rerender(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('pocket-layer-count-badge')).toHaveTextContent('2 images');

    // Quick-fit the copied layer cleanly to Spine Liner
    await user.click(screen.getByTestId('pocket-quick-fit-liner'));
    expect(pocketStyle.layers[1].widthMm).toBeGreaterThanOrEqual(layout.linerRect.width - 0.5);

    // Toggle Tile Pattern ON -> scales tile swatch down cleanly and marks tiled=true
    await user.click(screen.getByTestId('pocket-tile-toggle-btn'));
    expect(pocketStyle.layers[1].tiled).toBe(true);
    expect(pocketStyle.layers[1].widthMm).toBeLessThanOrEqual(48);

    rerender(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={onChangePocketStyle}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pocket-layer-1')).toHaveAttribute('data-tiled', 'true');
    expect(screen.getByTestId('pocket-tile-toggle-btn')).toHaveAttribute('aria-pressed', 'true');
  });
});
