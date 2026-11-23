import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel } from '@/types/studioLayer';
import { CoverStyler } from './CoverStyler';

describe('CoverStyler', () => {
  it('renders free-form layers, supports quick-fit and scaling, and updates spine typography', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const initialLayer = CoverImageLayerModel.createInRect({
      id: 'layer-front',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front-art.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: 200, y: 0, width: 150, height: 225 },
    });

    let state: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [initialLayer],
    };
    const onChange = vi.fn((next: CoverStudioState) => {
      state = next;
    });

    const { rerender } = render(
      <CoverStyler
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('layer-count-badge')).toHaveTextContent('1 image');
    expect(screen.getByTestId('studio-layer-0')).toBeInTheDocument();
    expect(screen.getByTestId('studio-selection-handles')).toBeInTheDocument();

    // Quick-fit selected layer to full wrap
    await user.click(screen.getByTestId('quick-fit-fullWrap'));
    expect(state.layers[0].widthMm).toBeGreaterThanOrEqual(370);

    // Scale up selected layer
    const widthBefore = state.layers[0].widthMm;
    rerender(
      <CoverStyler
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('layer-scale-up-btn'));
    expect(state.layers[0].widthMm).toBeGreaterThan(widthBefore);

    // Switch to Spine tab in the Studio Tool Dock -> update spine typography + flip author orientation
    await user.click(screen.getByTestId('studio-tool-spine'));
    await user.type(screen.getByTestId('studio-spine-title-input'), 'D');
    expect(state.spineText.title).toBe('D');

    await user.click(screen.getByTestId('author-orientation-horizontal'));
    expect(state.spineText.authorOrientation).toBe('horizontal');
  });

  it('activates eyedropper sampling mode banner cleanly', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <CoverStyler
        geometry={geom}
        studio={CoverStudioModel.createDefault()}
        onChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('studio-eyedropper-both-btn'));
    expect(screen.getByTestId('eyedropper-active-banner')).toBeInTheDocument();
  });

  it('toggles between 2D Flat Wrap and interactive 3D Book Preview with angle presets', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <CoverStyler
        geometry={geom}
        studio={CoverStudioModel.createDefault()}
        onChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('studio-preview-svg')).toBeInTheDocument();

    await user.click(screen.getByTestId('studio-view-3d-btn'));
    expect(screen.getByTestId('book3d-stage')).toBeInTheDocument();

    await user.click(screen.getByTestId('book3d-preset-spine'));
    expect(screen.getByTestId('book3d-preset-spine')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('studio-view-2d-btn'));
    expect(screen.getByTestId('studio-preview-svg')).toBeInTheDocument();
  });

  it('highlights uncovered cover gaps in red on the canvas and resolves them with one-click Quick Fix', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    // High-res image shifted down so it leaves an uncovered strip on the front board
    const shiftedLayer = CoverImageLayerModel.createInRect({
      id: 'shifted-front',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front-art.png',
      naturalWidth: 2400,
      naturalHeight: 3600,
      targetRect: { x: 210, y: 40, width: 155, height: 220 },
      mode: 'cover',
    });

    let state: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [shiftedLayer],
    };
    const onChange = vi.fn((next: CoverStudioState) => {
      state = next;
    });

    const { rerender } = render(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.getByTestId('studio-preflight-overlays')).toBeInTheDocument();

    // Open Preflight tab in the Studio Tool Dock
    await user.click(screen.getByTestId('studio-tool-preflight'));
    expect(screen.getByTestId('preflight-issue-front-board-gap')).toBeInTheDocument();

    await user.click(screen.getByTestId('preflight-fix-front-board-gap'));
    rerender(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('preflight-issue-front-board-gap')).not.toBeInTheDocument();
    expect(screen.getByTestId('preflight-status-badge')).toHaveTextContent('All Checks Passed');
    expect(screen.getByTestId('studio-tool-preflight-badge')).toHaveTextContent('OK');
  });

  it('switches to 1:1 mm CAD Blueprint mode (including 3-piece split) and triggers Cut-Only exports', async () => {
    const user = userEvent.setup();
    const splitParams = { ...DEFAULT_BOOK_PARAMETERS, splitMode: 'three-piece' as const };
    const geom = calculateCaseGeometry(splitParams);
    const onDownloadOuterSvg = vi.fn();
    const onDownloadOuterPdf = vi.fn();

    render(
      <CoverStyler
        params={splitParams}
        geometry={geom}
        studio={CoverStudioModel.createDefault()}
        onChange={vi.fn()}
        onDownloadOuterSvg={onDownloadOuterSvg}
        onDownloadOuterPdf={onDownloadOuterPdf}
        onStatusMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('studio-view-blueprint-btn'));
    expect(screen.getByTestId('outer-blueprint-svg')).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-split-panels')).toBeInTheDocument();

    await user.click(screen.getByTestId('download-outer-svg-btn'));
    expect(onDownloadOuterSvg).toHaveBeenCalledTimes(1);

    // Cut-Only PDF button opens the unified Export Dialog first
    await user.click(screen.getByTestId('download-outer-pdf-btn'));
    expect(screen.getByTestId('pdf-export-dialog')).toHaveAttribute('open');
    expect(onDownloadOuterPdf).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('pdf-export-confirm-btn'));
    expect(onDownloadOuterPdf).toHaveBeenCalledTimes(1);
    expect(onDownloadOuterPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        splitMode: 'three-piece',
      }),
    );
  });

  it('fits artwork cleanly to Front Zone with front clipZone after the book is resized', async () => {
    const user = userEvent.setup();
    const initialParams = DEFAULT_BOOK_PARAMETERS;
    const initialGeom = calculateCaseGeometry(initialParams);
    const layer = CoverImageLayerModel.createInRect({
      id: 'layer-resize-test',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'wide-art.png',
      naturalWidth: 1200,
      naturalHeight: 1200, // square cover art would spill across spine if not clipped
      targetRect: { x: 200, y: 0, width: 150, height: 150 },
      clipZone: 'none',
    });

    let state: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [layer],
    };
    const onChange = vi.fn((next: CoverStudioState) => {
      state = next;
    });

    const { rerender } = render(
      <CoverStyler
        params={initialParams}
        geometry={initialGeom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    // Now resize book dramatically (wider + taller + thicker spine)
    const largerParams = {
      ...initialParams,
      pbWidthMm: 175,
      pbHeightMm: 250,
      pbThicknessMm: 38,
    };
    const largerGeom = calculateCaseGeometry(largerParams);

    rerender(
      <CoverStyler
        params={largerParams}
        geometry={largerGeom}
        studio={state}
        onChange={onChange}
        onStatusMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('quick-fit-front'));

    const expectedFrontStart = largerGeom.outerWrap.bleedMm + largerGeom.outerWrap.frontBoardRect.x;
    const expectedTotalHeight = largerGeom.outerWrap.heightMm + largerGeom.outerWrap.bleedMm * 2;
    expect(state.layers[0].clipZone).toBe('front');
    expect(state.layers[0].heightMm).toBeGreaterThanOrEqual(expectedTotalHeight - 0.5);
    expect(state.layers[0].xMm + state.layers[0].widthMm).toBeGreaterThanOrEqual(
      expectedFrontStart + largerGeom.outerWrap.frontBoardRect.width,
    );
  });

  it('supports compact Studio Tool Dock tabs without double nested tabs, smart auto-switch on canvas click, and roll badge navigation', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onOpenMeasureAndCut = vi.fn();

    let state: CoverStudioState = CoverStudioModel.createDefault();
    const onChange = vi.fn((next: CoverStudioState) => {
      state = next;
    });

    const { rerender } = render(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={state}
        onChange={onChange}
        onOpenMeasureAndCut={onOpenMeasureAndCut}
        onStatusMessage={vi.fn()}
      />,
    );

    // Clicking the compact spec/roll badge invokes onOpenMeasureAndCut
    const rollBadge = screen.getByTestId('studio-roll-badge');
    expect(rollBadge).toHaveTextContent('366.0 × 259.0 mm');
    await user.click(rollBadge);
    expect(onOpenMeasureAndCut).toHaveBeenCalledTimes(1);

    // Switch to Cover Text tab -> no internal nested tablist
    await user.click(screen.getByTestId('studio-tool-text'));
    expect(screen.queryByTestId('elements-tab-text')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-front-title-btn'));

    rerender(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={state}
        onChange={onChange}
        onOpenMeasureAndCut={onOpenMeasureAndCut}
        onStatusMessage={vi.fn()}
      />,
    );

    // Switch to Classic Designs tab -> add an ornament
    await user.click(screen.getByTestId('studio-tool-designs'));
    expect(screen.queryByTestId('elements-tab-ornaments')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('add-ornament-frame-double-rule'));

    rerender(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={state}
        onChange={onChange}
        onOpenMeasureAndCut={onOpenMeasureAndCut}
        onStatusMessage={vi.fn()}
      />,
    );

    // Smart Auto-Switch: clicking the text element on canvas switches tool dock to Cover Text
    await user.click(screen.getByTestId('studio-cover-text-0'));
    expect(screen.getByTestId('studio-tool-text')).toHaveAttribute('data-state', 'active');

    // Clicking the ornament on canvas switches tool dock back to Classic Designs
    await user.click(screen.getByTestId('studio-ornament-0'));
    expect(screen.getByTestId('studio-tool-designs')).toHaveAttribute('data-state', 'active');
  });

  it('toggles full-page canvas focus mode across view modes and exits on Escape', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <CoverStyler
        params={DEFAULT_BOOK_PARAMETERS}
        geometry={geom}
        studio={CoverStudioModel.createDefault()}
        onChange={vi.fn()}
        onStatusMessage={vi.fn()}
      />,
    );

    const stage = screen.getByTestId('studio-canvas-stage');
    expect(stage).toHaveAttribute('data-expanded', 'false');

    await user.click(screen.getByTestId('studio-fullscreen-btn'));
    expect(stage).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('studio-exit-fullscreen-btn')).toBeInTheDocument();

    // Full-screen HUD button remains available across Blueprint and 3D views while expanded
    await user.click(screen.getByTestId('studio-view-blueprint-btn'));
    expect(screen.getByTestId('studio-fullscreen-btn')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('studio-view-3d-btn'));
    expect(screen.getByTestId('studio-fullscreen-btn')).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Escape}');
    expect(stage).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByTestId('studio-exit-fullscreen-btn')).not.toBeInTheDocument();
  });
});
