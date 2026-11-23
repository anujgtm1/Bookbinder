import { describe, expect, it } from 'vitest';
import {
  CoverOrnamentLayerModel,
  CoverTextLayerModel,
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
    const title = CoverTextLayerModel.createPreset('front-title', frontBoard, {
      color: '#d9b566',
      fontId: 'cormorant-garamond',
    });
    const orn: CoverOrnamentLayer = CoverOrnamentLayerModel.createForZone(
      'frame-art-deco',
      frontBoard,
      'front',
      '#d9b566',
    );
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
    expect(restored.ornaments).toHaveLength(1);
    expect(restored.ornaments[0].presetId).toBe('frame-art-deco');
  });
});
