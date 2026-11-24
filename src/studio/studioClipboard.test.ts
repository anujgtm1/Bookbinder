import { describe, expect, it } from 'vitest';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import type { Rect2D } from '@/types/geometry';
import { CoverStudioModel, type CoverStudioState } from '@/types/studio';
import { getLayerVisualRect, type CoverImageLayer } from '@/types/studioLayer';
import {
  DEFAULT_PASTE_OFFSET_MM,
  NUDGE_SHIFT_STEP_MM,
  NUDGE_STEP_MM,
  createClipboardItemFromSelection,
  createPocketClipboardItem,
  duplicateSelectedInStudio,
  isEditableKeyboardTarget,
  nudgeSelectedInPockets,
  nudgeSelectedInStudio,
  pasteClipboardItemToPockets,
  pasteClipboardItemToStudio,
} from './studioClipboard';

const CANVAS_BOUNDS: Rect2D = { x: 0, y: 0, width: 320, height: 240 };

function makeImageLayer(overrides: Partial<CoverImageLayer> = {}): CoverImageLayer {
  return {
    id: 'img-1',
    dataUrl: 'data:image/png;base64,abc123',
    fileName: 'cover.png',
    naturalWidth: 1000,
    naturalHeight: 1500,
    xMm: 40,
    yMm: 30,
    widthMm: 100,
    heightMm: 150,
    clipZone: 'front',
    ...overrides,
  };
}

function makeTextLayer(overrides: Partial<CoverTextLayer> = {}): CoverTextLayer {
  return {
    id: 'txt-1',
    text: 'DUNE',
    zone: 'front',
    xMm: 220,
    yMm: 80,
    fontId: 'eb-garamond',
    fontSizePt: 26,
    letterSpacingEm: 0.08,
    lineHeight: 1.2,
    align: 'center',
    color: '#f5efe2',
    uppercase: true,
    ...overrides,
  };
}

function makeOrnamentLayer(overrides: Partial<CoverOrnamentLayer> = {}): CoverOrnamentLayer {
  return {
    id: 'orn-1',
    presetId: 'custom-svg',
    zone: 'front',
    xMm: 180,
    yMm: 50,
    widthMm: 60,
    heightMm: 40,
    color: '#d9b566',
    strokeWidthMm: 0.7,
    customSvgName: 'crest.svg',
    customSvgPaths: ['M 0 0 L 10 10 Z'],
    customSvgViewBox: { width: 10, height: 10 },
    customSvgRenderMode: 'fill',
    ...overrides,
  };
}

function makeStudioWithAllElements(): CoverStudioState {
  return {
    ...CoverStudioModel.createDefault(),
    layers: [makeImageLayer()],
    textLayers: [makeTextLayer()],
    ornaments: [makeOrnamentLayer()],
  };
}

describe('studioClipboard constants', () => {
  it('exposes standard millimeter offset and nudge constants', () => {
    expect(DEFAULT_PASTE_OFFSET_MM).toBe(6);
    expect(NUDGE_STEP_MM).toBe(1);
    expect(NUDGE_SHIFT_STEP_MM).toBe(5);
  });
});

