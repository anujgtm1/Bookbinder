import { describe, expect, it } from 'vitest';
import { CoverImageLayerModel, LAYER_MIN_SIZE_MM } from './studioLayer';

describe('CoverImageLayerModel', () => {
  const sampleRect = { x: 200, y: 0, width: 160, height: 260 };

  it('creates a layer cover-fitted inside a target rect while preserving aspect ratio', () => {
    const layer = CoverImageLayerModel.createInRect({
      id: 'layer-1',
      dataUrl: 'data:image/png;base64,abc',
      fileName: 'front.png',
      naturalWidth: 1000,
      naturalHeight: 1000,
      targetRect: sampleRect,
    });

    expect(layer.widthMm).toBeCloseTo(260, 2);
    expect(layer.heightMm).toBeCloseTo(260, 2);
    expect(layer.xMm).toBeCloseTo(200 + (160 - 260) / 2, 2);
    expect(layer.yMm).toBeCloseTo(0, 2);
    expect(layer.clipZone).toBe('none');
  });

  it('moves, scales around center, and resizes proportionally from corner handles', () => {
    const layer = CoverImageLayerModel.createInRect({
      id: 'layer-2',
      dataUrl: 'data:image/png;base64,abc',
      fileName: 'art.png',
      naturalWidth: 200,
      naturalHeight: 100,
      targetRect: { x: 0, y: 0, width: 100, height: 50 },
    });

    const moved = CoverImageLayerModel.moveBy(layer, 15, -10);
    expect(moved.xMm).toBe(15);
    expect(moved.yMm).toBe(-10);

    const scaled = CoverImageLayerModel.scaleAroundCenter(layer, 2);
    expect(scaled.widthMm).toBeCloseTo(200, 2);
    expect(scaled.heightMm).toBeCloseTo(100, 2);
    expect(scaled.xMm + scaled.widthMm / 2).toBeCloseTo(50, 2);
    expect(scaled.yMm + scaled.heightMm / 2).toBeCloseTo(25, 2);

    // Drag SE corner from (100, 50) to (150, 75) while anchoring NW (0, 0)
    const resizedSe = CoverImageLayerModel.resizeFromCorner(layer, 'se', 150, 75);
    expect(resizedSe.xMm).toBeCloseTo(0, 2);
    expect(resizedSe.yMm).toBeCloseTo(0, 2);
    expect(resizedSe.widthMm).toBeCloseTo(150, 2);
    expect(resizedSe.heightMm).toBeCloseTo(75, 2);

    // Drag NW corner while anchoring SE (100, 50)
    const resizedNw = CoverImageLayerModel.resizeFromCorner(layer, 'nw', 50, 25);
    expect(resizedNw.xMm + resizedNw.widthMm).toBeCloseTo(100, 2);
    expect(resizedNw.yMm + resizedNw.heightMm).toBeCloseTo(50, 2);
    expect(resizedNw.widthMm).toBeCloseTo(50, 2);

    // Clamps to minimum physical size
    const tiny = CoverImageLayerModel.scaleAroundCenter(layer, 0.001);
    expect(tiny.heightMm).toBeGreaterThanOrEqual(LAYER_MIN_SIZE_MM);
  });

  it('reorders layers forward and backward safely', () => {
    const mk = (id: string) =>
      CoverImageLayerModel.createInRect({
        id,
        dataUrl: 'data:image/png;base64,x',
        fileName: `${id}.png`,
        naturalWidth: 100,
        naturalHeight: 100,
        targetRect: sampleRect,
      });

    const list = [mk('a'), mk('b'), mk('c')];
    expect(CoverImageLayerModel.reorder(list, 'a', 'forward').map((l) => l.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(CoverImageLayerModel.reorder(list, 'c', 'backward').map((l) => l.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(CoverImageLayerModel.reorder(list, 'a', 'backward').map((l) => l.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('deserializes valid layers and rejects non-image dataUrls', () => {
    const valid = CoverImageLayerModel.deserialize({
      id: 'abc',
      dataUrl: 'data:image/png;base64,123',
      fileName: 'cover.png',
      naturalWidth: 500,
      naturalHeight: 800,
      xMm: 10,
      yMm: 20,
      widthMm: 100,
      heightMm: 160,
      clipZone: 'front',
    });
    expect(valid?.clipZone).toBe('front');
    expect(CoverImageLayerModel.deserialize({ dataUrl: 'javascript:alert(1)' })).toBeNull();
    expect(CoverImageLayerModel.deserialize(null)).toBeNull();
  });
});
