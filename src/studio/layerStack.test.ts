import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  type CoverOrnamentLayer,
  type CoverTextLayer,
} from '@/types/coverElements';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { CoverImageLayerModel, type CoverImageLayer } from '@/types/studioLayer';
import {
  getElementStackPosition,
  getLayerDisplayMeta,
  hasCustomCrossTypeOrder,
  hasImageAboveVectorElements,
  pruneLayerOrder,
  reorderStudioElement,
  replaceLayerIdInOrder,
  resolveOrderedStudioElements,
  syncLayerOrderAfterAdd,
} from './layerStack';
import { generateAffinityCoverSvg, generatePrintReadyRollPdf } from './renderEngine';

function makeImage(id: string, overrides?: Partial<CoverImageLayer>): CoverImageLayer {
  return {
    ...CoverImageLayerModel.createInRect({
      id,
      dataUrl: 'data:image/png;base64,AAA',
      fileName: `${id}.png`,
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: 200, y: 20, width: 140, height: 210 },
      clipZone: 'front',
    }),
    ...overrides,
  };
}

function makeOrnament(id: string, overrides?: Partial<CoverOrnamentLayer>): CoverOrnamentLayer {
  return {
    ...CoverOrnamentLayerModel.createForZone(
      'frame-double-rule',
      { x: 200, y: 20, width: 140, height: 210 },
      'front',
      '#d9b566',
    ),
    id,
    ...overrides,
  };
}

function makeText(id: string, overrides?: Partial<CoverTextLayer>): CoverTextLayer {
  return {
    ...CoverTextLayerModel.createPreset('front-title', {
      x: 200,
      y: 20,
      width: 140,
      height: 210,
    }),
    id,
    text: 'THE ODYSSEY\nSecond Line',
    ...overrides,
  };
}

function buildMixedStudio(): CoverStudioState {
  return {
    ...CoverStudioModel.createDefault(),
    layers: [makeImage('img-1')],
    ornaments: [makeOrnament('orn-1')],
    textLayers: [makeText('txt-1')],
  };
}