describe('createClipboardItemFromSelection & createPocketClipboardItem', () => {
  it('deep-clones selected cover image, text, and ornament layers', () => {
    const studio = makeStudioWithAllElements();

    const imgItem = createClipboardItemFromSelection(studio, {
      imageId: 'img-1',
      textId: null,
      ornamentId: null,
    });
    expect(imgItem?.kind).toBe('cover-image');
    if (imgItem?.kind === 'cover-image') {
      expect(imgItem.layer).toEqual(studio.layers[0]);
      expect(imgItem.layer).not.toBe(studio.layers[0]);
    }

    const txtItem = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: 'txt-1',
      ornamentId: null,
    });
    expect(txtItem?.kind).toBe('cover-text');
    if (txtItem?.kind === 'cover-text') {
      expect(txtItem.layer).toEqual(studio.textLayers[0]);
      expect(txtItem.layer).not.toBe(studio.textLayers[0]);
    }

    const ornItem = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: null,
      ornamentId: 'orn-1',
    });
    expect(ornItem?.kind).toBe('cover-ornament');
    if (ornItem?.kind === 'cover-ornament') {
      expect(ornItem.layer).toEqual(studio.ornaments[0]);
      expect(ornItem.layer).not.toBe(studio.ornaments[0]);
      expect(ornItem.layer.customSvgPaths).not.toBe(studio.ornaments[0].customSvgPaths);
      expect(ornItem.layer.customSvgViewBox).not.toBe(studio.ornaments[0].customSvgViewBox);
    }
  });

  it('returns null when nothing is selected or selected id does not exist', () => {
    const studio = makeStudioWithAllElements();
    expect(
      createClipboardItemFromSelection(studio, {
        imageId: null,
        textId: null,
        ornamentId: null,
      }),
    ).toBeNull();
    expect(
      createClipboardItemFromSelection(studio, {
        imageId: 'missing',
        textId: 'missing',
        ornamentId: 'missing',
      }),
    ).toBeNull();
  });

  it('creates a deep-cloned pocket-image clipboard item or returns null', () => {
    const pocketLayers = [makeImageLayer({ id: 'pocket-1', tiled: true })];
    const item = createPocketClipboardItem(pocketLayers, 'pocket-1');
    expect(item?.kind).toBe('pocket-image');
    if (item?.kind === 'pocket-image') {
      expect(item.layer).toEqual(pocketLayers[0]);
      expect(item.layer).not.toBe(pocketLayers[0]);
    }

    expect(createPocketClipboardItem(pocketLayers, null)).toBeNull();
    expect(createPocketClipboardItem(pocketLayers, 'nope')).toBeNull();
  });
});

