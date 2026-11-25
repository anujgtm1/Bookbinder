import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { FOIL_SWATCHES } from '@/resources/palettes';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import {
  CoverImageLayerModel,
  getLayerVisualRect,
  type CoverImageLayer,
} from '@/types/studioLayer';
import { CanvasSelectionBar, type CanvasSelectionBarProps } from './CanvasSelectionBar';
import { CoverStyler } from './CoverStyler';
import { computeStudioCanvasSpec } from './renderEngine';

function createCallbacks(): Omit<CanvasSelectionBarProps, 'selection' | 'controlsId'> {
  return {
    onFlipH: vi.fn(),
    onFlipV: vi.fn(),
    onRotate90: vi.fn(),
    onQuickAlign: vi.fn(),
    onChangeColor: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onDeselect: vi.fn(),
  };
}

function makeTextLayer(overrides?: Partial<CoverTextLayer>): CoverTextLayer {
  return {
    id: 'txt-1',
    text: 'THE ODYSSEY\nHomer',
    zone: 'front',
    xMm: 270,
    yMm: 100,
    fontId: 'eb-garamond',
    fontSizePt: 24,
    letterSpacingEm: 0.06,
    lineHeight: 1.2,
    align: 'center',
    color: '#d9b566',
    ...overrides,
  };
}

function makeOrnamentLayer(overrides?: Partial<CoverOrnamentLayer>): CoverOrnamentLayer {
  return {
    id: 'orn-1',
    presetId: 'emblem-compass-rose',
    zone: 'front',
    xMm: 250,
    yMm: 100,
    widthMm: 40,
    heightMm: 40,
    color: '#d9b566',
    strokeWidthMm: 0.7,
    ...overrides,
  };
}

function makeImageLayer(overrides?: Partial<CoverImageLayer>): CoverImageLayer {
  return {
    id: 'img-1',
    dataUrl: 'data:image/png;base64,AAA',
    fileName: 'botanical-cover.png',
    naturalWidth: 1200,
    naturalHeight: 1800,
    xMm: 220,
    yMm: 40,
    widthMm: 100,
    heightMm: 150,
    clipZone: 'front',
    ...overrides,
  };
}