describe('layerStack unified front-to-back ordering', () => {
  it('uses exact legacy bottom-to-top order ([...images, ...ornaments, ...textLayers]) when layerOrder is absent', () => {
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [makeImage('img-1'), makeImage('img-2')],
      ornaments: [makeOrnament('orn-1')],
      textLayers: [makeText('txt-1'), makeText('txt-2')],
    };

    const ordered = resolveOrderedStudioElements(studio);
    expect(ordered.map((e) => `${e.kind}:${e.layer.id}:${e.index}`)).toEqual([
      'image:img-1:0',
      'image:img-2:1',
      'ornament:orn-1:0',
      'text:txt-1:0',
      'text:txt-2:1',
    ]);
    expect(hasImageAboveVectorElements(studio)).toBe(false);
    expect(hasCustomCrossTypeOrder(studio)).toBe(false);
  });

  it('moves elements forward, backward, to front, and to back across all element kinds and clamps at ends', () => {
    const initial = buildMixedStudio();

    // Bring image forward once -> above ornament, below text
    const step1 = reorderStudioElement(initial, 'img-1', 'forward');
    expect(step1.layerOrder).toEqual(['orn-1', 'img-1', 'txt-1']);
    expect(hasImageAboveVectorElements(step1)).toBe(true);
    expect(hasCustomCrossTypeOrder(step1)).toBe(true);

    // Bring image to front -> top-most
    const step2 = reorderStudioElement(initial, 'img-1', 'front');
    expect(step2.layerOrder).toEqual(['orn-1', 'txt-1', 'img-1']);
    expect(getElementStackPosition(step2, 'img-1')).toEqual({
      index: 2,
      total: 3,
      canBringForward: false,
      canSendBackward: true,
    });

    // Clamping at top returns identical reference (no-op)
    expect(reorderStudioElement(step2, 'img-1', 'forward')).toBe(step2);
    expect(reorderStudioElement(step2, 'img-1', 'front')).toBe(step2);

    // Send text backward once from initial -> behind ornament
    const textBehindOrn = reorderStudioElement(initial, 'txt-1', 'backward');
    expect(textBehindOrn.layerOrder).toEqual(['img-1', 'txt-1', 'orn-1']);
    expect(hasImageAboveVectorElements(textBehindOrn)).toBe(false);
    expect(hasCustomCrossTypeOrder(textBehindOrn)).toBe(true);

    // Send text all the way to back
    const textAtBack = reorderStudioElement(initial, 'txt-1', 'back');
    expect(textAtBack.layerOrder).toEqual(['txt-1', 'img-1', 'orn-1']);
    expect(getElementStackPosition(textAtBack, 'txt-1')).toEqual({
      index: 0,
      total: 3,
      canBringForward: true,
      canSendBackward: false,
    });
    expect(reorderStudioElement(textAtBack, 'txt-1', 'backward')).toBe(textAtBack);
    expect(reorderStudioElement(textAtBack, 'txt-1', 'back')).toBe(textAtBack);

    // Unknown ID returns identical studio reference and empty position
    expect(reorderStudioElement(initial, 'missing-id', 'forward')).toBe(initial);
    expect(getElementStackPosition(initial, 'missing-id')).toEqual({
      index: -1,
      total: 3,
      canBringForward: false,
      canSendBackward: false,
    });
  });

  it('filters deleted/stale/duplicate IDs and gracefully places newly added IDs not yet in layerOrder', () => {
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [makeImage('img-1'), makeImage('img-new')],
      ornaments: [makeOrnament('orn-1'), makeOrnament('orn-new')],
      textLayers: [makeText('txt-1'), makeText('txt-new')],
      layerOrder: ['deleted-id', 'orn-1', 'img-1', 'img-1', 'txt-1', 'ghost-2'],
    };

    const resolved = resolveOrderedStudioElements(studio);
    // img-new inserts right after highest existing image (img-1); orn-new & txt-new append at top
    expect(resolved.map((e) => e.layer.id)).toEqual([
      'orn-1',
      'img-1',
      'img-new',
      'txt-1',
      'orn-new',
      'txt-new',
    ]);
  });

  it('prunes, appends, and replaces IDs in layerOrder cleanly across mutations', () => {
    const base: CoverStudioState = {
      ...buildMixedStudio(),
      layerOrder: ['orn-1', 'txt-1', 'img-1'],
    };

    // Prune after deleting ornament
    const pruned = pruneLayerOrder({ ...base, ornaments: [] });
    expect(pruned.layerOrder).toEqual(['txt-1', 'img-1']);

    // Prune all elements omits layerOrder key
    const empty = pruneLayerOrder({ ...base, layers: [], ornaments: [], textLayers: [] });
    expect('layerOrder' in empty).toBe(false);

    // Replace ID in-place (e.g. detaching From Series layer)
    const replaced = replaceLayerIdInOrder(
      {
        ...base,
        ornaments: [makeOrnament('orn-detached')],
      },
      'orn-1',
      'orn-detached',
    );
    expect(replaced.layerOrder).toEqual(['orn-detached', 'txt-1', 'img-1']);

    // Sync after adding new text appends to top; duplicate inserts right after source
    const withNewText = syncLayerOrderAfterAdd(
      { ...base, textLayers: [...base.textLayers, makeText('txt-2')] },
      ['txt-2'],
      'text',
    );
    expect(withNewText.layerOrder).toEqual(['orn-1', 'txt-1', 'img-1', 'txt-2']);

    const withDupText = syncLayerOrderAfterAdd(
      { ...base, textLayers: [...base.textLayers, makeText('txt-dup')] },
      ['txt-dup'],
      'text',
      { afterId: 'txt-1' },
    );
    expect(withDupText.layerOrder).toEqual(['orn-1', 'txt-1', 'txt-dup', 'img-1']);
  });

  it('builds human-readable display metadata including From Series badges and custom SVG names', () => {
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [
        makeImage('img-1', { fileName: 'hero.png', clipZone: 'none', origin: 'series-spine' }),
      ],
      ornaments: [
        makeOrnament('svg-1', {
          presetId: 'custom-svg',
          customSvgName: 'Dragon Crest',
          zone: 'back',
        }),
      ],
      textLayers: [makeText('txt-1', { text: 'DUNE\nFrank Herbert', zone: 'front' })],
    };
    const [imgItem, ornItem, txtItem] = resolveOrderedStudioElements(studio);

    expect(getLayerDisplayMeta(imgItem)).toMatchObject({
      kindLabel: 'Image',
      label: 'hero.png',
      zoneLabel: 'Full Cover',
      isFromSeries: true,
    });
    expect(getLayerDisplayMeta(ornItem)).toMatchObject({
      kindLabel: 'Ornament',
      label: 'Dragon Crest',
      zoneLabel: 'Back',
      isFromSeries: false,
    });
    expect(getLayerDisplayMeta(txtItem)).toMatchObject({
      kindLabel: 'Text',
      label: 'DUNE',
      zoneLabel: 'Front',
      isFromSeries: false,
    });
  });

  it('round-trips layerOrder through CoverStudioModel.serialize and deserialize and omits it when absent', () => {
    const legacyDefault = CoverStudioModel.createDefault();
    const serializedLegacy = CoverStudioModel.serialize(legacyDefault);
    expect('layerOrder' in serializedLegacy).toBe(false);
    const deserializedLegacy = CoverStudioModel.deserialize(serializedLegacy);
    expect('layerOrder' in deserializedLegacy).toBe(false);

    const custom: CoverStudioState = {
      ...buildMixedStudio(),
      layerOrder: ['orn-1', 'img-1', 'txt-1'],
    };
    const serialized = CoverStudioModel.serialize(custom);
    expect(serialized.layerOrder).toEqual(['orn-1', 'img-1', 'txt-1']);

    const deserialized = CoverStudioModel.deserialize({
      ...serialized,
      layerOrder: [' orn-1 ', '', 42, 'img-1', 'orn-1', 'txt-1'],
    });
    expect(deserialized.layerOrder).toEqual(['orn-1', 'img-1', 'txt-1']);

    // Excluding image data strips image layer IDs from serialized layerOrder cleanly
    const withoutImages = CoverStudioModel.serialize(custom, { includeImageData: false });
    expect(withoutImages.layers).toEqual([]);
    expect(withoutImages.layerOrder).toEqual(['orn-1', 'txt-1']);
  });

  it('emits Affinity SVG and Print PDF in exact custom cross-type layerOrder', async () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const studio: CoverStudioState = {
      ...buildMixedStudio(),
      layerOrder: ['txt-1', 'orn-1', 'img-1'],
    };

    const svg = generateAffinityCoverSvg(geom, studio, null);
    const txtPos = svg.indexOf('data-text-id="txt-1"');
    const ornPos = svg.indexOf('data-ornament-id="orn-1"');
    const imgPos = svg.indexOf('data-layer-id="img-1"');
    expect(txtPos).toBeGreaterThan(-1);
    expect(ornPos).toBeGreaterThan(txtPos);
    expect(imgPos).toBeGreaterThan(ornPos);

    // PDF export handles interleaved image-above-vectors cleanly without errors
    const pdfBytes = await generatePrintReadyRollPdf(geom, studio, null, {
      skipCanvasRaster: true,
    });
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
