import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { BOOK_3D_PRESETS, Book3DModel, DEFAULT_BOOK_3D_ANGLE } from './book3d';

describe('Book3DModel', () => {
  it('scales physical millimeter board and spine dimensions proportionally with recessed page block', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const dims = Book3DModel.computeDimensionsPx(geom, 310, 260);

    expect(dims.heightPx).toBeCloseTo(310, 0);
    expect(dims.widthPx).toBeCloseTo(
      (geom.cutList.coverBoards.widthMm / geom.cutList.coverBoards.heightMm) * 310,
      0,
    );
    expect(dims.depthPx).toBeCloseTo(
      (geom.cutList.spineStrip.widthMm / geom.cutList.coverBoards.heightMm) * 310,
      0,
    );
    expect(dims.pageHeightPx).toBeLessThan(dims.heightPx);
    expect(dims.pageWidthPx).toBeLessThan(dims.widthPx);
    expect(dims.pageDepthPx).toBeLessThan(dims.depthPx);
  });

  it('clamps pitch and wraps yaw cleanly during pointer orbit', () => {
    const orbited = Book3DModel.orbitByPointerDelta({ yawDeg: 170, pitchDeg: 0 }, 40, -200, 0.5);
    expect(orbited.yawDeg).toBeCloseTo(-170, 1);
    expect(orbited.pitchDeg).toBe(45);

    const downward = Book3DModel.orbitByPointerDelta({ yawDeg: 0, pitchDeg: 0 }, 0, 250, 0.5);
    expect(downward.pitchDeg).toBe(-45);
  });

  it('matches known angle presets and returns null for custom orbit angles', () => {
    expect(Book3DModel.matchPreset(DEFAULT_BOOK_3D_ANGLE)).toBe('front-three-quarter');
    expect(Book3DModel.matchPreset(BOOK_3D_PRESETS[1].angle)).toBe('spine');
    expect(Book3DModel.matchPreset({ yawDeg: 57, pitchDeg: -22 })).toBeNull();
  });

  it('uses flush 0-overhang cardstock proportions for paperback-wrap and thin wrap proportions for dust-jacket', () => {
    const pbGeom = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const pbDims = Book3DModel.computeDimensionsPx(pbGeom, 310, 260);
    expect(pbDims.pageInsetPx).toBe(0);
    expect(pbDims.pageWidthPx).toBe(pbDims.widthPx);
    expect(pbDims.pageHeightPx).toBe(pbDims.heightPx);
    expect(pbDims.boardThicknessPx).toBe(0.8);

    const djGeom = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const djDims = Book3DModel.computeDimensionsPx(djGeom, 310, 260);
    expect(djDims.pageInsetPx).toBe(1);
    expect(djDims.boardThicknessPx).toBe(1.2);
  });
});