describe('CanvasSelectionBar', () => {
  it('returns null when nothing is selected', () => {
    const { container } = render(
      <CanvasSelectionBar selection={null} {...createCallbacks()} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('canvas-selection-bar')).not.toBeInTheDocument();
  });

  it('renders full controls for a selected Cover Text layer and enforces toolbar aria rules', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const textLayer = makeTextLayer({ flipX: true, flipY: false, rotationDeg: 180 });

    render(
      <CanvasSelectionBar
        selection={{ kind: 'text', layer: textLayer }}
        controlsId="studio-mat-viewport"
        {...callbacks}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Selected element quick controls' });
    expect(toolbar).toHaveAttribute('data-testid', 'canvas-selection-bar');
    expect(toolbar).toHaveAttribute('data-selection-kind', 'text');
    expect(toolbar).toHaveAttribute('aria-controls', 'studio-mat-viewport');
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('Text');
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('THE ODYSSEY');

    // Vertical alignment pin toggle buttons carry aria-pressed="false" when unpinned
    const alignUpper = screen.getByTestId('selection-align-upper');
    const alignCenter = screen.getByTestId('selection-align-center');
    const alignLower = screen.getByTestId('selection-align-lower');
    expect(alignUpper).toHaveAttribute('aria-pressed', 'false');
    expect(alignCenter).toHaveAttribute('aria-pressed', 'false');
    expect(alignLower).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('selection-bar-unpin-btn')).not.toBeInTheDocument();

    await user.click(alignUpper);
    await user.click(alignCenter);
    await user.click(alignLower);
    expect(callbacks.onQuickAlign).toHaveBeenNthCalledWith(1, 'upper');
    expect(callbacks.onQuickAlign).toHaveBeenNthCalledWith(2, 'center');
    expect(callbacks.onQuickAlign).toHaveBeenNthCalledWith(3, 'lower');

    // Toggle buttons carry aria-pressed; one-shot 90° button does NOT
    const flipH = screen.getByTestId('selection-flip-h');
    const flipV = screen.getByTestId('selection-flip-v');
    const rotateBtn = screen.getByTestId('selection-rotate-90');
    expect(flipH).toHaveAttribute('aria-pressed', 'true');
    expect(flipV).toHaveAttribute('aria-pressed', 'false');
    expect(rotateBtn).not.toHaveAttribute('aria-pressed');
    expect(rotateBtn).toHaveAttribute('data-rotation', '180');

    await user.click(flipH);
    await user.click(flipV);
    await user.click(rotateBtn);
    expect(callbacks.onFlipH).toHaveBeenCalledTimes(1);
    expect(callbacks.onFlipV).toHaveBeenCalledTimes(1);
    expect(callbacks.onRotate90).toHaveBeenCalledTimes(1);

    // Foil color swatches & custom color picker
    const creamSwatch = FOIL_SWATCHES[1];
    const swatchBtn = screen.getByTestId(`selection-swatch-${creamSwatch.hex.slice(1)}`);
    expect(swatchBtn).not.toHaveAttribute('aria-pressed');
    await user.click(swatchBtn);
    expect(callbacks.onChangeColor).toHaveBeenCalledWith(creamSwatch.hex);

    const colorInput = screen.getByTestId('selection-color-input') as HTMLInputElement;
    expect(colorInput.value).toBe('#d9b566');
    fireEvent.change(colorInput, { target: { value: '#123456' } });
    expect(callbacks.onChangeColor).toHaveBeenCalledWith('#123456');

    // Action buttons never carry aria-pressed
    const dupBtn = screen.getByTestId('selection-duplicate-btn');
    const delBtn = screen.getByTestId('selection-delete-btn');
    const deselectBtn = screen.getByTestId('selection-deselect-btn');
    expect(dupBtn).not.toHaveAttribute('aria-pressed');
    expect(delBtn).not.toHaveAttribute('aria-pressed');
    expect(deselectBtn).not.toHaveAttribute('aria-pressed');

    await user.click(dupBtn);
    await user.click(delBtn);
    await user.click(deselectBtn);
    expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
    expect(callbacks.onDeselect).toHaveBeenCalledTimes(1);
  });

  it('renders custom SVG ornament name, foil color controls, and transform state', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const customOrn = makeOrnamentLayer({
      presetId: 'custom-svg',
      customSvgName: 'Botanical Crest',
      flipY: true,
      rotationDeg: 270,
      color: '#f5efe2',
    });

    render(
      <CanvasSelectionBar
        selection={{ kind: 'ornament', layer: customOrn }}
        {...callbacks}
      />,
    );

    expect(screen.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'ornament',
    );
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('Ornament');
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('Botanical Crest');
    expect(screen.getByTestId('selection-flip-h')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selection-flip-v')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('selection-rotate-90')).toHaveAttribute('data-rotation', '270');
    expect(screen.getByTestId('selection-rotate-90')).toHaveAccessibleName('Rotate 90° clockwise');
    expect(screen.getByTestId('selection-color-input')).toHaveValue('#f5efe2');

    await user.click(screen.getByTestId('selection-align-lower'));
    expect(callbacks.onQuickAlign).toHaveBeenCalledWith('lower');
  });

  it('shows contextual 6 mm / 12 mm / 18 mm margin presets for frame and corner ornaments', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const onFitMargin = vi.fn();
    const frameOrn = makeOrnamentLayer({
      presetId: 'frame-double-rule',
      color: '#d9b566',
    });

    render(
      <CanvasSelectionBar
        selection={{ kind: 'ornament', layer: frameOrn }}
        onFitMargin={onFitMargin}
        {...callbacks}
      />,
    );

    expect(screen.queryByTestId('selection-align-upper')).not.toBeInTheDocument();
    expect(screen.queryByTestId('selection-align-lower')).not.toBeInTheDocument();
    expect(screen.getByTestId('selection-margin-6')).toBeInTheDocument();
    expect(screen.getByTestId('selection-margin-12')).toBeInTheDocument();
    expect(screen.getByTestId('selection-margin-18')).toBeInTheDocument();
    expect(screen.getByTestId('selection-align-center')).toBeInTheDocument();

    await user.click(screen.getByTestId('selection-margin-6'));
    await user.click(screen.getByTestId('selection-margin-12'));
    await user.click(screen.getByTestId('selection-margin-18'));
    expect(onFitMargin).toHaveBeenNthCalledWith(1, 6);
    expect(onFitMargin).toHaveBeenNthCalledWith(2, 12);
    expect(onFitMargin).toHaveBeenNthCalledWith(3, 18);
  });

  it('renders for Image selection without foil color controls', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const imageLayer = makeImageLayer({ rotationDeg: 0 });

    render(
      <CanvasSelectionBar
        selection={{ kind: 'image', layer: imageLayer }}
        {...callbacks}
      />,
    );

    expect(screen.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'image',
    );
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('Image');
    expect(screen.getByTestId('selection-element-badge')).toHaveTextContent('botanical-cover.png');
    expect(screen.getByTestId('selection-rotate-90')).toHaveAttribute('data-rotation', '0');

    // Color group is omitted for raster/image layers
    expect(screen.queryByTestId('selection-color-input')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`selection-swatch-${FOIL_SWATCHES[0].hex.slice(1)}`),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('selection-align-upper'));
    await user.click(screen.getByTestId('selection-duplicate-btn'));
    await user.click(screen.getByTestId('selection-delete-btn'));
    expect(callbacks.onQuickAlign).toHaveBeenCalledWith('upper');
    expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
  });

  it('supports roving-tabindex Arrow/Home/End keyboard navigation across toolbar items', () => {
    const callbacks = createCallbacks();
    render(
      <CanvasSelectionBar
        selection={{ kind: 'image', layer: makeImageLayer() }}
        {...callbacks}
      />,
    );

    const firstBtn = screen.getByTestId('selection-align-upper');
    const secondBtn = screen.getByTestId('selection-align-center');
    const lastBtn = screen.getByTestId('selection-deselect-btn');

    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    fireEvent.keyDown(firstBtn, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(secondBtn);
    expect(secondBtn.tabIndex).toBe(0);
    expect(firstBtn.tabIndex).toBe(-1);

    fireEvent.keyDown(secondBtn, { key: 'End' });
    expect(document.activeElement).toBe(lastBtn);

    fireEvent.keyDown(lastBtn, { key: 'Home' });
    expect(document.activeElement).toBe(firstBtn);
  });

  it('displays aria-pressed on active pin buttons, shows Unpin button, and detaches on re-click or Unpin click', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();
    const onFitMargin = vi.fn();
    const onDetachConstraint = vi.fn();

    const pinnedFrame = makeOrnamentLayer({
      presetId: 'frame-double-rule',
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'inset-both', marginMm: 12 },
        vertical: { kind: 'inset-both', marginMm: 12 },
      },
    });

    const { rerender } = render(
      <CanvasSelectionBar
        selection={{ kind: 'ornament', layer: pinnedFrame }}
        onFitMargin={onFitMargin}
        onDetachConstraint={onDetachConstraint}
        {...callbacks}
      />,
    );

    expect(screen.getByTestId('selection-margin-6')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selection-margin-12')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('selection-margin-18')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selection-align-center')).toHaveAttribute('aria-pressed', 'false');

    const unpinBtn = screen.getByTestId('selection-bar-unpin-btn');
    expect(unpinBtn).toBeInTheDocument();
    expect(unpinBtn).not.toHaveAttribute('aria-pressed');

    // Clicking already-pinned 12 mm toggles/detaches via onDetachConstraint
    await user.click(screen.getByTestId('selection-margin-12'));
    expect(onDetachConstraint).toHaveBeenCalledTimes(1);
    expect(onFitMargin).not.toHaveBeenCalled();

    // Clicking Unpin also detaches
    await user.click(unpinBtn);
    expect(onDetachConstraint).toHaveBeenCalledTimes(2);

    // Pinned text layer shows active Center toggle & Unpin button
    const pinnedText = makeTextLayer({
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'center' },
        vertical: { kind: 'center' },
      },
    });
    rerender(
      <CanvasSelectionBar
        selection={{ kind: 'text', layer: pinnedText }}
        onDetachConstraint={onDetachConstraint}
        {...callbacks}
      />,
    );
    expect(screen.getByTestId('selection-align-upper')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selection-align-center')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('selection-align-lower')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('selection-bar-unpin-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('selection-align-center'));
    expect(onDetachConstraint).toHaveBeenCalledTimes(3);
    expect(callbacks.onQuickAlign).not.toHaveBeenCalled();
  });

  it('keeps exactly one roving tab stop on mount, when Unpin mounts, and when Unpin unmounts', async () => {
    const user = userEvent.setup();
    const callbacks = createCallbacks();

    function StatefulToolbar() {
      const [layer, setLayer] = useState<CoverTextLayer>(() => makeTextLayer());
      return (
        <CanvasSelectionBar
          selection={{ kind: 'text', layer }}
          {...callbacks}
          onQuickAlign={(slot) =>
            setLayer((prev) => ({
              ...prev,
              layoutConstraint: {
                anchorZone: 'front',
                horizontal: { kind: 'center' },
                vertical: {
                  kind: slot === 'upper' ? 'top-third' : slot === 'lower' ? 'bottom-third' : 'center',
                },
              },
            }))
          }
          onDetachConstraint={() =>
            setLayer((prev) => ({ ...prev, layoutConstraint: undefined }))
          }
        />
      );
    }

    render(<StatefulToolbar />);

    const getTabbableItems = () =>
      Array.from(
        screen
          .getByTestId('canvas-selection-bar')
          .querySelectorAll<HTMLElement>('button:not([disabled]), input[type="color"]:not([disabled])'),
      ).filter((el) => el.tabIndex === 0);

    // 1. On initial mount before any focusin, exactly one toolbar item is tabbable
    const initialTabbable = getTabbableItems();
    expect(initialTabbable).toHaveLength(1);
    expect(initialTabbable[0]).toBe(screen.getByTestId('selection-align-upper'));

    // 2. Focus & click Center -> Unpin mounts, yet Center remains the sole tab stop
    const centerBtn = screen.getByTestId('selection-align-center');
    await user.click(centerBtn);
    const unpinBtn = screen.getByTestId('selection-bar-unpin-btn');
    expect(unpinBtn).toBeInTheDocument();
    const afterPinTabbable = getTabbableItems();
    expect(afterPinTabbable).toHaveLength(1);
    expect(afterPinTabbable[0]).toBe(centerBtn);
    expect(unpinBtn.tabIndex).toBe(-1);

    // 3. Click Unpin -> Unpin unmounts, and toolbar immediately normalizes back to one tab stop
    await user.click(unpinBtn);
    expect(screen.queryByTestId('selection-bar-unpin-btn')).not.toBeInTheDocument();
    const afterUnpinTabbable = getTabbableItems();
    expect(afterUnpinTabbable).toHaveLength(1);
    expect(afterUnpinTabbable[0]).toBe(screen.getByTestId('selection-align-upper'));
  });
});

