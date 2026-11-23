import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverImageLayerModel } from '@/types/studioLayer';
import { PRINT_DPI } from '@/types/units';
import { computeStudioCanvasSpec } from './renderEngine';
import { buildCanvasSnapTargets, snapLayerMove, snapLayerResize } from './snapGuides';

describe('snapGuides', () => {
  it('snaps a moving layer magnetically to Front Board hinge, Spine Center, and Board Top', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);
    const targets = buildCanvasSnapTargets(geom, spec);

    const frontBoardLeft = spec.bleedMm + geom.outerWrap.frontBoardRect.x;
    const frontBoardTop = spec.bleedMm + geom.outerWrap.frontBoardRect.y;

    // Layer is 2.1 mm away from front board left & 1.8 mm away from board top
    const nearLayer = CoverImageLayerModel.createInRect({
      id: 'layer-1',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front.png',
      naturalWidth: 1000,
      naturalHeight: 1500,
      targetRect: { x: frontBoardLeft + 2.1, y: frontBoardTop - 1.8, width: 100, height: 150 },
      mode: 'contain',
    });

    const snapped = snapLayerMove(nearLayer, targets, 3.5);
    expect(snapped.layer.xMm).toBeCloseTo(frontBoardLeft, 1);
    expect(snapped.layer.yMm).toBeCloseTo(frontBoardTop, 1);
    expect(snapped.guides).toHaveLength(2);
    expect(snapped.guides.some((g) => g.label === 'FRONT HINGE')).toBe(true);
    expect(snapped.guides.some((g) => g.label === 'BOARD TOP')).toBe(true);
  });

  it('does not snap when layer is outside the threshold distance', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);
    const targets = buildCanvasSnapTargets(geom, spec);

    const farLayer = {
      id: 'layer-far',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'far.png',
      naturalWidth: 1000,
      naturalHeight: 1000,
      xMm: 50,
      yMm: 50,
      widthMm: 40,
      heightMm: 40,
      clipZone: 'none' as const,
    };

    const result = snapLayerMove(farLayer, targets, 2.0);
    expect(result.guides).toHaveLength(0);
    expect(result.layer.xMm).toBe(50);
    expect(result.layer.yMm).toBe(50);
  });

  it('snaps corner resize cleanly onto a board boundary while preserving aspect ratio', () => {
    const geom = calculateCaseGeometry(BookParametersModel.createDefault());
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);
    const targets = buildCanvasSnapTargets(geom, spec);

    const frontRight = spec.bleedMm + geom.outerWrap.frontBoardRect.x + geom.outerWrap.frontBoardRect.width;
    const orig = {
      id: 'layer-r',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'art.png',
      naturalWidth: 1000,
      naturalHeight: 1000,
      xMm: frontRight - 80,
      yMm: 40,
      widthMm: 60,
      heightMm: 60,
      clipZone: 'none' as const,
    };

    // Drag SE handle within 1.5 mm of frontRight
    const res = snapLayerResize(orig, 'se', frontRight - 1.5, 118, targets, 3.5);
    expect(res.layer.xMm + res.layer.widthMm).toBeCloseTo(frontRight, 1);
    expect(res.guides.some((g) => g.axis === 'x' && g.label === 'FRONT EDGE')).toBe(true);
  });
});
