import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BUILT_IN_DESIGN_PRESETS } from '@/resources/designPresets';
import { BookParametersModel, DEFAULT_BOOK_PARAMETERS, type BookParameters } from '@/types/bookParams';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  rotateOrnament90,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import { CoverDesignPresetModel } from '@/types/designPreset';
import {
  describeLayoutConstraint,
  detachConstraintOnMove,
  detachConstraintOnResize,
  hasActiveLayoutConstraint,
  sanitizeLayerLayoutConstraint,
  type LayerLayoutConstraint,
} from '@/types/layoutConstraints';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel, getLayerVisualRect, type CoverImageLayer } from '@/types/studioLayer';
import { computeStudioCanvasSpec, getPanelBoardRect } from './canvasSpec';
import { useCoverStudioActions } from './hooks/useCoverStudioActions';
import {
  applyStudioLayoutConstraints,
  resolveImageLayerConstraint,
  resolveOrnamentLayerConstraint,
  resolveTextLayerConstraint,
} from './layoutConstraints';
import { nudgeSelectedInStudio } from './studioClipboard';
import { remapStudioForGeometryChange } from './studioGeometryRemap';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeGeometry(patch?: Partial<BookParameters>) {
  const params = BookParametersModel.clampAndNormalize({
    ...DEFAULT_BOOK_PARAMETERS,
    ...patch,
  });
  return { params, geometry: calculateCaseGeometry(params) };
}

function createActionHarness(params: BookParameters, initialStudio: CoverStudioState) {
  const geometry = calculateCaseGeometry(params);
  const spec = computeStudioCanvasSpec(geometry);
  let latest = initialStudio;
  const onChange = vi.fn((next: CoverStudioState) => {
    latest = next;
  });
  const onStatusMessage = vi.fn();

  const { result, rerender } = renderHook(
    ({ studio }: { studio: CoverStudioState }) => {
      const studioRef = useRef(studio);
      studioRef.current = studio;
      const onChangeRef = useRef(onChange);
      onChangeRef.current = onChange;
      return useCoverStudioActions({
        effectiveParams: params,
        geometry,
        spec,
        studio,
        studioRef,
        onChange,
        onChangeRef,
        onStatusMessage,
        customFont: null,
        setCustomFont: vi.fn(),
        selectedTextId: null,
        setSelectedTextId: vi.fn(),
        selectedOrnamentId: null,
        setSelectedOrnamentId: vi.fn(),
        setSelectedLayerId: vi.fn(),
        setEyedropperTarget: vi.fn(),
        onSwitchTo2D: vi.fn(),
        onSelectImageLayer: vi.fn(),
        onSelectText: vi.fn(),
        onSelectOrnament: vi.fn(),
        onClearSelection: vi.fn(),
        toSvgMm: () => null,
      });
    },
    { initialProps: { studio: initialStudio } },
  );

  return {
    geometry,
    spec,
    getStudio: () => latest,
    getActions: () => result.current,
    rerenderStudio: () => rerender({ studio: latest }),
    onStatusMessage,
  };
}