describe('CoverStyler docked CanvasSelectionBar & unified Top ⅓ · Center · Bottom ⅓ alignment', () => {
  it('aligns ornaments, rotated images, and text cleanly with Undo/Redo and stays visible in Full Screen 2D', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const spec = computeStudioCanvasSpec(geom);
    const frontBoard = {
      x: geom.outerWrap.bleedMm + geom.outerWrap.frontBoardRect.x,
      y: geom.outerWrap.bleedMm + geom.outerWrap.frontBoardRect.y,
      width: geom.outerWrap.frontBoardRect.width,
      height: geom.outerWrap.frontBoardRect.height,
    };

    const initialText = CoverTextLayerModel.createPreset('front-title', frontBoard, {
      color: '#f5efe2',
    });
    const initialOrnament = CoverOrnamentLayerModel.createForZone(
      'emblem-compass-rose',
      frontBoard,
      'front',
      '#d9b566',
    );
    const rotatedImage: CoverImageLayer = {
      ...CoverImageLayerModel.createInRect({
        id: 'img-rot',
        dataUrl: 'data:image/png;base64,AAA',
        fileName: 'landscape.png',
        naturalWidth: 1600,
        naturalHeight: 800,
        targetRect: { x: 220, y: 80, width: 80, height: 40 },
        clipZone: 'none',
      }),
      rotationDeg: 90,
    };

    let latestState: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [rotatedImage],
      textLayers: [initialText],
      ornaments: [initialOrnament],
    };

    function StatefulHarness() {
      const [studio, setStudio] = useState<CoverStudioState>(latestState);
      return (
        <CoverStyler
          params={DEFAULT_BOOK_PARAMETERS}
          geometry={geom}
          studio={studio}
          onChange={(next) => {
            latestState = next;
            setStudio(next);
          }}
          onStatusMessage={vi.fn()}
        />
      );
    }

    render(<StatefulHarness />);

    // Initially the uploaded image layer is selected -> selection bar is docked above 2D canvas
    expect(screen.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'image',
    );

    // Quick-align rotated image (clipZone: 'none' -> frontArtworkRect) to Upper ⅓
    await user.click(screen.getByTestId('selection-align-upper'));
    const visUpper = getLayerVisualRect(latestState.layers[0]);
    const expectedVisUpperY = Math.max(
      spec.frontArtworkRect.y,
      spec.frontArtworkRect.y + spec.frontArtworkRect.height * 0.24 - visUpper.height / 2,
    );
    expect(visUpper.x + visUpper.width / 2).toBeCloseTo(
      spec.frontArtworkRect.x + spec.frontArtworkRect.width / 2,
      1,
    );
    expect(visUpper.y).toBeCloseTo(expectedVisUpperY, 1);

    // Quick-align rotated image to Lower ⅓
    await user.click(screen.getByTestId('selection-align-lower'));
    const visLower = getLayerVisualRect(latestState.layers[0]);
    expect(visLower.y).toBeGreaterThan(visUpper.y);
    expect(visLower.y + visLower.height).toBeLessThanOrEqual(
      spec.frontArtworkRect.y + spec.frontArtworkRect.height + 0.05,
    );

    // Select ornament on canvas -> align Upper ⅓ & Lower ⅓ via docked bar and ClassicDesignsCard
    await user.click(screen.getByTestId('studio-ornament-0'));
    expect(screen.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'ornament',
    );

    await user.click(screen.getByTestId('selection-align-upper'));
    const ornUpperY = latestState.ornaments![0].yMm;
    expect(ornUpperY).toBeCloseTo(
      frontBoard.y + frontBoard.height * 0.24 - latestState.ornaments![0].heightMm / 2,
      1,
    );

    // ClassicDesignsCard also exposes Top ⅓ / Center / Bottom ⅓
    await user.click(screen.getByTestId('ornament-align-lower'));
    const ornLowerY = latestState.ornaments![0].yMm;
    expect(ornLowerY).toBeGreaterThan(ornUpperY);

    // Foil color swatch from docked bar updates ornament color & supports Undo
    const silverHex = FOIL_SWATCHES[2].hex;
    await user.click(screen.getByTestId(`selection-swatch-${silverHex.slice(1)}`));
    expect(latestState.ornaments![0].color).toBe(silverHex);

    await user.click(screen.getByTestId('studio-undo-btn'));
    expect(latestState.ornaments![0].color).toBe('#d9b566');

    // Enter Full Screen 2D mode -> docked selection bar remains visible!
    await user.click(screen.getByTestId('studio-fullscreen-btn'));
    expect(screen.getByTestId('studio-canvas-stage')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('canvas-selection-bar')).toBeInTheDocument();

    // Flip H & Rotate 90° from docked bar while in Full Screen mode
    await user.click(screen.getByTestId('selection-flip-h'));
    expect(latestState.ornaments![0].flipX).toBe(true);
    await user.click(screen.getByTestId('selection-rotate-90'));
    expect(latestState.ornaments![0].rotationDeg).toBe(90);

    // Deselect hides the docked bar cleanly
    await user.click(screen.getByTestId('selection-deselect-btn'));
    expect(screen.queryByTestId('canvas-selection-bar')).not.toBeInTheDocument();

    // Select text -> align Lower ⅓, duplicate, then delete
    await user.click(screen.getByTestId('studio-cover-text-0'));
    expect(screen.getByTestId('canvas-selection-bar')).toHaveAttribute(
      'data-selection-kind',
      'text',
    );
    await user.click(screen.getByTestId('selection-align-lower'));
    expect(latestState.textLayers![0].yMm).toBeCloseTo(frontBoard.y + frontBoard.height * 0.76, 1);

    await user.click(screen.getByTestId('selection-duplicate-btn'));
    expect(latestState.textLayers).toHaveLength(2);

    await user.click(screen.getByTestId('selection-delete-btn'));
    expect(latestState.textLayers).toHaveLength(1);
  }, 15_000);

  it('detaches imageFit constraint when rotating a Fit Front image from either the selection bar or sidebar', async () => {
    const user = userEvent.setup();
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const spec = computeStudioCanvasSpec(geom);

    const coverImg = CoverImageLayerModel.createInRect({
      id: 'img-fit-rot',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'portrait-cover.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: spec.frontArtworkRect,
      clipZone: 'front',
    });

    let latestState: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [coverImg],
    };

    function StatefulHarness() {
      const [studio, setStudio] = useState<CoverStudioState>(latestState);
      return (
        <CoverStyler
          params={DEFAULT_BOOK_PARAMETERS}
          geometry={geom}
          studio={studio}
          onChange={(next) => {
            latestState = next;
            setStudio(next);
          }}
          onStatusMessage={vi.fn()}
        />
      );
    }

    render(<StatefulHarness />);

    // 1. Pin via Fit Front -> imageFit: 'cover' active
    await user.click(screen.getByTestId('quick-fit-front'));
    expect(latestState.layers[0].layoutConstraint?.imageFit).toBe('cover');

    // 2. Rotate 90° from selection bar -> imageFit detaches cleanly
    await user.click(screen.getByTestId('selection-rotate-90'));
    expect(latestState.layers[0].rotationDeg).toBe(90);
    expect(latestState.layers[0].layoutConstraint?.imageFit).toBeUndefined();

    // 3. Re-pin via Fit Front, then rotate 90° from sidebar ArtworkControlsCard -> imageFit also detaches
    await user.click(screen.getByTestId('quick-fit-front'));
    expect(latestState.layers[0].layoutConstraint?.imageFit).toBe('cover');

    await user.click(screen.getByTestId('layer-rotate-90-btn'));
    expect(latestState.layers[0].rotationDeg).toBe(180);
    expect(latestState.layers[0].layoutConstraint?.imageFit).toBeUndefined();
  }, 15_000);
});