describe('pasteClipboardItemToStudio & duplicateSelectedInStudio', () => {
  it('pastes image, text, and ornament with unique IDs and stepped pasteIndex offsets', () => {
    const studio = makeStudioWithAllElements();

    // Paste image twice with pasteIndex 1 and 2
    const imgItem = createClipboardItemFromSelection(studio, {
      imageId: 'img-1',
      textId: null,
      ornamentId: null,
    })!;
    const paste1 = pasteClipboardItemToStudio(studio, imgItem, CANVAS_BOUNDS, 1)!;
    expect(paste1.pastedKind).toBe('image');
    expect(paste1.pastedId).not.toBe('img-1');
    expect(paste1.studio.layers).toHaveLength(2);
    expect(paste1.studio.layers[1].xMm).toBe(46);
    expect(paste1.studio.layers[1].yMm).toBe(36);
    // Original studio is not mutated
    expect(studio.layers).toHaveLength(1);

    const paste2 = pasteClipboardItemToStudio(paste1.studio, imgItem, CANVAS_BOUNDS, 2)!;
    expect(paste2.pastedId).not.toBe('img-1');
    expect(paste2.pastedId).not.toBe(paste1.pastedId);
    expect(paste2.studio.layers[2].xMm).toBe(52);
    expect(paste2.studio.layers[2].yMm).toBe(42);

    // Paste text
    const txtItem = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: 'txt-1',
      ornamentId: null,
    })!;
    const pastedTxt = pasteClipboardItemToStudio(studio, txtItem, CANVAS_BOUNDS)!;
    expect(pastedTxt.pastedKind).toBe('text');
    expect(pastedTxt.pastedId).not.toBe('txt-1');
    expect(pastedTxt.studio.textLayers).toHaveLength(2);
    expect(pastedTxt.studio.textLayers[1].xMm).toBe(226);
    expect(pastedTxt.studio.textLayers[1].yMm).toBe(86);

    // Paste ornament
    const ornItem = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: null,
      ornamentId: 'orn-1',
    })!;
    const pastedOrn = pasteClipboardItemToStudio(studio, ornItem, CANVAS_BOUNDS)!;
    expect(pastedOrn.pastedKind).toBe('ornament');
    expect(pastedOrn.pastedId).not.toBe('orn-1');
    expect(pastedOrn.studio.ornaments).toHaveLength(2);
    expect(pastedOrn.studio.ornaments[1].xMm).toBe(186);
    expect(pastedOrn.studio.ornaments[1].yMm).toBe(56);
    expect(pastedOrn.studio.ornaments[1].customSvgPaths).not.toBe(
      studio.ornaments[0].customSvgPaths,
    );
  });

  it('clamps pasted items inside canvasBounds so they never go off-canvas', () => {
    const studio: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [makeImageLayer({ xMm: 218, yMm: 88, widthMm: 100, heightMm: 150 })],
      textLayers: [makeTextLayer({ xMm: 318, yMm: 238 })],
      ornaments: [makeOrnamentLayer({ xMm: 258, yMm: 198, widthMm: 60, heightMm: 40 })],
    };

    const dupImg = duplicateSelectedInStudio(
      studio,
      { imageId: 'img-1', textId: null, ornamentId: null },
      CANVAS_BOUNDS,
    )!;
    expect(dupImg.studio.layers[1].xMm).toBe(220); // 320 - 100
    expect(dupImg.studio.layers[1].yMm).toBe(90); // 240 - 150

    const dupTxt = duplicateSelectedInStudio(
      studio,
      { imageId: null, textId: 'txt-1', ornamentId: null },
      CANVAS_BOUNDS,
    )!;
    expect(dupTxt.studio.textLayers[1].xMm).toBe(320);
    expect(dupTxt.studio.textLayers[1].yMm).toBe(240);

    const dupOrn = duplicateSelectedInStudio(
      studio,
      { imageId: null, textId: null, ornamentId: 'orn-1' },
      CANVAS_BOUNDS,
    )!;
    expect(dupOrn.studio.ornaments[1].xMm).toBe(260); // 320 - 60
    expect(dupOrn.studio.ornaments[1].yMm).toBe(200); // 240 - 40
  });

  it('returns null when pasting a pocket-image into Cover Studio or duplicating with no selection', () => {
    const studio = makeStudioWithAllElements();
    const pocketItem = createPocketClipboardItem([makeImageLayer({ id: 'p-1' })], 'p-1')!;
    expect(pasteClipboardItemToStudio(studio, pocketItem, CANVAS_BOUNDS)).toBeNull();
    expect(
      duplicateSelectedInStudio(
        studio,
        { imageId: null, textId: null, ornamentId: null },
        CANVAS_BOUNDS,
      ),
    ).toBeNull();
  });
});

describe('pasteClipboardItemToPockets', () => {
  const pocketBounds: Rect2D = { x: 0, y: 0, width: 160, height: 220 };

  it('pastes pocket-image layers with unique IDs and clamped offsets', () => {
    const layers = [makeImageLayer({ id: 'p-1', xMm: 98, yMm: 118, widthMm: 60, heightMm: 100 })];
    const item = createPocketClipboardItem(layers, 'p-1')!;

    const result = pasteClipboardItemToPockets(layers, item, pocketBounds, 1)!;
    expect(result.pastedId).not.toBe('p-1');
    expect(result.layers).toHaveLength(2);
    expect(result.layers[1].xMm).toBe(100); // clamped to 160 - 60
    expect(result.layers[1].yMm).toBe(120); // clamped to 220 - 100
    expect(layers).toHaveLength(1);
  });

  it('rejects non-pocket clipboard items', () => {
    const studio = makeStudioWithAllElements();
    const coverImg = createClipboardItemFromSelection(studio, {
      imageId: 'img-1',
      textId: null,
      ornamentId: null,
    })!;
    const coverTxt = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: 'txt-1',
      ornamentId: null,
    })!;
    const coverOrn = createClipboardItemFromSelection(studio, {
      imageId: null,
      textId: null,
      ornamentId: 'orn-1',
    })!;

    expect(pasteClipboardItemToPockets([], coverImg, pocketBounds)).toBeNull();
    expect(pasteClipboardItemToPockets([], coverTxt, pocketBounds)).toBeNull();
    expect(pasteClipboardItemToPockets([], coverOrn, pocketBounds)).toBeNull();
  });
});

