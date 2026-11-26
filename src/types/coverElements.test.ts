import { describe, expect, it } from 'vitest';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
  rotateOrnament90,
  type CoverOrnamentLayer,
} from './coverElements';
import { CoverStudioModel } from './studio';

describe('CoverTextLayerModel & CoverOrnamentLayerModel', () => {
  const frontBoard = { x: 200, y: 21, width: 143, height: 223 };
  const backBoard = { x: 21, y: 21, width: 143, height: 223 };
  const spineRect = { x: 173, y: 21, width: 26, height: 223 };

  it('creates classic Front Title, Front Author, and Back Blurb presets centered on their target boards', () => {
    const title = CoverTextLayerModel.createPreset('front-title', frontBoard);
    expect(title.zone).toBe('front');
    expect(title.xMm).toBeCloseTo(frontBoard.x + frontBoard.width / 2, 1);
    expect(title.yMm).toBeLessThan(frontBoard.y + frontBoard.height * 0.5);
    expect(title.uppercase).toBe(true);

    const author = CoverTextLayerModel.createPreset('front-author', frontBoard);
    expect(author.zone).toBe('front');
    expect(author.yMm).toBeGreaterThan(frontBoard.y + frontBoard.height * 0.6);

    const blurb = CoverTextLayerModel.createPreset('back-blurb', backBoard);
    expect(blurb.zone).toBe('back');
    expect(CoverTextLayerModel.displayLines(blurb)).toHaveLength(2);
    const bounds = CoverTextLayerModel.estimateBounds(blurb);
    expect(bounds.width).toBeGreaterThan(10);
    expect(bounds.height).toBeGreaterThan(6);
  });

  it('creates parametric ornaments sized appropriately for frames, dividers, emblems, and spine bands', () => {
    const frame = CoverOrnamentLayerModel.createForZone('frame-double-rule', frontBoard, 'front');
    expect(frame.widthMm).toBeLessThan(frontBoard.width);
    expect(frame.widthMm).toBeGreaterThan(frontBoard.width - 30);

    const divider = CoverOrnamentLayerModel.createForZone('divider-fleuron-leaf', frontBoard, 'front');
    expect(divider.widthMm).toBeLessThan(frontBoard.width * 0.7);
    expect(divider.heightMm).toBeLessThan(20);

    const spineBands = CoverOrnamentLayerModel.createForZone('spine-classic-bands', spineRect, 'spine');
    expect(spineBands.zone).toBe('spine');
    expect(spineBands.widthMm).toBeLessThanOrEqual(spineRect.width);

    const scaled = CoverOrnamentLayerModel.scaleAroundCenter(divider, 1.25);
    expect(scaled.widthMm).toBeGreaterThan(divider.widthMm);
  });

  it('round-trips textLayers and ornaments cleanly through CoverStudioModel serialize/deserialize', () => {
    const title = {
      ...CoverTextLayerModel.createPreset('front-title', frontBoard, {
        color: '#d9b566',
        fontId: 'cormorant-garamond',
      }),
      flipX: true,
      flipY: true,
      rotationDeg: 90 as const,
    };
    const orn: CoverOrnamentLayer = {
      ...CoverOrnamentLayerModel.createForZone(
        'frame-art-deco',
        frontBoard,
        'front',
        '#d9b566',
      ),
      flipX: true,
      rotationDeg: 270,
    };
    const state = {
      ...CoverStudioModel.createDefault(),
      textLayers: [title],
      ornaments: [orn],
    };

    const serialized = CoverStudioModel.serialize(state, { includeImageData: false });
    const restored = CoverStudioModel.deserialize(serialized);
    expect(restored.textLayers).toHaveLength(1);
    expect(restored.textLayers[0].text).toBe('BOOK TITLE');
    expect(restored.textLayers[0].fontId).toBe('cormorant-garamond');
    expect(restored.textLayers[0].flipX).toBe(true);
    expect(restored.textLayers[0].flipY).toBe(true);
    expect(restored.textLayers[0].rotationDeg).toBe(90);
    expect(restored.ornaments).toHaveLength(1);
    expect(restored.ornaments[0].presetId).toBe('frame-art-deco');
    expect(restored.ornaments[0].flipX).toBe(true);
    expect(restored.ornaments[0].flipY).toBeUndefined();
    expect(restored.ornaments[0].rotationDeg).toBe(270);

    // rotateOrnament90 swaps width/height around center and cycles 0 -> 90 -> 180 -> 270 -> 0
    const divider = CoverOrnamentLayerModel.createForZone('divider-fleuron-leaf', frontBoard, 'front');
    const origCx = divider.xMm + divider.widthMm / 2;
    const origCy = divider.yMm + divider.heightMm / 2;
    const r90 = rotateOrnament90(divider);
    expect(r90.rotationDeg).toBe(90);
    expect(r90.widthMm).toBeCloseTo(divider.heightMm, 2);
    expect(r90.heightMm).toBeCloseTo(divider.widthMm, 2);
    expect(r90.xMm + r90.widthMm / 2).toBeCloseTo(origCx, 1);
    expect(r90.yMm + r90.heightMm / 2).toBeCloseTo(origCy, 1);

    const r180 = rotateOrnament90(r90);
    expect(r180.rotationDeg).toBe(180);
    expect(r180.widthMm).toBeCloseTo(divider.widthMm, 2);
    const r270 = rotateOrnament90(r180);
    expect(r270.rotationDeg).toBe(270);
    const r0 = rotateOrnament90(r270);
    expect(r0.rotationDeg).toBe(0);
    expect(r0.widthMm).toBeCloseTo(divider.widthMm, 2);
    expect(r0.heightMm).toBeCloseTo(divider.heightMm, 2);
  });

  it('fits frames/corners to exact inset margins and preserves aspect ratio for emblems & custom SVG stamps', () => {
    const frame: CoverOrnamentLayer = {
      ...CoverOrnamentLayerModel.createForZone('frame-double-rule', frontBoard, 'front', '#d9b566'),
      strokeWidthMm: 1.15,
      flipX: true,
      flipY: true,
    };

    const tightFrame = CoverOrnamentLayerModel.fitInsideBoardWithMargin(frame, frontBoard, 6);
    expect(tightFrame.xMm).toBeCloseTo(frontBoard.x + 6, 2);
    expect(tightFrame.yMm).toBeCloseTo(frontBoard.y + 6, 2);
    expect(tightFrame.widthMm).toBeCloseTo(frontBoard.width - 12, 2);
    expect(tightFrame.heightMm).toBeCloseTo(frontBoard.height - 12, 2);
    expect(tightFrame.id).toBe(frame.id);
    expect(tightFrame.color).toBe('#d9b566');
    expect(tightFrame.strokeWidthMm).toBe(1.15);
    expect(tightFrame.flipX).toBe(true);
    expect(tightFrame.flipY).toBe(true);

    const wideFrame = CoverOrnamentLayerModel.fitInsideBoardWithMargin(frame, frontBoard, 18);
    expect(wideFrame.xMm).toBeCloseTo(frontBoard.x + 18, 2);
    expect(wideFrame.yMm).toBeCloseTo(frontBoard.y + 18, 2);
    expect(wideFrame.widthMm).toBeCloseTo(frontBoard.width - 36, 2);
    expect(wideFrame.heightMm).toBeCloseTo(frontBoard.height - 36, 2);

    // Custom non-square SVG stamp (2:1 aspect ratio) must preserve exact aspect ratio centered in inset rect
    const customSvg: CoverOrnamentLayer = {
      ...CoverOrnamentLayerModel.createCustomSvg({
        name: 'crest-banner',
        paths: ['M 0 0 L 200 0 L 200 100 L 0 100 Z'],
        viewBoxWidth: 200,
        viewBoxHeight: 100,
        renderMode: 'fill-and-stroke',
        targetBoardRectMm: frontBoard,
        zone: 'front',
        color: '#f5efe2',
      }),
      flipX: true,
    };
    const fittedSvg = CoverOrnamentLayerModel.fitInsideBoardWithMargin(customSvg, frontBoard, 12);
    const expectedWidth = frontBoard.width - 24; // 119 mm
    const expectedHeight = expectedWidth / 2; // 59.5 mm (2:1 preserved)
    expect(fittedSvg.widthMm).toBeCloseTo(expectedWidth, 1);
    expect(fittedSvg.heightMm).toBeCloseTo(expectedHeight, 1);
    expect(fittedSvg.widthMm / fittedSvg.heightMm).toBeCloseTo(2, 2);
    expect(fittedSvg.xMm + fittedSvg.widthMm / 2).toBeCloseTo(
      frontBoard.x + frontBoard.width / 2,
      1,
    );
    expect(fittedSvg.yMm + fittedSvg.heightMm / 2).toBeCloseTo(
      frontBoard.y + frontBoard.height / 2,
      1,
    );
    expect(fittedSvg.customSvgName).toBe('crest-banner');
    expect(fittedSvg.customSvgPaths).toEqual(customSvg.customSvgPaths);
    expect(fittedSvg.customSvgViewBox).toEqual({ width: 200, height: 100 });
    expect(fittedSvg.customSvgRenderMode).toBe('fill-and-stroke');
    expect(fittedSvg.flipX).toBe(true);

    // Square emblem stays square inside inset rect
    const emblem = CoverOrnamentLayerModel.createForZone('emblem-compass-rose', frontBoard, 'front');
    const fittedEmblem = CoverOrnamentLayerModel.fitInsideBoardWithMargin(emblem, frontBoard, 18);
    expect(fittedEmblem.widthMm).toBeCloseTo(fittedEmblem.heightMm, 2);
    expect(fittedEmblem.widthMm).toBeCloseTo(frontBoard.width - 36, 1);

    // centerInBoard centers xMm/yMm cleanly without altering widthMm/heightMm
    const offsetEmblem: CoverOrnamentLayer = {
      ...emblem,
      xMm: frontBoard.x + 5,
      yMm: frontBoard.y + 8,
    };
    const centered = CoverOrnamentLayerModel.centerInBoard(offsetEmblem, frontBoard);
    expect(centered.widthMm).toBe(offsetEmblem.widthMm);
    expect(centered.heightMm).toBe(offsetEmblem.heightMm);
    expect(centered.xMm + centered.widthMm / 2).toBeCloseTo(frontBoard.x + frontBoard.width / 2, 1);
    expect(centered.yMm + centered.heightMm / 2).toBeCloseTo(
      frontBoard.y + frontBoard.height / 2,
      1,
    );
  });

  it('serializes and deserializes optional series-spine origin on text and ornament layers', () => {
    const seriesText = {
      ...CoverTextLayerModel.createPreset('front-title', frontBoard),
      id: 'series-vol-badge',
      origin: 'series-spine' as const,
    };
    const plainText = CoverTextLayerModel.createPreset('front-author', frontBoard);

    const serializedSeriesText = CoverTextLayerModel.serialize(seriesText);
    expect(serializedSeriesText.origin).toBe('series-spine');
    expect(CoverTextLayerModel.deserialize(serializedSeriesText)?.origin).toBe('series-spine');

    const serializedPlainText = CoverTextLayerModel.serialize(plainText);
    expect('origin' in serializedPlainText).toBe(false);
    const invalidTextOrigin = CoverTextLayerModel.deserialize({
      ...plainText,
      origin: 'other',
    });
    expect(invalidTextOrigin?.origin).toBeUndefined();
    expect('origin' in invalidTextOrigin!).toBe(false);

    const seriesOrn: CoverOrnamentLayer = {
      ...CoverOrnamentLayerModel.createForZone('emblem-compass-rose', spineRect, 'spine'),
      id: 'series-ornament',
      origin: 'series-spine',
    };
    const plainOrn = CoverOrnamentLayerModel.createForZone('frame-single-rule', frontBoard, 'front');

    const serializedSeriesOrn = CoverOrnamentLayerModel.serialize(seriesOrn);
    expect(serializedSeriesOrn.origin).toBe('series-spine');
    expect(CoverOrnamentLayerModel.deserialize(serializedSeriesOrn)?.origin).toBe('series-spine');

    const serializedPlainOrn = CoverOrnamentLayerModel.serialize(plainOrn);
    expect('origin' in serializedPlainOrn).toBe(false);
    const invalidOrnOrigin = CoverOrnamentLayerModel.deserialize({
      ...plainOrn,
      origin: 'invalid',
    });
    expect(invalidOrnOrigin?.origin).toBeUndefined();
    expect('origin' in invalidOrnOrigin!).toBe(false);
  });
});
