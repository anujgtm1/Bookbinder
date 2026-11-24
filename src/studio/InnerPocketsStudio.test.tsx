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

    // Download buttons invoke callbacks (PDF buttons open the unified Export Dialog)
    await user.click(screen.getByTestId('download-inner-svg-btn'));
    expect(onDownloadInnerSvg).toHaveBeenCalledTimes(1);

    // Open Plain Cut PDF dialog -> legend defaults to OFF for tighter sheet packing
    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    expect(screen.getByTestId('pdf-export-dialog')).toHaveAttribute('open');
    expect(onDownloadInnerPdf).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onDownloadInnerPdf).toHaveBeenLastCalledWith({
      pageSizeId: 'tabloid',
      includeLegend: false,
    });

    // Reopen dialog, opt in to printing 50x50 mm calibration & legend -> passes includeLegend=true
    await user.click(screen.getByTestId('download-inner-pdf-btn'));
    await user.click(screen.getByTestId('pdf-opt-legend'));
    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onDownloadInnerPdf).toHaveBeenLastCalledWith({
      pageSizeId: 'tabloid',
      includeLegend: true,
    });
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

  it('expands inner pockets cutting-mat canvas to full page and exits cleanly', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={DEFAULT_POCKET_STYLE}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={vi.fn()}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    const stage = screen.getByTestId('pockets-canvas-stage');
    expect(stage).toHaveAttribute('data-expanded', 'false');

    await user.click(screen.getByTestId('pockets-fullscreen-btn'));
    expect(stage).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('pockets-exit-fullscreen-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('pockets-exit-fullscreen-btn'));
    expect(stage).toHaveAttribute('data-expanded', 'false');
  });

  it('toggles between Removable Slip-In Pockets and Folded Glue-In Endpapers on chipboard hardcovers and renders mirrored PASTEDOWN / FLYLEAF annotations', async () => {
    const user = userEvent.setup();
    let interiorStyle: 'slip-pockets' | 'folded-endpapers' = 'slip-pockets';
    const onChangeInteriorStyle = vi.fn((next: 'slip-pockets' | 'folded-endpapers') => {
      interiorStyle = next;
    });

    const initialLayer = CoverImageLayerModel.createInRect({
      id: 'endpaper-art-1',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'floral.png',
      naturalWidth: 1200,
      naturalHeight: 1600,
      targetRect: { x: 0, y: 0, width: 140, height: 216 },
      mode: 'cover',
    });
    const pocketStyle: PocketStyleConfig = {
      ...DEFAULT_POCKET_STYLE,
      layers: [initialLayer],
    };

    const slipGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      interiorStyle: 'slip-pockets',
    });

    const { rerender } = render(
      <InnerPocketsStudio
        geometry={slipGeom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        interiorStyle={interiorStyle}
        unit="mm"
        onChangePocketStyle={vi.fn()}
        onChangeInteriorStyle={onChangeInteriorStyle}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    const slipBtn = screen.getByTestId('interior-style-slip-pockets');
    const foldedBtn = screen.getByTestId('interior-style-folded-endpapers');
    expect(slipBtn).toHaveAttribute('aria-pressed', 'true');
    expect(foldedBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Inner Slip-In Pockets & Spine Liner')).toBeInTheDocument();
    expect(screen.getByTestId('pocket-quick-fit-front')).toHaveTextContent('Fit Front Pocket');

    // Toggle to Folded Glue-In Endpapers
    await user.click(foldedBtn);
    expect(onChangeInteriorStyle).toHaveBeenCalledWith('folded-endpapers');

    const foldedGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      interiorStyle: 'folded-endpapers',
    });
    rerender(
      <InnerPocketsStudio
        geometry={foldedGeom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        interiorStyle={interiorStyle}
        unit="mm"
        onChangePocketStyle={vi.fn()}
        onChangeInteriorStyle={onChangeInteriorStyle}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('interior-style-slip-pockets')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('interior-style-folded-endpapers')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Folded Glue-In Endpapers & Spine Liner')).toBeInTheDocument();
    expect(screen.getByTestId('download-styled-inner-pdf-btn')).toHaveTextContent(
      'Styled Endpapers PDF…',
    );
    expect(screen.getByTestId('pocket-quick-fit-front')).toHaveTextContent('Fit Front Endpaper');
    expect(screen.getByTestId('pocket-quick-fit-back')).toHaveTextContent('Fit Back Endpaper');
    expect(screen.getByTestId('pocket-copy-other-btn')).toHaveTextContent('Copy to Other Endpaper');

    // Verify accurately mirrored PASTEDOWN / FLYLEAF zone labels in Styled mode
    expect(screen.getByTestId('endpaper-back-left-zone')).toHaveTextContent('FLYLEAF');
    expect(screen.getByTestId('endpaper-back-right-zone')).toHaveTextContent('PASTEDOWN');
    expect(screen.getByTestId('endpaper-front-left-zone')).toHaveTextContent('PASTEDOWN');
    expect(screen.getByTestId('endpaper-front-right-zone')).toHaveTextContent('FLYLEAF');

    // Switch to Blueprint mode: displays CENTER FOLD and leaf dimension breakdowns without OPEN EDGE
    await user.click(screen.getByTestId('pockets-view-blueprint-btn'));
    expect(screen.getAllByText('CENTER FOLD')).toHaveLength(2);
    expect(screen.getByTestId('endpaper-back-left-zone')).toHaveTextContent('FLYLEAF');
    expect(screen.getByTestId('endpaper-front-left-zone')).toHaveTextContent('PASTEDOWN');
    expect(screen.queryByText(/OPEN EDGE/i)).not.toBeInTheDocument();

    // Boardless softcover-jacket hides the chipboard interior style toggle
    const softGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
    });
    rerender(
      <InnerPocketsStudio
        geometry={softGeom}
        pocketStyle={pocketStyle}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={vi.fn()}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('interior-style-folded-endpapers')).not.toBeInTheDocument();
  });

  it('supports graceful uncontrolled local fallback when onChangeInteriorStyle is omitted', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <InnerPocketsStudio
        geometry={geom}
        pocketStyle={DEFAULT_POCKET_STYLE}
        coverMatchColor="#08343f"
        pdfPageSize="tabloid"
        unit="mm"
        onChangePocketStyle={vi.fn()}
        onDownloadInnerSvg={vi.fn()}
        onDownloadInnerPdf={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    const foldedBtn = screen.getByTestId('interior-style-folded-endpapers');
    expect(foldedBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(foldedBtn);
    expect(foldedBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Folded Glue-In Endpapers & Spine Liner')).toBeInTheDocument();
  });
});