describe('nudgeSelectedInStudio & nudgeSelectedInPockets', () => {
  it('nudges image, text, and ornament layers cleanly with rounding and clamping', () => {
    const studio = makeStudioWithAllElements();

    // Image nudge (+1, -5)
    const nudgedImg = nudgeSelectedInStudio(
      studio,
      { imageId: 'img-1', textId: null, ornamentId: null },
      NUDGE_STEP_MM,
      -NUDGE_SHIFT_STEP_MM,
      CANVAS_BOUNDS,
    )!;
    expect(nudgedImg.layers[0].xMm).toBe(41);
    expect(nudgedImg.layers[0].yMm).toBe(25);
    expect(studio.layers[0].xMm).toBe(40); // immutable

    // Text nudge with fractional value rounds to 2 decimals
    const nudgedTxt = nudgeSelectedInStudio(
      studio,
      { imageId: null, textId: 'txt-1', ornamentId: null },
      0.333,
      -1.666,
      CANVAS_BOUNDS,
    )!;
    expect(nudgedTxt.textLayers[0].xMm).toBe(220.33);
    expect(nudgedTxt.textLayers[0].yMm).toBe(78.33);

    // Ornament nudge clamped at left/top edge
    const nudgedOrn = nudgeSelectedInStudio(
      studio,
      { imageId: null, textId: null, ornamentId: 'orn-1' },
      -500,
      -500,
      CANVAS_BOUNDS,
    )!;
    expect(nudgedOrn.ornaments[0].xMm).toBe(0);
    expect(nudgedOrn.ornaments[0].yMm).toBe(0);
  });

  it('handles 90°-rotated images and oversized full-bleed cover images when clamping', () => {
    // 90° rotated image: widthMm=100, heightMm=50 -> visual width=50, visual height=100
    const rotated = makeImageLayer({
      id: 'rot-1',
      xMm: 220,
      yMm: 100,
      widthMm: 100,
      heightMm: 50,
      rotationDeg: 90,
    });
    const studioRot: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [rotated],
    };
    const nudgedRot = nudgeSelectedInStudio(
      studioRot,
      { imageId: 'rot-1', textId: null, ornamentId: null },
      100,
      100,
      CANVAS_BOUNDS,
    )!;
    const vis = getLayerVisualRect(nudgedRot.layers[0]);
    expect(vis.x + vis.width).toBeCloseTo(CANVAS_BOUNDS.width, 2);
    expect(vis.y + vis.height).toBeCloseTo(CANVAS_BOUNDS.height, 2);

    // Oversized full-bleed image wider than canvasBounds (400 x 300 on 320 x 240)
    const oversized = makeImageLayer({
      id: 'bleed-1',
      xMm: -40,
      yMm: -30,
      widthMm: 400,
      heightMm: 300,
    });
    const studioBleed: CoverStudioState = {
      ...CoverStudioModel.createDefault(),
      layers: [oversized],
    };
    const nudgedRight = nudgeSelectedInStudio(
      studioBleed,
      { imageId: 'bleed-1', textId: null, ornamentId: null },
      200,
      200,
      CANVAS_BOUNDS,
    )!;
    expect(nudgedRight.layers[0].xMm).toBe(0);
    expect(nudgedRight.layers[0].yMm).toBe(0);

    const nudgedLeft = nudgeSelectedInStudio(
      studioBleed,
      { imageId: 'bleed-1', textId: null, ornamentId: null },
      -200,
      -200,
      CANVAS_BOUNDS,
    )!;
    expect(nudgedLeft.layers[0].xMm).toBe(-80); // 320 - 400
    expect(nudgedLeft.layers[0].yMm).toBe(-60); // 240 - 300
  });

  it('nudges selected pocket image and returns null on invalid selection or non-finite deltas', () => {
    const pocketBounds: Rect2D = { x: 10, y: 10, width: 140, height: 200 };
    const layers = [makeImageLayer({ id: 'p-1', xMm: 20, yMm: 30, widthMm: 50, heightMm: 50 })];

    const nudged = nudgeSelectedInPockets(layers, 'p-1', -50, 5, pocketBounds)!;
    expect(nudged[0].xMm).toBe(10); // clamped to pocketBounds.x
    expect(nudged[0].yMm).toBe(35);
    expect(layers[0].xMm).toBe(20); // immutable

    expect(nudgeSelectedInPockets(layers, null, 1, 0, pocketBounds)).toBeNull();
    expect(nudgeSelectedInPockets(layers, 'missing', 1, 0, pocketBounds)).toBeNull();
    expect(nudgeSelectedInPockets(layers, 'p-1', Number.NaN, 0, pocketBounds)).toBeNull();

    const studio = makeStudioWithAllElements();
    expect(
      nudgeSelectedInStudio(
        studio,
        { imageId: null, textId: null, ornamentId: null },
        1,
        0,
        CANVAS_BOUNDS,
      ),
    ).toBeNull();
    expect(
      nudgeSelectedInStudio(
        studio,
        { imageId: 'img-1', textId: null, ornamentId: null },
        Number.POSITIVE_INFINITY,
        0,
        CANVAS_BOUNDS,
      ),
    ).toBeNull();
  });
});