describe('Declarative Layout Constraints (Pin / Detach Conditions)', () => {
  it('sanitizes, describes, and round-trips layout constraints through CoverStudioModel serialization', () => {
    expect(sanitizeLayerLayoutConstraint(null)).toBeUndefined();
    expect(
      sanitizeLayerLayoutConstraint({
        anchorZone: 'front',
        horizontal: { kind: 'free' },
        vertical: { kind: 'free' },
        imageFit: 'free',
      }),
    ).toBeUndefined();

    const clamped = sanitizeLayerLayoutConstraint({
      anchorZone: 'front',
      horizontal: { kind: 'inset-both', marginMm: 999 },
      vertical: { kind: 'inset-both', marginMm: -10 },
    });
    expect(clamped).toEqual({
      anchorZone: 'front',
      horizontal: { kind: 'inset-both', marginMm: 100 },
      vertical: { kind: 'inset-both', marginMm: 0 },
    });

    expect(
      describeLayoutConstraint({
        anchorZone: 'front',
        horizontal: { kind: 'inset-both', marginMm: 12 },
        vertical: { kind: 'inset-both', marginMm: 12 },
      }),
    ).toBe('Front · 12 mm margin');
    expect(
      describeLayoutConstraint({
        anchorZone: 'front',
        horizontal: { kind: 'center' },
        vertical: { kind: 'top-third' },
      }),
    ).toBe('Front · Top ⅓');
    expect(
      describeLayoutConstraint({
        anchorZone: 'fullWrap',
        horizontal: { kind: 'center' },
        vertical: { kind: 'center' },
        imageFit: 'cover',
      }),
    ).toBe('Full Wrap · Fit Cover');

    const { geometry } = makeGeometry();
    const spec = computeStudioCanvasSpec(geometry);
    const pinnedText: CoverTextLayer = {
      ...CoverTextLayerModel.createPreset('front-title', spec.frontBoardRect),
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'center' },
        vertical: { kind: 'top-third' },
      },
    };
    const pinnedFrame: CoverOrnamentLayer = {
      ...CoverOrnamentLayerModel.createForZone('frame-double-rule', spec.frontBoardRect, 'front'),
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'inset-both', marginMm: 12 },
        vertical: { kind: 'inset-both', marginMm: 12 },
      },
    };
    const pinnedImg: CoverImageLayer = {
      ...CoverImageLayerModel.createInRect({
        id: 'img-cover',
        dataUrl: TINY_PNG,
        fileName: 'cover.png',
        naturalWidth: 1000,
        naturalHeight: 1500,
        targetRect: spec.frontArtworkRect,
        clipZone: 'front',
      }),
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'center' },
        vertical: { kind: 'center' },
        imageFit: 'cover',
      },
    };

    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      textLayers: [pinnedText],
      ornaments: [pinnedFrame],
      layers: [pinnedImg],
    };

    const restored = CoverStudioModel.deserialize(CoverStudioModel.serialize(studio));
    expect(restored.textLayers[0].role).toBe('title');
    expect(restored.textLayers[0].layoutConstraint).toEqual(pinnedText.layoutConstraint);
    expect(restored.ornaments[0].layoutConstraint).toEqual(pinnedFrame.layoutConstraint);
    expect(restored.layers[0].layoutConstraint).toEqual(pinnedImg.layoutConstraint);
  });

  it('pins text, ornaments (6/12/18 mm & thirds), and images (Fit Front / Fit Full Cover) and preserves pins across US Trade -> A6 -> Royal and Binding Style switches', () => {
    const trade = makeGeometry(BookParametersModel.applyPreset(DEFAULT_BOOK_PARAMETERS, 'us-trade-standard'));
    const a6 = makeGeometry(BookParametersModel.applyPreset(DEFAULT_BOOK_PARAMETERS, 'a6-notebook'));
    const royal = makeGeometry({ pbWidthMm: 156, pbHeightMm: 234, pbThicknessMm: 30 });
    const slip = makeGeometry({ ...trade.params, bindingStyle: 'softcover-jacket', softcoverPocketMode: 'integrated' });
    const dust = makeGeometry({ ...trade.params, bindingStyle: 'dust-jacket' });

    const tradeSpec = computeStudioCanvasSpec(trade.geometry);

    const pinnedTitle = resolveTextLayerConstraint(
      {
        ...CoverTextLayerModel.createPreset('front-title', tradeSpec.frontBoardRect),
        id: 'txt-pinned',
        layoutConstraint: {
          anchorZone: 'front',
          horizontal: { kind: 'center' },
          vertical: { kind: 'center' },
        },
      },
      tradeSpec,
    );

    const pinnedFrame = resolveOrnamentLayerConstraint(
      {
        ...CoverOrnamentLayerModel.createForZone('frame-double-rule', tradeSpec.frontBoardRect, 'front'),
        id: 'orn-frame-12',
        layoutConstraint: {
          anchorZone: 'front',
          horizontal: { kind: 'inset-both', marginMm: 12 },
          vertical: { kind: 'inset-both', marginMm: 12 },
        },
      },
      tradeSpec,
    );

    const pinnedFrontCoverImg = resolveImageLayerConstraint(
      {
        ...CoverImageLayerModel.createInRect({
          id: 'img-fit-front',
          dataUrl: TINY_PNG,
          fileName: 'front.png',
          naturalWidth: 1200,
          naturalHeight: 1600,
          targetRect: tradeSpec.frontArtworkRect,
          clipZone: 'front',
        }),
        layoutConstraint: {
          anchorZone: 'front',
          horizontal: { kind: 'center' },
          vertical: { kind: 'center' },
          imageFit: 'cover',
        },
      },
      tradeSpec,
    );

    const pinnedFullWrapImg = resolveImageLayerConstraint(
      {
        ...CoverImageLayerModel.createInRect({
          id: 'img-fit-full',
          dataUrl: TINY_PNG,
          fileName: 'wrap.png',
          naturalWidth: 2400,
          naturalHeight: 1400,
          targetRect: tradeSpec.fullWrapRect,
          clipZone: 'none',
        }),
        layoutConstraint: {
          anchorZone: 'fullWrap',
          horizontal: { kind: 'center' },
          vertical: { kind: 'center' },
          imageFit: 'cover',
        },
      },
      tradeSpec,
    );

    const initialStudio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      textLayers: [pinnedTitle],
      ornaments: [pinnedFrame],
      layers: [pinnedFullWrapImg, pinnedFrontCoverImg],
    };

    const targets = [a6.geometry, royal.geometry, slip.geometry, dust.geometry, trade.geometry];
    let curGeom = trade.geometry;
    let curStudio = initialStudio;

    for (const nextGeom of targets) {
      curStudio = remapStudioForGeometryChange(curStudio, curGeom, nextGeom);
      curGeom = nextGeom;
      const spec = computeStudioCanvasSpec(nextGeom);
      const frontBoard = getPanelBoardRect(spec, 'front');

      // 1. Text stays dead-centered on visible front board
      const txt = curStudio.textLayers[0];
      expect(txt.xMm).toBeCloseTo(frontBoard.x + frontBoard.width / 2, 1);
      expect(txt.yMm).toBeCloseTo(frontBoard.y + frontBoard.height / 2, 1);
      expect(txt.align).toBe('center');

      // 2. Frame holds exact 12 mm margins on every book size & binding style
      const frame = curStudio.ornaments[0];
      expect(frame.xMm).toBeCloseTo(frontBoard.x + 12, 1);
      expect(frame.yMm).toBeCloseTo(frontBoard.y + 12, 1);
      expect(frame.widthMm).toBeCloseTo(frontBoard.width - 24, 1);
      expect(frame.heightMm).toBeCloseTo(frontBoard.height - 24, 1);

      // 3. Front-fitted cover image stays edge-to-edge on frontArtworkRect (no edge gaps, no flap/tab bleed)
      const frontImg = curStudio.layers.find((l) => l.id === 'img-fit-front')!;
      const frontVis = getLayerVisualRect(frontImg);
      expect(frontVis.x).toBeLessThanOrEqual(spec.frontArtworkRect.x + 0.05);
      expect(frontVis.y).toBeLessThanOrEqual(spec.frontArtworkRect.y + 0.05);
      expect(frontVis.x + frontVis.width).toBeGreaterThanOrEqual(
        spec.frontArtworkRect.x + spec.frontArtworkRect.width - 0.05,
      );
      expect(frontVis.y + frontVis.height).toBeGreaterThanOrEqual(
        spec.frontArtworkRect.y + spec.frontArtworkRect.height - 0.05,
      );

      // 4. Full-wrap fitted cover image stays edge-to-edge across entire fullWrapRect
      const wrapImg = curStudio.layers.find((l) => l.id === 'img-fit-full')!;
      const wrapVis = getLayerVisualRect(wrapImg);
      expect(wrapVis.x).toBeLessThanOrEqual(spec.fullWrapRect.x + 0.05);
      expect(wrapVis.y).toBeLessThanOrEqual(spec.fullWrapRect.y + 0.05);
      expect(wrapVis.x + wrapVis.width).toBeGreaterThanOrEqual(
        spec.fullWrapRect.x + spec.fullWrapRect.width - 0.05,
      );
      expect(wrapVis.y + wrapVis.height).toBeGreaterThanOrEqual(
        spec.fullWrapRect.y + spec.fullWrapRect.height - 0.05,
      );
    }

    // Returning to US Trade has < 0.01 mm drift on every pinned element
    expect(Math.abs(curStudio.textLayers[0].xMm - pinnedTitle.xMm)).toBeLessThan(0.01);
    expect(Math.abs(curStudio.textLayers[0].yMm - pinnedTitle.yMm)).toBeLessThan(0.01);
    expect(Math.abs(curStudio.ornaments[0].xMm - pinnedFrame.xMm)).toBeLessThan(0.01);
    expect(Math.abs(curStudio.ornaments[0].widthMm - pinnedFrame.widthMm)).toBeLessThan(0.01);
    expect(
      Math.abs(curStudio.layers.find((l) => l.id === 'img-fit-front')!.widthMm - pinnedFrontCoverImg.widthMm),
    ).toBeLessThan(0.01);
  });

  it('maintains < 0.01 mm A -> B -> A round-trip invertibility for mixed pinned, partially pinned, and unpinned layers', () => {
    const geomA = makeGeometry().geometry;
    const geomB = makeGeometry({ pbWidthMm: 105, pbHeightMm: 148, bindingStyle: 'dust-jacket' }).geometry;
    const specA = computeStudioCanvasSpec(geomA);

    const partialPinText: CoverTextLayer = {
      ...CoverTextLayerModel.createPreset('front-title', specA.frontBoardRect),
      id: 'txt-partial',
      xMm: specA.frontBoardRect.x + specA.frontBoardRect.width / 2,
      yMm: specA.frontBoardRect.y + 62.5,
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'center' },
      },
    };
    const freeText: CoverTextLayer = {
      ...CoverTextLayerModel.createPreset('text', specA.backBoardRect),
      id: 'txt-free',
      zone: 'back',
      xMm: specA.backBoardRect.x + 41.2,
      yMm: specA.backBoardRect.y + 97.4,
    };

    const studioA: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      textLayers: [partialPinText, freeText],
    };

    const onB = remapStudioForGeometryChange(studioA, geomA, geomB);
    const specB = computeStudioCanvasSpec(geomB);
    // Partially pinned text stays dead-centered on B's front board while remapping Y proportionally
    expect(onB.textLayers[0].xMm).toBeCloseTo(specB.frontBoardRect.x + specB.frontBoardRect.width / 2, 2);

    const backToA = remapStudioForGeometryChange(onB, geomB, geomA);
    expect(Math.abs(backToA.textLayers[0].xMm - partialPinText.xMm)).toBeLessThan(0.01);
    expect(Math.abs(backToA.textLayers[0].yMm - partialPinText.yMm)).toBeLessThan(0.01);
    expect(Math.abs(backToA.textLayers[1].xMm - freeText.xMm)).toBeLessThan(0.01);
    expect(Math.abs(backToA.textLayers[1].yMm - freeText.yMm)).toBeLessThan(0.01);
  });

  it('auto-detaches moved axes on drag/nudge (preserving unmoved center axis) and detaches inset/fit on resize', () => {
    const centerBoth: LayerLayoutConstraint = {
      anchorZone: 'front',
      horizontal: { kind: 'center' },
      vertical: { kind: 'center' },
    };

    // Dragging straight down along center snap guide keeps horizontal center pinned!
    const afterVerticalDrag = detachConstraintOnMove(centerBoth, false, true);
    expect(afterVerticalDrag).toEqual({
      anchorZone: 'front',
      horizontal: { kind: 'center' },
    });
    expect(hasActiveLayoutConstraint(afterVerticalDrag)).toBe(true);

    // Dragging freely in X & Y detaches completely
    expect(detachConstraintOnMove(centerBoth, true, true)).toBeUndefined();

    // Resizing detaches inset-both and imageFit cleanly
    expect(
      detachConstraintOnResize({
        anchorZone: 'front',
        horizontal: { kind: 'inset-both', marginMm: 12 },
        vertical: { kind: 'inset-both', marginMm: 12 },
      }),
    ).toBeUndefined();

    const fitConstraint: LayerLayoutConstraint = {
      anchorZone: 'front',
      horizontal: { kind: 'center' },
      vertical: { kind: 'center' },
      imageFit: 'cover',
    };
    const afterWheelResize = detachConstraintOnResize(fitConstraint);
    expect(afterWheelResize?.imageFit).toBeUndefined();
    expect(afterWheelResize?.horizontal).toEqual({ kind: 'center' });

    // Keyboard nudge vertically detaches vertical pin while preserving horizontal center pin
    const { geometry } = makeGeometry();
    const spec = computeStudioCanvasSpec(geometry);
    const canvasBounds = { x: 0, y: 0, width: spec.totalWidthMm, height: spec.totalHeightMm };
    const pinnedText: CoverTextLayer = {
      ...CoverTextLayerModel.createPreset('front-title', spec.frontBoardRect),
      id: 'txt-nudge',
      layoutConstraint: centerBoth,
    };
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      textLayers: [pinnedText],
    };
    const nudgedDown = nudgeSelectedInStudio(
      studio,
      { imageId: null, textId: 'txt-nudge', ornamentId: null },
      0,
      5,
      canvasBounds,
      spec,
    )!;
    expect(nudgedDown.textLayers[0].layoutConstraint).toEqual({
      anchorZone: 'front',
      horizontal: { kind: 'center' },
    });

    const nudgedRight = nudgeSelectedInStudio(
      nudgedDown,
      { imageId: null, textId: 'txt-nudge', ornamentId: null },
      5,
      0,
      canvasBounds,
      spec,
    )!;
    expect(nudgedRight.textLayers[0].layoutConstraint).toBeUndefined();
  });

  it('fixes back-cover unclipped image alignment and rigid-case ornament board-center alignment, and supports 1-click detach preserving coordinates', () => {
    const { params, geometry } = makeGeometry();
    const spec = computeStudioCanvasSpec(geometry);

    // Unclipped image sitting on the BACK cover
    const backUnclippedImg = CoverImageLayerModel.createInRect({
      id: 'img-back-free',
      dataUrl: TINY_PNG,
      fileName: 'back-emblem.png',
      naturalWidth: 600,
      naturalHeight: 600,
      targetRect: {
        x: spec.backArtworkRect.x + 20,
        y: spec.backArtworkRect.y + 30,
        width: 50,
        height: 50,
      },
      clipZone: 'none',
      mode: 'contain',
    });

    const frontOrnament = CoverOrnamentLayerModel.createForZone(
      'emblem-compass-rose',
      spec.frontBoardRect,
      'front',
    );

    const initialStudio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [backUnclippedImg],
      ornaments: [frontOrnament],
    };

    const harness = createActionHarness(params, initialStudio);

    // 1. Align back-cover unclipped image -> MUST align inside backArtworkRect, NOT jump to front!
    act(() => {
      harness.getActions().handleQuickAlignImage('img-back-free', 'center');
    });
    harness.rerenderStudio();
    const alignedBackImg = harness.getStudio().layers[0];
    expect(alignedBackImg.layoutConstraint).toEqual({
      anchorZone: 'back',
      horizontal: { kind: 'center' },
      vertical: { kind: 'center' },
    });
    expect(alignedBackImg.xMm + alignedBackImg.widthMm / 2).toBeCloseTo(
      spec.backArtworkRect.x + spec.backArtworkRect.width / 2,
      1,
    );

    // 2. Align rigid-case ornament to Center -> MUST center on visible frontBoardRect (not frontArtworkRect!)
    act(() => {
      harness.getActions().handleQuickAlignOrnament(frontOrnament.id, 'center');
    });
    harness.rerenderStudio();
    const alignedOrn = harness.getStudio().ornaments[0];
    expect(alignedOrn.xMm + alignedOrn.widthMm / 2).toBeCloseTo(
      spec.frontBoardRect.x + spec.frontBoardRect.width / 2,
      1,
    );
    expect(alignedOrn.yMm + alignedOrn.heightMm / 2).toBeCloseTo(
      spec.frontBoardRect.y + spec.frontBoardRect.height / 2,
      1,
    );

    // 3. Explicit 1-click detach clears constraint while preserving exact current coordinates
    const prevX = alignedOrn.xMm;
    const prevY = alignedOrn.yMm;
    act(() => {
      harness.getActions().handleDetachConstraint({ kind: 'ornament', id: alignedOrn.id });
    });
    const detachedOrn = harness.getStudio().ornaments[0];
    expect(detachedOrn.layoutConstraint).toBeUndefined();
    expect(detachedOrn.xMm).toBe(prevX);
    expect(detachedOrn.yMm).toBe(prevY);
  });

  it('preserves user title and author text via semantic role when switching design presets', () => {
    const { geometry } = makeGeometry();
    const classic = BUILT_IN_DESIGN_PRESETS.find((p) => p.id === 'classic-clothbound-gold')!;
    const deco = BUILT_IN_DESIGN_PRESETS.find((p) => p.id === 'art-deco-midnight')!;
    const celestial = BUILT_IN_DESIGN_PRESETS.find((p) => p.id === 'celestial-oxblood')!;

    // 1. Empty default studio gets built-in placeholder text
    const emptyApplied = CoverDesignPresetModel.applyToStudio(
      classic,
      geometry,
      CoverStudioModel.createDefault(),
    );
    expect(emptyApplied.textLayers[0].text).toBe('BOOK TITLE');
    expect(emptyApplied.textLayers[0].role).toBe('title');
    expect(emptyApplied.textLayers[1].text).toBe('AUTHOR NAME');
    expect(emptyApplied.textLayers[1].role).toBe('author');

    // 2. User edits title & author, then switches presets -> user text is preserved!
    const userEdited: CoverStudioState = {
      ...emptyApplied,
      textLayers: emptyApplied.textLayers.map((t) =>
        t.role === 'title'
          ? { ...t, text: 'THE LEFT HAND OF DARKNESS' }
          : t.role === 'author'
            ? { ...t, text: 'URSULA K. LE GUIN' }
            : t,
      ),
    };
    const switchedToDeco = CoverDesignPresetModel.applyToStudio(deco, geometry, userEdited);
    expect(switchedToDeco.textLayers.find((t) => t.role === 'title')?.text).toBe(
      'THE LEFT HAND OF DARKNESS',
    );
    expect(switchedToDeco.textLayers.find((t) => t.role === 'author')?.text).toBe(
      'URSULA K. LE GUIN',
    );

    // 3. Empty cover with spine title/author populates built-in preset from spine metadata
    const withSpineOnly: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Piranesi',
        author: 'Susanna Clarke',
      },
    };
    const appliedFromSpine = CoverDesignPresetModel.applyToStudio(celestial, geometry, withSpineOnly);
    expect(appliedFromSpine.textLayers.find((t) => t.role === 'title')?.text).toBe('Piranesi');
    expect(appliedFromSpine.textLayers.find((t) => t.role === 'author')?.text).toBe('Susanna Clarke');
  });

  it('applies layout constraints cleanly via applyStudioLayoutConstraints and short-circuits when already satisfied', () => {
    const { geometry } = makeGeometry();
    const spec = computeStudioCanvasSpec(geometry);
    const driftedTitle: CoverTextLayer = {
      ...CoverTextLayerModel.createPreset('front-title', spec.frontBoardRect),
      xMm: 10,
      yMm: 10,
      layoutConstraint: {
        anchorZone: 'front',
        horizontal: { kind: 'center' },
        vertical: { kind: 'top-third' },
      },
    };
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      textLayers: [driftedTitle],
    };

    const resolved = applyStudioLayoutConstraints(studio, geometry);
    expect(resolved).not.toBe(studio);
    expect(resolved.textLayers[0].xMm).toBeCloseTo(
      spec.frontBoardRect.x + spec.frontBoardRect.width / 2,
      2,
    );
    expect(resolved.textLayers[0].yMm).toBeCloseTo(
      spec.frontBoardRect.y + spec.frontBoardRect.height * 0.3,
      2,
    );

    // Second pass is idempotent and returns exact same reference
    const secondPass = applyStudioLayoutConstraints(resolved, geometry);
    expect(secondPass).toBe(resolved);
  });

  it('detaches inset-both on 90° ornament rotation via handleUpdateOrnament while preserving constraint on color/flip edits', () => {
    const { params, geometry } = makeGeometry();
    const spec = computeStudioCanvasSpec(geometry);
    const frame = CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      spec.frontBoardRect,
      'front',
      '#d9b566',
    );
    const harness = createActionHarness(params, {
      ...CoverStudioModel.createDefault(),
      ornaments: [frame],
    });

    // Pin frame to 12 mm inset-both margin
    act(() => {
      harness.getActions().handleFitOrnamentWithMargin(frame.id, 12);
    });
    harness.rerenderStudio();
    expect(harness.getStudio().ornaments[0].layoutConstraint).toEqual({
      anchorZone: 'front',
      horizontal: { kind: 'inset-both', marginMm: 12 },
      vertical: { kind: 'inset-both', marginMm: 12 },
    });

    // Color & flip edits keep 12 mm margin pin intact
    act(() => {
      harness.getActions().handleUpdateOrnament(frame.id, { color: '#f5efe2', flipX: true });
    });
    harness.rerenderStudio();
    expect(harness.getStudio().ornaments[0].layoutConstraint).toEqual({
      anchorZone: 'front',
      horizontal: { kind: 'inset-both', marginMm: 12 },
      vertical: { kind: 'inset-both', marginMm: 12 },
    });

    // Rotating 90° via ClassicDesignsCard patch shape detaches inset-both so resize won't snap it back
    const pinnedFrame = harness.getStudio().ornaments[0];
    const rotated = rotateOrnament90(pinnedFrame);
    act(() => {
      harness.getActions().handleUpdateOrnament(frame.id, {
        xMm: rotated.xMm,
        yMm: rotated.yMm,
        widthMm: rotated.widthMm,
        heightMm: rotated.heightMm,
        rotationDeg: rotated.rotationDeg,
      });
    });
    harness.rerenderStudio();

    const afterRotate = harness.getStudio().ornaments[0];
    expect(afterRotate.rotationDeg).toBe(90);
    expect(afterRotate.layoutConstraint).toBeUndefined();
    expect(afterRotate.widthMm).toBeGreaterThan(afterRotate.heightMm);

    // Subsequent book resize keeps rotated landscape proportions instead of snapping back to portrait 12 mm inset
    const a6Geom = makeGeometry(
      BookParametersModel.applyPreset(DEFAULT_BOOK_PARAMETERS, 'a6-notebook'),
    ).geometry;
    const remapped = remapStudioForGeometryChange(harness.getStudio(), geometry, a6Geom);
    const a6Spec = computeStudioCanvasSpec(a6Geom);
    expect(remapped.ornaments[0].widthMm).not.toBeCloseTo(a6Spec.frontBoardRect.width - 24, 0);
  });
});
