import { describe, expect, it } from 'vitest';
import {
  CoverImageLayerModel,
  LAYER_MIN_SIZE_MM,
  getLayerVisualRect,
  nextQuarterTurn,
  normalizeQuarterTurn,
} from './studioLayer';

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
      flipX: true,
      flipY: false,
    });
    expect(valid?.clipZone).toBe('front');
    expect(valid?.flipX).toBe(true);
    expect(valid?.flipY).toBeUndefined();
    const fitted = CoverImageLayerModel.fitToRect(
      { ...valid!, flipY: true },
      sampleRect,
      'back',
    );
    expect(fitted.flipX).toBe(true);
    expect(fitted.flipY).toBe(true);
    expect(CoverImageLayerModel.deserialize({ dataUrl: 'javascript:alert(1)' })).toBeNull();
    expect(CoverImageLayerModel.deserialize(null)).toBeNull();
  });

  it('normalizes quarter turns, computes visual bounds, and fits/resizes rotated layers cleanly', () => {
    expect(normalizeQuarterTurn(undefined)).toBe(0);
    expect(normalizeQuarterTurn(0)).toBe(0);
    expect(normalizeQuarterTurn(90)).toBe(90);
    expect(normalizeQuarterTurn(180)).toBe(180);
    expect(normalizeQuarterTurn(270)).toBe(270);
    expect(normalizeQuarterTurn(360)).toBe(0);
    expect(normalizeQuarterTurn(-90)).toBe(270);
    expect(normalizeQuarterTurn('90')).toBe(0);

    expect(nextQuarterTurn(undefined)).toBe(90);
    expect(nextQuarterTurn(0)).toBe(90);
    expect(nextQuarterTurn(90)).toBe(180);
    expect(nextQuarterTurn(180)).toBe(270);
    expect(nextQuarterTurn(270)).toBe(0);

    // Visual rect swaps width & height around center for 90° and 270°
    const rect0 = getLayerVisualRect({ xMm: 10, yMm: 20, widthMm: 100, heightMm: 50, rotationDeg: 0 });
    expect(rect0).toEqual({ x: 10, y: 20, width: 100, height: 50 });

    const rect90 = getLayerVisualRect({ xMm: 10, yMm: 20, widthMm: 100, heightMm: 50, rotationDeg: 90 });
    expect(rect90).toEqual({ x: 35, y: -5, width: 50, height: 100 });
    expect(rect90.x + rect90.width / 2).toBeCloseTo(60, 4);
    expect(rect90.y + rect90.height / 2).toBeCloseTo(45, 4);

    // Fitting a 90°-rotated landscape image (2000×1000) to a portrait cover (160×260) fills cleanly
    const landscape = CoverImageLayerModel.createInRect({
      id: 'rot-1',
      dataUrl: 'data:image/png;base64,abc',
      fileName: 'landscape.png',
      naturalWidth: 2000,
      naturalHeight: 1000,
      targetRect: sampleRect,
    });
    const rotatedFitted = CoverImageLayerModel.fitToRect(
      { ...landscape, rotationDeg: 90 },
      sampleRect,
      'front',
    );
    expect(rotatedFitted.rotationDeg).toBe(90);
    expect(rotatedFitted.widthMm / rotatedFitted.heightMm).toBeCloseTo(2, 2);
    const vis = getLayerVisualRect(rotatedFitted);
    expect(vis.width).toBeCloseTo(sampleRect.width, 1);
    expect(vis.height).toBeGreaterThanOrEqual(sampleRect.height - 0.1);
    expect(vis.x + vis.width / 2).toBeCloseTo(sampleRect.x + sampleRect.width / 2, 1);
    expect(vis.y + vis.height / 2).toBeCloseTo(sampleRect.y + sampleRect.height / 2, 1);

    // Corner resize of a 90°-rotated layer anchors opposite visual corner and preserves aspect
    const resizedRot = CoverImageLayerModel.resizeFromCorner(
      rotatedFitted,
      'se',
      vis.x + vis.width + 40,
      vis.y + vis.height + 80,
    );
    const resizedVis = getLayerVisualRect(resizedRot);
    expect(resizedVis.x).toBeCloseTo(vis.x, 1);
    expect(resizedVis.y).toBeCloseTo(vis.y, 1);
    expect(resizedVis.width).toBeGreaterThan(vis.width + 30);

    // Deserialize preserves valid rotationDeg and drops 0/invalid
    const deserialized = CoverImageLayerModel.deserialize({
      ...rotatedFitted,
      rotationDeg: 270,
    });
    expect(deserialized?.rotationDeg).toBe(270);
    expect(CoverImageLayerModel.deserialize({ ...rotatedFitted, rotationDeg: 0 })?.rotationDeg).toBeUndefined();
  });
});