describe('isEditableKeyboardTarget', () => {
  it('returns true for input, textarea, select, and contentEditable elements', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');

    const editableTrue = document.createElement('div');
    editableTrue.setAttribute('contenteditable', 'true');

    const editableEmpty = document.createElement('div');
    editableEmpty.setAttribute('contenteditable', '');

    const editablePlaintext = document.createElement('div');
    editablePlaintext.setAttribute('contenteditable', 'plaintext-only');

    const nestedChild = document.createElement('span');
    editableTrue.appendChild(nestedChild);

    const textNode = document.createTextNode('hello');
    nestedChild.appendChild(textNode);

    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
    expect(isEditableKeyboardTarget(select)).toBe(true);
    expect(isEditableKeyboardTarget(editableTrue)).toBe(true);
    expect(isEditableKeyboardTarget(editableEmpty)).toBe(true);
    expect(isEditableKeyboardTarget(editablePlaintext)).toBe(true);
    expect(isEditableKeyboardTarget(nestedChild)).toBe(true);
    expect(isEditableKeyboardTarget(textNode)).toBe(true);
  });

  it('returns false for non-editable targets and explicit contenteditable="false"', () => {
    const button = document.createElement('button');
    const div = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const editableFalse = document.createElement('div');
    editableFalse.setAttribute('contenteditable', 'false');

    const editableParent = document.createElement('div');
    editableParent.setAttribute('contenteditable', 'true');
    const nonEditableChild = document.createElement('span');
    nonEditableChild.setAttribute('contenteditable', 'false');
    editableParent.appendChild(nonEditableChild);

    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(isEditableKeyboardTarget(window)).toBe(false);
    expect(isEditableKeyboardTarget(document.body)).toBe(false);
    expect(isEditableKeyboardTarget(button)).toBe(false);
    expect(isEditableKeyboardTarget(div)).toBe(false);
    expect(isEditableKeyboardTarget(svg)).toBe(false);
    expect(isEditableKeyboardTarget(editableFalse)).toBe(false);
    expect(isEditableKeyboardTarget(nonEditableChild)).toBe(false);
  });
});
